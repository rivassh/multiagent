#!/usr/bin/env node
/**
 * validate_transitions.js
 * Validates all task status transitions in Git history against the exhaustive transition table.
 * 
 * Usage: node scripts/validate_transitions.js [--since=<rev-range>] [--all]
 * Exit codes: 0=PASS, 1=FAIL (protocol violation), 2=ERROR
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Exhaustive valid transitions (from GITOPS_PROTOCOL.md)
const VALID_TRANSITIONS = new Set([
  'TODO->IN_PROGRESS',
  'IN_PROGRESS->NEEDS_QA',
  'IN_PROGRESS->REVISE',
  'NEEDS_QA->QA_PASSED',
  'NEEDS_QA->QA_FAILED',
  'QA_PASSED->NEEDS_REVIEW',
  'QA_FAILED->REVISE',
  'NEEDS_REVIEW->IN_REVIEW',
  'IN_REVIEW->DONE',
  'IN_REVIEW->REVISE',
  'REVISE->IN_PROGRESS',
  'DONE->STAGE_VERIFIED',
]);

const TASK_PATTERNS = {
  sima: /^TASK-\d{3}$/,
  hr: /^TASK-HR-\d{3}$/,
  omr: /^TASK-OMR-\d{3}$/,
};

function parseArgs() {
  const args = process.argv.slice(2);
  const options = { since: null, all: false };
  for (const arg of args) {
    if (arg.startsWith('--since=')) options.since = arg.slice('--since='.length);
    else if (arg === '--all') options.all = true;
    else if (arg.startsWith('--')) {
      console.error(`Unknown option: ${arg}`);
      process.exit(2);
    }
  }
  return options;
}

function getGitLog(since) {
  const cmd = since
    ? `git log --oneline --reverse --format="%H %s" ${since} -- state/`
    : `git log --oneline --reverse --format="%H %s" -- state/`;
  try {
    return execSync(cmd, { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  } catch (e) {
    return [];
  }
}

function getTaskStateAtCommit(commitHash, taskId) {
  try {
    const content = execSync(`git show ${commitHash}:state/sima/tasks.json 2>/dev/null || git show ${commitHash}:state/candash/tasks.json 2>/dev/null || git show ${commitHash}:state/shared/tasks.json 2>/dev/null`, { encoding: 'utf8' });
    const data = JSON.parse(content);
    const task = data.tasks?.find(t => t.id === taskId);
    return task?.status || null;
  } catch {
    return null;
  }
}

function getAllTaskIds() {
  const partitions = ['sima', 'candash', 'shared'];
  const ids = new Set();
  for (const p of partitions) {
    try {
      const content = fs.readFileSync(path.join(__dirname, `../state/${p}/tasks.json`), 'utf8');
      const data = JSON.parse(content);
      for (const task of data.tasks || []) {
        ids.add(task.id);
      }
    } catch {}
  }
  return Array.from(ids);
}

function getPartitionForTask(taskId) {
  for (const [partition, pattern] of Object.entries(TASK_PATTERNS)) {
    if (pattern.test(taskId)) return partition;
  }
  return null;
}

function main() {
  const options = parseArgs();
  
  console.log('🔍 Validating task status transitions...');
  
  const taskIds = getAllTaskIds();
  if (taskIds.length === 0) {
    console.log('⚠️  No tasks found in state/*/tasks.json');
    process.exit(0);
  }
  
  console.log(`📋 Found ${taskIds.length} tasks to validate`);
  
  const commits = getGitLog(options.since);
  console.log(`📜 Analyzing ${commits.length} commits`);
  
  const violations = [];
  
  for (const taskId of taskIds) {
    const partition = getPartitionForTask(taskId);
    if (!partition) {
      violations.push({ taskId, error: 'Unknown task namespace' });
      continue;
    }
    
    let previousStatus = null;
    let firstSeen = true;
    
    for (const line of commits) {
      const [hash] = line.split(' ');
      const status = getTaskStateAtCommit(hash, taskId);
      
      if (status === null) continue;
      
      if (firstSeen) {
        previousStatus = status;
        firstSeen = false;
        continue;
      }
      
      if (status !== previousStatus) {
        const transition = `${previousStatus}->${status}`;
        if (!VALID_TRANSITIONS.has(transition)) {
          violations.push({
            taskId,
            commit: hash.slice(0, 8),
            from: previousStatus,
            to: status,
            transition,
            message: `INVALID TRANSITION: ${transition} not in valid transition table`
          });
        }
        previousStatus = status;
      }
    }
    
    // Also check current state
    try {
      const content = fs.readFileSync(path.join(__dirname, `../state/${partition}/tasks.json`), 'utf8');
      const data = JSON.parse(content);
      const task = data.tasks?.find(t => t.id === taskId);
      if (task && task.status !== previousStatus) {
        const transition = `${previousStatus}->${task.status}`;
        if (!VALID_TRANSITIONS.has(transition)) {
          violations.push({
            taskId,
            commit: 'WORKING_TREE',
            from: previousStatus,
            to: task.status,
            transition,
            message: `INVALID TRANSITION in working tree: ${transition}`
          });
        }
      }
    } catch {}
  }
  
  if (violations.length > 0) {
    console.error('\n❌ PROTOCOL VIOLATIONS FOUND:');
    for (const v of violations) {
      console.error(`  ${v.taskId} @ ${v.commit}: ${v.from} -> ${v.to} (${v.transition})`);
      console.error(`    ${v.message}`);
    }
    console.error(`\nTotal violations: ${violations.length}`);
    process.exit(1);
  }
  
  console.log('✅ All transitions valid');
  process.exit(0);
}

main();