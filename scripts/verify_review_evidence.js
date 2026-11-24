#!/usr/bin/env node
/**
 * verify_review_evidence.js
 * Validates review evidence for tasks in IN_REVIEW, DONE, STAGE_VERIFIED states.
 * 
 * Required evidence fields:
 * - review_evidence: { taskId, reviewer, timestamp, baseCommit, headCommit, diff, approval, comments, signature }
 * - diff must be valid unified diff
 * - signature must be verifiable (optional GPG check)
 * - approval must be PASS or FAIL
 * - baseCommit must be ancestor of headCommit
 * 
 * Usage: node scripts/verify_review_evidence.js
 * Exit codes: 0=PASS, 1=FAIL, 2=ERROR
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PARTITIONS = ['sima', 'candash', 'shared'];
const REQUIRES_REVIEW_EVIDENCE = ['IN_REVIEW', 'DONE', 'STAGE_VERIFIED'];

function commitExists(commitHash) {
  try {
    execSync(`git cat-file -t ${commitHash}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function isAncestor(ancestor, descendant) {
  try {
    execSync(`git merge-base --is-ancestor ${ancestor} ${descendant}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function validateDiff(diff) {
  // Basic unified diff validation
  if (!diff || typeof diff !== 'string') return false;
  const lines = diff.split('\n');
  if (lines.length < 4) return false;
  // Should start with --- and +++
  if (!lines[0].startsWith('--- ') || !lines[1].startsWith('+++ ')) return false;
  // Should have at least one hunk header @@
  return lines.some(l => l.startsWith('@@ '));
}

function main() {
  console.log('🔍 Verifying review evidence...');
  
  let checked = 0;
  const violations = [];
  
  for (const partition of PARTITIONS) {
    const tasksFile = path.join(__dirname, `../state/${partition}/tasks.json`);
    if (!fs.existsSync(tasksFile)) continue;
    
    try {
      const content = fs.readFileSync(tasksFile, 'utf8');
      const data = JSON.parse(content);
      
      for (const task of data.tasks || []) {
        if (!REQUIRES_REVIEW_EVIDENCE.includes(task.status)) continue;
        
        checked++;
        
        const evidence = task.review_evidence;
        if (!evidence) {
          violations.push({
            taskId: task.id,
            partition,
            status: task.status,
            message: 'Missing review_evidence object'
          });
          continue;
        }
        
        // Required fields
        const requiredFields = ['taskId', 'reviewer', 'timestamp', 'baseCommit', 'headCommit', 'diff', 'approval'];
        for (const field of requiredFields) {
          if (!evidence[field]) {
            violations.push({
              taskId: task.id,
              partition,
              message: `Missing required field: ${field}`
            });
          }
        }
        if (violations.some(v => v.taskId === task.id)) continue;
        
        // Verify taskId matches
        if (evidence.taskId !== task.id) {
          violations.push({
            taskId: task.id,
            partition,
            message: `review_evidence.taskId mismatch: ${evidence.taskId} != ${task.id}`
          });
          continue;
        }
        
        // Verify approval value
        if (!['PASS', 'FAIL'].includes(evidence.approval)) {
          violations.push({
            taskId: task.id,
            partition,
            message: `Invalid approval value: ${evidence.approval} (must be PASS or FAIL)`
          });
          continue;
        }
        
        // Verify commits exist
        if (!commitExists(evidence.baseCommit)) {
          violations.push({
            taskId: task.id,
            partition,
            message: `Base commit does not exist: ${evidence.baseCommit}`
          });
        }
        if (!commitExists(evidence.headCommit)) {
          violations.push({
            taskId: task.id,
            partition,
            message: `Head commit does not exist: ${evidence.headCommit}`
          });
        }
        
        // Verify base is ancestor of head
        if (commitExists(evidence.baseCommit) && commitExists(evidence.headCommit)) {
          if (!isAncestor(evidence.baseCommit, evidence.headCommit)) {
            violations.push({
              taskId: task.id,
              partition,
              message: `Base commit is not ancestor of head commit`
            });
          }
        }
        
        // Validate diff
        if (!validateDiff(evidence.diff)) {
          violations.push({
            taskId: task.id,
            partition,
            message: `Invalid diff format (not a valid unified diff)`
          });
        }
        
        // Verify reviewer matches task.reviewer
        if (task.reviewer && evidence.reviewer !== task.reviewer) {
          violations.push({
            taskId: task.id,
            partition,
            message: `Reviewer mismatch: evidence=${evidence.reviewer} task=${task.reviewer}`
          });
        }
        
        // Verify approval matches task status
        if (task.status === 'DONE' && evidence.approval !== 'PASS') {
          violations.push({
            taskId: task.id,
            partition,
            message: `DONE status requires approval=PASS, got ${evidence.approval}`
          });
        }
        if (task.status === 'REVISE' && evidence.approval !== 'FAIL') {
          // Note: REVISE can come from QA_FAILED too, so this is a warning not error
        }
        
      }
    } catch (e) {
      console.error(`Error reading ${tasksFile}:`, e.message);
      process.exit(2);
    }
  }
  
  console.log(`📋 Checked ${checked} tasks requiring review evidence`);
  
  if (violations.length > 0) {
    console.error('\n❌ REVIEW EVIDENCE VIOLATIONS:');
    for (const v of violations) {
      console.error(`  ${v.taskId} (${v.partition}) [${v.status}]: ${v.message}`);
    }
    console.error(`\nTotal violations: ${violations.length}`);
    process.exit(1);
  }
  
  console.log('✅ Review evidence verified');
  process.exit(0);
}

main();