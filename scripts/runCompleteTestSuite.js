#!/usr/bin/env node

/**
 * Complete Performance Test Suite Runner
 * 
 * This script orchestrates the entire test suite execution and report generation:
 * 1. Runs baseline tests (3 runs per scenario)
 * 2. Runs throttled tests (3 runs per scenario with Fast4G)
 * 3. Runs warm cache tests (3 runs × 2 cache states per scenario)
 * 4. Extracts bundle sizes
 * 5. Generates comprehensive reports
 * 
 * Usage:
 *   node scripts/runCompleteTestSuite.js
 *   node scripts/runCompleteTestSuite.js --runs 5
 *   node scripts/runCompleteTestSuite.js --skip-baseline
 *   node scripts/runCompleteTestSuite.js --skip-throttled
 *   node scripts/runCompleteTestSuite.js --skip-warmcache
 *   node scripts/runCompleteTestSuite.js --reports-only
 */

const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const path = require('path');
const execPromise = util.promisify(exec);

// Parse command line arguments
const args = process.argv.slice(2);
let runs = 5; // Default: 3 runs per scenario
let skipBaseline = false;
let skipThrottled = false;
let skipWarmCache = false;
let reportsOnly = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--runs' && args[i + 1]) {
    runs = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--skip-baseline') {
    skipBaseline = true;
  } else if (args[i] === '--skip-throttled') {
    skipThrottled = true;
  } else if (args[i] === '--skip-warmcache') {
    skipWarmCache = true;
  } else if (args[i] === '--reports-only') {
    reportsOnly = true;
    skipBaseline = true;
    skipThrottled = true;
    skipWarmCache = true;
  }
}

const scenarios = [
  {
    name: 'Dashboard',
    scenariosFile: './scenarios/dashboard-interactions.json',
    outputDir: './reports/raw/dashboard'
  },
  {
    name: 'Workspace',
    scenariosFile: './scenarios/workspace-interactions.json',
    outputDir: './reports/raw/workspace'
  }
];

// Ensure output directories exist
function ensureDirectories() {
  scenarios.forEach(scenario => {
    if (!fs.existsSync(scenario.outputDir)) {
      fs.mkdirSync(scenario.outputDir, { recursive: true });
    }
  });
  
  const reportsDir = './reports';
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
}

// Run a command and display output
async function runCommand(command, description) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${description}`);
  console.log('='.repeat(60));
  console.log(`\n💻 Command: ${command}\n`);
  
  try {
    const { stdout, stderr } = await execPromise(command, { maxBuffer: 10 * 1024 * 1024 });
    console.log(stdout);
    if (stderr && !stderr.includes('ExperimentalWarning')) {
      console.warn('⚠️  Warnings:', stderr);
    }
    return { success: true };
  } catch (error) {
    console.error(`❌ Failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Generate timestamp for report filenames
function getTimestamp() {
  const now = new Date();
  return now.toISOString().split('T')[0]; // YYYY-MM-DD
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  Complete Performance Test Suite & Report Generation  ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  
  console.log('Configuration:');
  console.log(`  Runs per scenario: ${runs}`);
  console.log(`  Skip baseline: ${skipBaseline}`);
  console.log(`  Skip throttled: ${skipThrottled}`);
  console.log(`  Skip warm cache: ${skipWarmCache}`);
  console.log(`  Reports only: ${reportsOnly}`);
  console.log('');
  
  ensureDirectories();
  
  const results = {
    baseline: { success: false },
    throttled: { success: false },
    warmCache: { success: false },
    reports: []
  };
  
  // ===== PHASE 1: BASELINE TESTS =====
  if (!skipBaseline) {
    console.log('\n\n');
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║              PHASE 1: BASELINE TESTS                   ║');
    console.log('╚════════════════════════════════════════════════════════╝');
    
    const baselineResult = await runCommand(
      `node scripts/runMultipleTests.js --runs ${runs}`,
      `Running ${runs} baseline test iterations per scenario`
    );
    results.baseline = baselineResult;
    
    if (baselineResult.success) {
      console.log('\n✅ Baseline tests completed successfully!');
    } else {
      console.error('\n❌ Baseline tests failed. Continuing with remaining tasks...');
    }
    
    // Wait before next phase
    console.log('\n⏳ Waiting 10 seconds before next phase...');
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
  
  // ===== PHASE 2: THROTTLED TESTS =====
  if (!skipThrottled) {
    console.log('\n\n');
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║         PHASE 2: FAST4G THROTTLED TESTS                ║');
    console.log('╚════════════════════════════════════════════════════════╝');
    
    const throttledResult = await runCommand(
      `node scripts/runMultipleTests.js --runs ${runs} --throttle Fast4G`,
      `Running ${runs} Fast4G throttled test iterations per scenario`
    );
    results.throttled = throttledResult;
    
    if (throttledResult.success) {
      console.log('\n✅ Throttled tests completed successfully!');
    } else {
      console.error('\n❌ Throttled tests failed. Continuing with remaining tasks...');
    }
    
    // Wait before next phase
    console.log('\n⏳ Waiting 10 seconds before next phase...');
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
  
  // ===== PHASE 3: WARM CACHE TESTS =====
  if (!skipWarmCache) {
    console.log('\n\n');
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║            PHASE 3: WARM CACHE TESTS                   ║');
    console.log('╚════════════════════════════════════════════════════════╝');
    
    const warmCacheResult = await runCommand(
      `node scripts/runWarmCacheTests.js --runs ${runs}`,
      `Running ${runs} warm cache test iterations per scenario`
    );
    results.warmCache = warmCacheResult;
    
    if (warmCacheResult.success) {
      console.log('\n✅ Warm cache tests completed successfully!');
    } else {
      console.error('\n❌ Warm cache tests failed. Continuing with report generation...');
    }
    
    // Wait before report generation
    console.log('\n⏳ Waiting 5 seconds before report generation...');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  // ===== PHASE 4: REPORT GENERATION =====
  console.log('\n\n');
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║              PHASE 4: REPORT GENERATION                ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  
  const timestamp = getTimestamp();
  
  // Report 1: Baseline Analysis
  console.log('\n📊 Generating baseline analysis report...');
  const baselineAnalysisResult = await runCommand(
    `node scripts/analyzeMultipleRuns.js --report`,
    'Statistical Analysis of Baseline Tests'
  );
  results.reports.push({ name: 'Baseline Analysis', success: baselineAnalysisResult.success });
  
  // Report 2: Throttled Comparison
  if (!skipThrottled || fs.existsSync('./reports/raw/dashboard/dashboard-inp-fast4g-run1.json')) {
    console.log('\n📊 Generating throttled comparison report...');
    const throttledComparisonResult = await runCommand(
      `node scripts/compareThrottledResults.js --report`,
      'Baseline vs Fast4G Throttled Comparison'
    );
    results.reports.push({ name: 'Throttled Comparison', success: throttledComparisonResult.success });
  }
  
  // Report 3: Warm Cache Analysis
  if (!skipWarmCache || fs.existsSync('./reports/raw/dashboard/dashboard-warm-run1.json')) {
    console.log('\n📊 Generating warm cache analysis report...');
    const warmCacheAnalysisResult = await runCommand(
      `node scripts/analyzeWarmCacheResults.js --report`,
      'Cold vs Warm Cache Analysis'
    );
    results.reports.push({ name: 'Warm Cache Analysis', success: warmCacheAnalysisResult.success });
  }
  
  // Report 4: Bundle Size Analysis
  console.log('\n📊 Generating bundle size analysis...');
  const bundleAnalysisResult = await runCommand(
    `node scripts/extractBundleSizes.js --report`,
    'Bundle Size and Network Resource Analysis'
  );
  results.reports.push({ name: 'Bundle Size Analysis', success: bundleAnalysisResult.success });
  
  // ===== SUMMARY =====
  console.log('\n\n');
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║                  EXECUTION SUMMARY                     ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  
  console.log('Test Execution:');
  if (!skipBaseline) {
    console.log(`  ${results.baseline.success ? '✅' : '❌'} Baseline tests (${runs} runs per scenario)`);
  }
  if (!skipThrottled) {
    console.log(`  ${results.throttled.success ? '✅' : '❌'} Fast4G throttled tests (${runs} runs per scenario)`);
  }
  if (!skipWarmCache) {
    console.log(`  ${results.warmCache.success ? '✅' : '❌'} Warm cache tests (${runs} runs × 2 cache states)`);
  }
  
  console.log('\nReports Generated:');
  results.reports.forEach(report => {
    console.log(`  ${report.success ? '✅' : '❌'} ${report.name}`);
  });
  
  console.log('\n📁 Output Locations:');
  console.log('  Test results: ./reports/raw/dashboard/ and ./reports/raw/workspace/');
  console.log('  Generated reports: ./reports/');
  
  console.log('\n📋 Generated Report Files:');
  const generatedReports = fs.readdirSync('./reports')
    .filter(f => f.endsWith('.md') && (
      f.includes('baseline_analysis') || 
      f.includes('throttled_comparison') || 
      f.includes('warmcache_analysis') || 
      f.includes('bundle_analysis')
    ))
    .sort((a, b) => {
      const statA = fs.statSync(path.join('./reports', a));
      const statB = fs.statSync(path.join('./reports', b));
      return statB.mtime - statA.mtime; // Most recent first
    })
    .slice(0, 10); // Show only the 10 most recent
  
  if (generatedReports.length > 0) {
    generatedReports.forEach(file => {
      console.log(`  ✅ ${file}`);
    });
  } else {
    console.log('  (No reports generated yet)');
  }
  
  console.log('\n📋 Historical Report Files:');
  const reportFiles = [
    './reports/EXECUTIVE_PRESENTATION.md',
    './reports/EXECUTIVE_SUMMARY.md',
    './reports/FINAL_ANALYSIS.md',
    './reports/FRESH_TEST_RESULTS_NOV5_2025.md'
  ];
  
  reportFiles.forEach(file => {
    if (fs.existsSync(file)) {
      console.log(`  ✅ ${path.basename(file)}`);
    }
  });
  
  console.log('\n🎯 Next Steps:');
  console.log('  1. Review console output above for detailed metrics');
  console.log('  2. Check ./reports/ directory for comprehensive analysis');
  console.log('  3. Use generated data to update stakeholder presentations');
  console.log('  4. Consider running with --runs 5 for higher confidence');
  
  const allSuccess = 
    (skipBaseline || results.baseline.success) &&
    (skipThrottled || results.throttled.success) &&
    (skipWarmCache || results.warmCache.success) &&
    results.reports.every(r => r.success);
  
  if (allSuccess) {
    console.log('\n✅ All tasks completed successfully!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tasks failed. Review the output above for details.');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
