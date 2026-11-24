#!/usr/bin/env node
/**
 * verify_role_separation.js
 * Enforces Author ≠ QA ≠ Reviewer for every task.
 * 
 * Usage: node scripts/verify_role_separation.js
 * Exit codes: 0=PASS, 1=FAIL (violation), 2=ERROR
 */

const fs = require('fs');
const path = require('path');

const PARTITIONS = ['sima', 'candash', 'shared'];

function main() {
  console.log('🔍 Verifying role separation (Author ≠ QA ≠ Reviewer)...');
  
  let totalTasks = 0;
  const violations = [];
  
  for (const partition of PARTITIONS) {
    const tasksFile = path.join(__dirname, `../state/${partition}/tasks.json`);
    if (!fs.existsSync(tasksFile)) continue;
    
    try {
      const content = fs.readFileSync(tasksFile, 'utf8');
      const data = JSON.parse(content);
      
      for (const task of data.tasks || []) {
        totalTasks++;
        
        const author = task.assigned_to;
        const qa = task.qa_engineer;
        const reviewer = task.reviewer;
        const stageVerifier = task.stage_verified_by;
        
        const roles = [
          { role: 'author', id: author },
          { role: 'qa', id: qa },
          { role: 'reviewer', id: reviewer },
          { role: 'stage_verifier', id: stageVerifier },
        ].filter(r => r.id && r.id !== 'unknown' && r.id !== 'null');
        
        // Check for duplicates
        const seen = new Map();
        for (const r of roles) {
          if (seen.has(r.id)) {
            violations.push({
              taskId: task.id,
              partition,
              identity: r.id,
              roles: [seen.get(r.id), r.role],
              message: `Identity ${r.id} acts as both ${seen.get(r.id)} and ${r.role}`
            });
          } else {
            seen.set(r.id, r.role);
          }
        }
        
        // Special check: if task is DONE or beyond, all three roles must be distinct
        const terminalStates = ['DONE', 'STAGE_VERIFIED'];
        if (terminalStates.includes(task.status) && roles.length >= 3) {
          const uniqueIds = new Set(roles.map(r => r.id));
          if (uniqueIds.size < 3) {
            violations.push({
              taskId: task.id,
              partition,
              message: `Terminal state ${task.status} requires 3 distinct identities (author, qa, reviewer)`
            });
          }
        }
      }
    } catch (e) {
      console.error(`Error reading ${tasksFile}:`, e.message);
      process.exit(2);
    }
  }
  
  console.log(`📋 Checked ${totalTasks} tasks across ${PARTITIONS.length} partitions`);
  
  if (violations.length > 0) {
    console.error('\n❌ ROLE SEPARATION VIOLATIONS:');
    for (const v of violations) {
      console.error(`  ${v.taskId} (${v.partition}): ${v.message}`);
      if (v.identity) console.error(`    Identity: ${v.identity} -> Roles: ${v.roles.join(', ')}`);
    }
    console.error(`\nTotal violations: ${violations.length}`);
    process.exit(1);
  }
  
  console.log('✅ Role separation verified');
  process.exit(0);
}

main();