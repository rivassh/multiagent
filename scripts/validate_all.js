#!/usr/bin/env node
/**
 * validate_all.js
 * Composite validation runner - executes all protocol validation scripts.
 * 
 * Usage: node scripts/validate_all.js [--json]
 * Exit codes: 0=ALL PASS, 1=ANY FAIL, 2=ERROR
 */

const { execSync } = require('child_process');
const path = require('path');

const SCRIPTS = [
  'validate_transitions.js',
  'verify_role_separation.js',
  'verify_qa_evidence.js',
  'verify_review_evidence.js',
  'verify_leases.js',
];

function main() {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');
  
  console.log('🚀 Running full protocol validation suite...\n');
  
  const results = [];
  let hasFailure = false;
  
  for (const script of SCRIPTS) {
    const scriptPath = path.join(__dirname, script);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`▶ ${script}`);
    console.log('='.repeat(60));
    
    try {
      const output = execSync(`node ${scriptPath}`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 60000,
      });
      
      results.push({ script, passed: true, output: output.trim() });
      console.log('✅ PASSED');
      
    } catch (e) {
      const exitCode = e.status;
      const output = e.stdout?.toString() || '';
      const stderr = e.stderr?.toString() || '';
      
      if (exitCode === 1) {
        results.push({ script, passed: false, output: (output + stderr).trim() });
        console.error('❌ FAILED');
        hasFailure = true;
      } else {
        results.push({ script, passed: false, error: true, output: (stderr || output).trim() });
        console.error('💥 ERROR');
        hasFailure = true;
      }
    }
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 VALIDATION SUMMARY');
  console.log('='.repeat(60));
  
  for (const r of results) {
    const icon = r.passed ? '✅' : (r.error ? '💥' : '❌');
    console.log(`  ${icon} ${r.script}`);
  }
  
  console.log(`\nTotal: ${results.length} | Passed: ${results.filter(r => r.passed).length} | Failed: ${results.filter(r => !r.passed).length}`);
  
  if (jsonOutput) {
    console.log('\n--- JSON OUTPUT ---');
    console.log(JSON.stringify({ results, hasFailure }, null, 2));
  }
  
  process.exit(hasFailure ? 1 : 0);
}

main();