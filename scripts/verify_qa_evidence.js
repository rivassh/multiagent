#!/usr/bin/env node
/**
 * verify_qa_evidence.js
 * Validates QA evidence for tasks in QA_PASSED, QA_FAILED, NEEDS_REVIEW, IN_REVIEW, DONE states.
 * 
 * Required evidence fields:
 * - qa_evidence: { taskId, qaEngineer, timestamp, gitCommit, testCommand, exitCode, stdout, stderr, evidenceHash }
 * - evidenceHash must equal sha256(stdout + stderr)
 * - gitCommit must exist in history
 * - exitCode must be 0 for QA_PASSED, non-zero for QA_FAILED
 * 
 * Usage: node scripts/verify_qa_evidence.js
 * Exit codes: 0=PASS, 1=FAIL (missing/invalid evidence), 2=ERROR
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const PARTITIONS = ['sima', 'candash', 'shared'];
const REQUIRES_QA_EVIDENCE = ['QA_PASSED', 'QA_FAILED', 'NEEDS_REVIEW', 'IN_REVIEW', 'DONE', 'STAGE_VERIFIED'];

function computeHash(stdout, stderr) {
  return crypto.createHash('sha256').update(stdout + stderr).digest('hex');
}

function commitExists(commitHash) {
  try {
    execSync(`git cat-file -t ${commitHash}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function main() {
  console.log('🔍 Verifying QA evidence...');
  
  let checked = 0;
  const violations = [];
  
  for (const partition of PARTITIONS) {
    const tasksFile = path.join(__dirname, `../state/${partition}/tasks.json`);
    if (!fs.existsSync(tasksFile)) continue;
    
    try {
      const content = fs.readFileSync(tasksFile, 'utf8');
      const data = JSON.parse(content);
      
      for (const task of data.tasks || []) {
        if (!REQUIRES_QA_EVIDENCE.includes(task.status)) continue;
        
        checked++;
        
        const evidence = task.qa_evidence;
        if (!evidence) {
          violations.push({
            taskId: task.id,
            partition,
            status: task.status,
            message: 'Missing qa_evidence object'
          });
          continue;
        }
        
        // Required fields
        const requiredFields = ['taskId', 'qaEngineer', 'timestamp', 'gitCommit', 'testCommand', 'exitCode', 'stdout', 'stderr', 'evidenceHash'];
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
            message: `qa_evidence.taskId mismatch: ${evidence.taskId} != ${task.id}`
          });
          continue;
        }
        
        // Verify hash
        const computedHash = computeHash(evidence.stdout || '', evidence.stderr || '');
        if (computedHash !== evidence.evidenceHash) {
          violations.push({
            taskId: task.id,
            partition,
            message: `Hash mismatch: computed=${computedHash.slice(0,16)}... stored=${evidence.evidenceHash.slice(0,16)}...`
          });
          continue;
        }
        
        // Verify commit exists
        if (!commitExists(evidence.gitCommit)) {
          violations.push({
            taskId: task.id,
            partition,
            message: `Referenced git commit does not exist: ${evidence.gitCommit}`
          });
          continue;
        }
        
        // Verify exit code matches status
        if (task.status === 'QA_PASSED' && evidence.exitCode !== 0) {
          violations.push({
            taskId: task.id,
            partition,
            message: `QA_PASSED requires exitCode=0, got ${evidence.exitCode}`
          });
        }
        if (task.status === 'QA_FAILED' && evidence.exitCode === 0) {
          violations.push({
            taskId: task.id,
            partition,
            message: `QA_FAILED requires non-zero exitCode, got 0`
          });
        }
        
        // Verify qaEngineer matches task.qa_engineer
        if (task.qa_engineer && evidence.qaEngineer !== task.qa_engineer) {
          violations.push({
            taskId: task.id,
            partition,
            message: `qaEngineer mismatch: evidence=${evidence.qaEngineer} task=${task.qa_engineer}`
          });
        }
        
      }
    } catch (e) {
      console.error(`Error reading ${tasksFile}:`, e.message);
      process.exit(2);
    }
  }
  
  console.log(`📋 Checked ${checked} tasks requiring QA evidence`);
  
  if (violations.length > 0) {
    console.error('\n❌ QA EVIDENCE VIOLATIONS:');
    for (const v of violations) {
      console.error(`  ${v.taskId} (${v.partition}) [${v.status}]: ${v.message}`);
    }
    console.error(`\nTotal violations: ${violations.length}`);
    process.exit(1);
  }
  
  console.log('✅ QA evidence verified');
  process.exit(0);
}

main();