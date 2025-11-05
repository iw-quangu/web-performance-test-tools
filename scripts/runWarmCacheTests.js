#!/usr/bin/env node
/**
 * Multi-Run Warm Cache Performance Test Suite
 * 
 * Runs performance tests with warm cache (repeat visits):
 * 1. First visit (cold cache) - clears cache before test
 * 2. Second visit (warm cache) - uses cached assets
 * 
 * Usage:
 *   node scripts/runWarmCacheTests.js --runs 3
 *   node scripts/runWarmCacheTests.js --runs 3 --throttle Fast4G
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const rootDir = path.join(__dirname, '..');

// Parse command line arguments
const args = process.argv.slice(2);
let runs = 3;
let throttle = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--runs' && args[i + 1]) {
    runs = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--throttle' && args[i + 1]) {
    throttle = args[i + 1];
    i++;
  }
}

console.log('\n═══════════════════════════════════════════════════════');
console.log('  Warm Cache Performance Test Suite');
console.log(`  Running ${runs} iterations per scenario (cold + warm)`);
if (throttle) {
  console.log(`  Network throttling: ${throttle}`);
}
console.log('═══════════════════════════════════════════════════════\n');

// Test configurations
const tests = [
  {
    name: 'Dashboard',
    scenariosFile: './scenarios/dashboard-interactions.json',
    outputDir: './reports/raw/dashboard-warm'
  },
  {
    name: 'Workspace',
    scenariosFile: './scenarios/workspace-interactions.json',
    outputDir: './reports/raw/workspace-warm'
  }
];

// Ensure output directories exist
tests.forEach(test => {
  const dir = path.join(rootDir, test.outputDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Created directory: ${test.outputDir}`);
  }
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatTimestamp() {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
}

async function runTest(test, runNumber, cacheState) {
  const timestamp = formatTimestamp();
  const outputFile = path.join(
    rootDir,
    test.outputDir,
    `${test.name.toLowerCase()}-${cacheState}-run${runNumber}-${timestamp}.json`
  );

  console.log(`🔄 Running ${test.name} - Run ${runNumber}/${runs} (${cacheState} cache)...`);

  let cmd = `node scripts/runInteractionFlow.js`;
  cmd += ` --scenarios "${test.scenariosFile}"`;
  cmd += ` --output "${outputFile}"`;
  
  // Add cache state flag (cold = clear cache, warm = keep cache)
  if (cacheState === 'cold') {
    cmd += ` --clear-cache`;
  }
  
  if (throttle) {
    cmd += ` --throttle ${throttle}`;
  }

  try {
    execSync(cmd, {
      cwd: rootDir,
      stdio: 'pipe',
      encoding: 'utf-8'
    });
    console.log(`✅ ${test.name} Run ${runNumber} (${cacheState}) completed`);
  } catch (error) {
    console.error(`❌ ${test.name} Run ${runNumber} (${cacheState}) failed:`);
    if (error.stdout) console.error(error.stdout);
    if (error.stderr) console.error(error.stderr);
    throw error;
  }
}

async function runTestSeries(test) {
  console.log(`\n📊 Starting ${test.name} warm cache test series...\n`);

  for (let i = 1; i <= runs; i++) {
    // First run: Cold cache (clear cache before test)
    await runTest(test, i, 'cold');
    
    // Small delay to ensure first test completes
    await sleep(2000);
    
    // Second run: Warm cache (use cached assets)
    await runTest(test, i, 'warm');
    
    // Longer delay between test pairs
    if (i < runs) {
      console.log('⏳ Waiting 5 seconds before next run...\n');
      await sleep(5000);
    }
  }
}

async function main() {
  try {
    for (const test of tests) {
      await runTestSeries(test);
    }

    console.log('\n\n✅ All warm cache test runs completed!\n');
    console.log('Next steps:');
    console.log('  node scripts/analyzeWarmCacheResults.js');
  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

main();
