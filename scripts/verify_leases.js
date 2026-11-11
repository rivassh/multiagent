#!/usr/bin/env node
/**
 * verify_leases.js
 * Validates lease consistency: active leases match task assignments, no expired leases held.
 * 
 * Checks:
 * - Active lease holder matches task.assigned_to / task.qa_engineer / task.reviewer
 * - No expired leases still held (should be auto-released)
 * - Lease role matches task phase
 * - No identity holds multiple role leases for same task
 * 
 * Usage: node scripts/verify_leases.js
 * Exit codes: 0=PASS, 1=FAIL, 2=ERROR
 */

const fs = require('fs');
const path = require('path');

const PARTITIONS = ['sima', 'candash', 'shared'];
const NOW = new Date();

function parseISO(dateStr) {
  try {
    return new Date(dateStr);
  } catch {
    return null;
  }
}

function isExpired(expiresAt) {
  const exp = parseISO(expiresAt);
  return exp && exp < NOW;
}

function main() {
  console.log('🔍 Verifying lease consistency...');
  
  const allViolations = [];
  let totalLeases = 0;
  let totalTasks = 0;
  
  for (const partition of PARTITIONS) {
    const leasesFile = path.join(__dirname, `../state/${partition}/leases.json`);
    const tasksFile = path.join(__dirname, `../state/${partition}/tasks.json`);
    
    let leases = { version: 1, leases: [] };
    let tasks = { version: 1, tasks: [] };
    
    try {
      if (fs.existsSync(leasesFile)) {
        leases = JSON.parse(fs.readFileSync(leasesFile, 'utf8'));
      }
      if (fs.existsSync(tasksFile)) {
        tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf8'));
      }
    } catch (e) {
      console.error(`Error reading ${partition} state:`, e.message);
      process.exit(2);
    }
    
    // Build task map
    const taskMap = new Map();
    for (const task of tasks.tasks || []) {
      taskMap.set(task.id, task);
      totalTasks++;
    }
    
    // Check each lease
    for (const lease of leases.leases || []) {
      totalLeases++;
      
      const { resource, holder, role, task_id, expires_at } = lease;
      
      // Check expiration
      if (isExpired(expires_at)) {
        allViolations.push({
          partition,
          leaseId: lease.lease_id,
          holder,
          resource,
          message: `EXPIRED LEASE still active (expired ${expires_at})`
        });
        continue;
      }
      
      // Find associated task
      const task = taskMap.get(task_id);
      if (!task) {
        allViolations.push({
          partition,
          leaseId: lease.lease_id,
          taskId: task_id,
          message: `Lease references non-existent task: ${task_id}`
        });
        continue;
      }
      
      // Verify holder matches task assignment for role
      let expectedHolder = null;
      switch (role) {
        case 'implementer':
          expectedHolder = task.assigned_to;
          break;
        case 'qa':
          expectedHolder = task.qa_engineer;
          break;
        case 'reviewer':
          expectedHolder = task.reviewer;
          break;
        case 'stage_verifier':
          expectedHolder = task.stage_verified_by;
          break;
      }
      
      if (expectedHolder && holder !== expectedHolder) {
        allViolations.push({
          partition,
          leaseId: lease.lease_id,
          taskId: task_id,
          role,
          holder,
          expectedHolder,
          message: `Lease holder mismatch for ${role}: lease=${holder} task=${expectedHolder}`
        });
      }
      
      // Verify task status matches lease role
      const validStatusForRole = {
        implementer: ['IN_PROGRESS'],
        qa: ['NEEDS_QA'],
        reviewer: ['NEEDS_REVIEW', 'IN_REVIEW'],
        stage_verifier: ['DONE'],
      };
      
      if (validStatusForRole[role] && !validStatusForRole[role].includes(task.status)) {
        allViolations.push({
          partition,
          leaseId: lease.lease_id,
          taskId: task_id,
          role,
          taskStatus: task.status,
          message: `Task status ${task.status} incompatible with ${role} lease`
        });
      }
    }
    
    // Check for tasks that should have leases but don't
    for (const task of tasks.tasks || []) {
      const activeLeases = (leases.leases || []).filter(l => 
        l.task_id === task.id && !isExpired(l.expires_at)
      );
      
      if (task.status === 'IN_PROGRESS' && !activeLeases.some(l => l.role === 'implementer')) {
        allViolations.push({
          partition,
          taskId: task.id,
          message: `IN_PROGRESS task missing implementer lease`
        });
      }
      if (task.status === 'NEEDS_QA' && !activeLeases.some(l => l.role === 'qa')) {
        // NEEDS_QA may not have active QA lease yet (waiting for QA to claim)
      }
      if (task.status === 'IN_REVIEW' && !activeLeases.some(l => l.role === 'reviewer')) {
        allViolations.push({
          partition,
          taskId: task.id,
          message: `IN_REVIEW task missing reviewer lease`
        });
      }
    }
    
    // Check for identity holding multiple role leases for same task
    const leasesByTask = new Map();
    for (const lease of leases.leases || []) {
      if (isExpired(lease.expires_at)) continue;
      const key = `${lease.task_id}:${lease.holder}`;
      if (!leasesByTask.has(key)) leasesByTask.set(key, []);
      leasesByTask.get(key).push(lease.role);
    }
    
    for (const [key, roles] of leasesByTask.entries()) {
      if (roles.length > 1) {
        const [taskId, holder] = key.split(':');
        allViolations.push({
          partition,
          taskId,
          holder,
          roles,
          message: `Identity holds multiple role leases for same task: ${roles.join(', ')}`
        });
      }
    }
  }
  
  console.log(`📋 Checked ${totalLeases} leases across ${totalTasks} tasks in ${PARTITIONS.length} partitions`);
  
  if (allViolations.length > 0) {
    console.error('\n❌ LEASE VIOLATIONS:');
    for (const v of allViolations) {
      const loc = v.partition ? `(${v.partition})` : '';
      const id = v.leaseId ? `lease:${v.leaseId}` : (v.taskId ? `task:${v.taskId}` : '');
      console.error(`  ${id} ${loc}: ${v.message}`);
      if (v.holder) console.error(`    Holder: ${v.holder}`);
      if (v.expectedHolder) console.error(`    Expected: ${v.expectedHolder}`);
      if (v.roles) console.error(`    Roles: ${v.roles.join(', ')}`);
    }
    console.error(`\nTotal violations: ${allViolations.length}`);
    process.exit(1);
  }
  
  console.log('✅ Lease consistency verified');
  process.exit(0);
}

main();