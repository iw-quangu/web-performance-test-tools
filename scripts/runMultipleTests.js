const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

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

// Parse command line arguments
const args = process.argv.slice(2);
let runs = 3; // Default: 3 runs per scenario
let networkThrottle = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--runs' && args[i + 1]) {
    runs = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--throttle' && args[i + 1]) {
    networkThrottle = args[i + 1];
    i++;
  }
}

async function runTest(scenario, runNumber) {
  const throttleSuffix = networkThrottle ? `-${networkThrottle.toLowerCase()}` : '';
  const outputFile = `${scenario.outputDir}/${scenario.name.toLowerCase()}-inp${throttleSuffix}-run${runNumber}.json`;
  
  let command = `node scripts/runInteractionFlow.js --scenarios ${scenario.scenariosFile} --output ${outputFile}`;
  
  if (networkThrottle) {
    command += ` --throttle ${networkThrottle}`;
  }
  
  console.log(`\n🔄 Running ${scenario.name} - Run ${runNumber}/${runs}${networkThrottle ? ` (${networkThrottle} throttling)` : ''}...`);
  
  try {
    const { stdout, stderr } = await execPromise(command);
    console.log(`✅ ${scenario.name} Run ${runNumber} completed`);
    if (stderr) console.error('Warnings:', stderr);
    return { success: true, outputFile };
  } catch (error) {
    console.error(`❌ ${scenario.name} Run ${runNumber} failed:`, error.message);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Multi-Run Performance Test Suite');
  console.log(`  Running ${runs} iterations per scenario`);
  if (networkThrottle) {
    console.log(`  Network throttling: ${networkThrottle}`);
  }
  console.log('═══════════════════════════════════════════════════════\n');
  
  for (const scenario of scenarios) {
    console.log(`\n📊 Starting ${scenario.name} test series...`);
    
    for (let i = 1; i <= runs; i++) {
      await runTest(scenario, i);
      
      // Wait 5 seconds between runs to let the server stabilize
      if (i < runs) {
        console.log('⏳ Waiting 5 seconds before next run...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }
  
  console.log('\n\n✅ All test runs completed!');
  console.log('\nNext steps:');
  console.log('  node scripts/analyzeMultipleRuns.js');
}

main().catch(console.error);
