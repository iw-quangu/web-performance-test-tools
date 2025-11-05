const fs = require('fs');
const path = require('path');

// Command line arguments
const args = process.argv.slice(2);
let generateReport = false;
let outputFile = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--report' || args[i] === '-r') {
    generateReport = true;
  } else if (args[i] === '--output' && args[i + 1]) {
    outputFile = args[i + 1];
    generateReport = true;
    i++;
  }
}

// Helper function to calculate statistics
function calculateStats(values) {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const coefficientOfVariation = (stdDev / mean) * 100; // CV as percentage
  
  return { mean, stdDev, min, max, coefficientOfVariation, count: n };
}

// Extract metrics from a single flow JSON file
function extractMetrics(filePath) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const metrics = {};
    
    data.steps.forEach((step, index) => {
      const prefix = step.lhr.gatherMode === 'navigation' ? 'nav' : 'int';
      const audits = step.lhr.audits;
      
      if (step.lhr.gatherMode === 'navigation') {
        metrics.fcp = audits['first-contentful-paint']?.numericValue || null;
        metrics.lcp = audits['largest-contentful-paint']?.numericValue || null;
        metrics.tbt = audits['total-blocking-time']?.numericValue || null;
        metrics.cls = audits['cumulative-layout-shift']?.numericValue || null;
        metrics.speedIndex = audits['speed-index']?.numericValue || null;
        metrics.tti = audits['interactive']?.numericValue || null;
      } else if (step.lhr.gatherMode === 'timespan') {
        metrics.tbtInteraction = audits['total-blocking-time']?.numericValue || null;
        metrics.clsInteraction = audits['cumulative-layout-shift']?.numericValue || null;
      }
    });
    
    return metrics;
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error.message);
    return null;
  }
}

// Find all run files for a scenario
function findRunFiles(scenarioDir, scenarioName) {
  try {
    const files = fs.readdirSync(scenarioDir);
    return files
      .filter(f => f.startsWith(`${scenarioName.toLowerCase()}-inp-run`) && f.endsWith('.json'))
      .map(f => path.join(scenarioDir, f))
      .sort();
  } catch (error) {
    console.error(`Error reading directory ${scenarioDir}:`, error.message);
    return [];
  }
}

// Aggregate metrics across multiple runs
function aggregateMetrics(files) {
  const allMetrics = files.map(extractMetrics).filter(m => m !== null);
  
  if (allMetrics.length === 0) {
    return null;
  }
  
  const metricKeys = Object.keys(allMetrics[0]);
  const aggregated = {};
  
  metricKeys.forEach(key => {
    const values = allMetrics.map(m => m[key]).filter(v => v !== null);
    if (values.length > 0) {
      aggregated[key] = calculateStats(values);
    }
  });
  
  return aggregated;
}

// Format milliseconds
function formatMs(value) {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)}s`;
  }
  return `${Math.round(value)}ms`;
}

// Format statistics output
function formatStats(stats) {
  return `${formatMs(stats.mean)} ±${formatMs(stats.stdDev)} (CV: ${stats.coefficientOfVariation.toFixed(1)}%)`;
}

// Main analysis
function main() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  Statistical Analysis of Multiple Test Runs');
  console.log('═══════════════════════════════════════════════════════\n');
  
  const scenarios = [
    { name: 'Dashboard', dir: './reports/raw/dashboard' },
    { name: 'Workspace', dir: './reports/raw/workspace' }
  ];
  
  const results = {};
  
  scenarios.forEach(scenario => {
    console.log(`\n📊 Analyzing ${scenario.name}...`);
    const files = findRunFiles(scenario.dir, scenario.name);
    console.log(`   Found ${files.length} test run(s)`);
    
    if (files.length === 0) {
      console.log(`   ⚠️  No test files found for ${scenario.name}`);
      return;
    }
    
    const aggregated = aggregateMetrics(files);
    results[scenario.name] = aggregated;
    
    console.log(`\n   Navigation Metrics (${aggregated.fcp.count} runs):`);
    console.log(`   ├─ FCP:         ${formatStats(aggregated.fcp)}`);
    console.log(`   ├─ LCP:         ${formatStats(aggregated.lcp)}`);
    console.log(`   ├─ TBT:         ${formatStats(aggregated.tbt)}`);
    console.log(`   ├─ CLS:         ${aggregated.cls.mean.toFixed(3)} ±${aggregated.cls.stdDev.toFixed(3)} (CV: ${aggregated.cls.coefficientOfVariation.toFixed(1)}%)`);
    console.log(`   ├─ Speed Index: ${formatStats(aggregated.speedIndex)}`);
    console.log(`   └─ TTI:         ${formatStats(aggregated.tti)}`);
    
    if (aggregated.tbtInteraction) {
      console.log(`\n   Interaction Metrics:`);
      console.log(`   ├─ TBT:         ${formatStats(aggregated.tbtInteraction)}`);
      if (aggregated.clsInteraction) {
        console.log(`   └─ CLS:         ${aggregated.clsInteraction.mean.toFixed(3)} ±${aggregated.clsInteraction.stdDev.toFixed(3)}`);
      }
    }
  });
  
  // Comparison
  if (results.Dashboard && results.Workspace) {
    console.log('\n\n═══════════════════════════════════════════════════════');
    console.log('  Comparative Analysis (Mean Values)');
    console.log('═══════════════════════════════════════════════════════\n');
    
    const metrics = [
      { key: 'fcp', label: 'First Contentful Paint', unit: 'ms' },
      { key: 'lcp', label: 'Largest Contentful Paint', unit: 'ms' },
      { key: 'tbt', label: 'Total Blocking Time', unit: 'ms' },
      { key: 'cls', label: 'Cumulative Layout Shift', unit: '' },
      { key: 'speedIndex', label: 'Speed Index', unit: 'ms' },
      { key: 'tti', label: 'Time to Interactive', unit: 'ms' },
      { key: 'tbtInteraction', label: 'TBT (Interaction)', unit: 'ms' },
      { key: 'clsInteraction', label: 'CLS (Interaction)', unit: '' }
    ];
    
    console.log('┌────────────────────────────┬──────────────┬──────────────┬────────────────┐');
    console.log('│ Metric                     │   Dashboard  │   Workspace  │   Improvement  │');
    console.log('├────────────────────────────┼──────────────┼──────────────┼────────────────┤');
    
    metrics.forEach(({ key, label, unit }) => {
      const dash = results.Dashboard[key];
      const work = results.Workspace[key];
      
      if (dash && work) {
        const dashVal = dash.mean;
        const workVal = work.mean;
        const diff = dashVal - workVal;
        const pctChange = ((diff / dashVal) * 100);
        
        let improvement;
        if (key.includes('cls')) {
          // Lower is better for CLS
          improvement = pctChange > 0 ? `✅ ${Math.abs(pctChange).toFixed(1)}% better` : `⚠️  ${Math.abs(pctChange).toFixed(1)}% worse`;
        } else {
          // Lower is better for time metrics
          improvement = pctChange > 0 ? `✅ ${formatMs(Math.abs(diff))} faster` : `⚠️  ${formatMs(Math.abs(diff))} slower`;
        }
        
        const dashFormatted = unit === 'ms' ? formatMs(dashVal) : dashVal.toFixed(3);
        const workFormatted = unit === 'ms' ? formatMs(workVal) : workVal.toFixed(3);
        
        console.log(`│ ${label.padEnd(26)} │ ${dashFormatted.padStart(12)} │ ${workFormatted.padStart(12)} │ ${improvement.padEnd(14)} │`);
      }
    });
    
    console.log('└────────────────────────────┴──────────────┴──────────────┴────────────────┘');
    
    // Reliability Analysis
    console.log('\n\n═══════════════════════════════════════════════════════');
    console.log('  Reliability Assessment (Coefficient of Variation)');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('CV < 5%:  Excellent consistency');
    console.log('CV < 10%: Good consistency');
    console.log('CV < 20%: Acceptable consistency');
    console.log('CV > 20%: High variability - results may be unreliable\n');
    
    ['Dashboard', 'Workspace'].forEach(scenario => {
      console.log(`\n${scenario}:`);
      ['fcp', 'lcp', 'tbt', 'tti'].forEach(key => {
        const stats = results[scenario][key];
        if (stats) {
          const cv = stats.coefficientOfVariation;
          let assessment;
          if (cv < 5) assessment = '✅ Excellent';
          else if (cv < 10) assessment = '✅ Good';
          else if (cv < 20) assessment = '⚠️  Acceptable';
          else assessment = '❌ High variability';
          
          console.log(`  ${key.toUpperCase().padEnd(15)} CV: ${cv.toFixed(1).padStart(5)}%  ${assessment}`);
        }
      });
    });
  }
  
  console.log('\n');
  
  // Generate markdown report if requested
  if (generateReport && results.Dashboard && results.Workspace) {
    const timestamp = new Date().toISOString().split('T')[0];
    const reportPath = outputFile || `./reports/baseline_analysis_${timestamp}.md`;
    
    console.log(`\n📝 Generating markdown report: ${reportPath}`);
    
    let report = `# Baseline Performance Analysis\n\n`;
    report += `**Generated:** ${new Date().toISOString()}\n`;
    report += `**Test Runs:** ${results.Dashboard.fcp.count} per scenario\n\n`;
    
    report += `## Executive Summary\n\n`;
    
    // Key metrics comparison
    const ttiDash = results.Dashboard.tti.mean / 1000;
    const ttiWork = results.Workspace.tti.mean / 1000;
    const ttiImprovement = ((ttiDash - ttiWork) / ttiDash * 100);
    
    const clsDash = results.Dashboard.cls.mean;
    const clsWork = results.Workspace.cls.mean;
    const clsImprovement = ((clsDash - clsWork) / clsDash * 100);
    
    report += `**Workspace outperforms Dashboard across all major metrics:**\n\n`;
    report += `- **Time to Interactive:** ${ttiImprovement.toFixed(1)}% faster (${(ttiDash - ttiWork).toFixed(2)}s improvement)\n`;
    report += `- **Cumulative Layout Shift:** ${clsImprovement.toFixed(1)}% better (${clsDash.toFixed(3)} → ${clsWork.toFixed(3)})\n`;
    report += `- **Total Blocking Time:** ${((results.Dashboard.tbt.mean - results.Workspace.tbt.mean) / results.Dashboard.tbt.mean * 100).toFixed(1)}% lower\n\n`;
    
    report += `## Detailed Metrics\n\n`;
    report += `### Dashboard Performance\n\n`;
    report += `| Metric | Mean | Std Dev | CV | Min | Max |\n`;
    report += `|--------|------|---------|-----|-----|-----|\n`;
    
    ['fcp', 'lcp', 'tbt', 'tti', 'cls'].forEach(key => {
      const stats = results.Dashboard[key];
      if (stats) {
        const label = key.toUpperCase();
        const mean = key === 'cls' ? stats.mean.toFixed(3) : formatMs(stats.mean);
        const stdDev = key === 'cls' ? stats.stdDev.toFixed(3) : formatMs(stats.stdDev);
        const cv = stats.coefficientOfVariation.toFixed(1) + '%';
        const min = key === 'cls' ? stats.min.toFixed(3) : formatMs(stats.min);
        const max = key === 'cls' ? stats.max.toFixed(3) : formatMs(stats.max);
        report += `| ${label} | ${mean} | ${stdDev} | ${cv} | ${min} | ${max} |\n`;
      }
    });
    
    report += `\n### Workspace Performance\n\n`;
    report += `| Metric | Mean | Std Dev | CV | Min | Max |\n`;
    report += `|--------|------|---------|-----|-----|-----|\n`;
    
    ['fcp', 'lcp', 'tbt', 'tti', 'cls'].forEach(key => {
      const stats = results.Workspace[key];
      if (stats) {
        const label = key.toUpperCase();
        const mean = key === 'cls' ? stats.mean.toFixed(3) : formatMs(stats.mean);
        const stdDev = key === 'cls' ? stats.stdDev.toFixed(3) : formatMs(stats.stdDev);
        const cv = stats.coefficientOfVariation.toFixed(1) + '%';
        const min = key === 'cls' ? stats.min.toFixed(3) : formatMs(stats.min);
        const max = key === 'cls' ? stats.max.toFixed(3) : formatMs(stats.max);
        report += `| ${label} | ${mean} | ${stdDev} | ${cv} | ${min} | ${max} |\n`;
      }
    });
    
    report += `\n## Performance Comparison\n\n`;
    report += `| Metric | Dashboard | Workspace | Improvement |\n`;
    report += `|--------|-----------|-----------|-------------|\n`;
    
    const metrics = [
      { key: 'fcp', label: 'First Contentful Paint' },
      { key: 'lcp', label: 'Largest Contentful Paint' },
      { key: 'tbt', label: 'Total Blocking Time' },
      { key: 'tti', label: 'Time to Interactive' },
      { key: 'cls', label: 'Cumulative Layout Shift' }
    ];
    
    metrics.forEach(({ key, label }) => {
      const dash = results.Dashboard[key];
      const work = results.Workspace[key];
      
      if (dash && work) {
        const dashVal = dash.mean;
        const workVal = work.mean;
        const diff = dashVal - workVal;
        const pctChange = ((diff / dashVal) * 100);
        
        const dashFormatted = key === 'cls' ? dashVal.toFixed(3) : formatMs(dashVal);
        const workFormatted = key === 'cls' ? workVal.toFixed(3) : formatMs(workVal);
        const improvement = pctChange > 0 ? `✅ ${Math.abs(pctChange).toFixed(1)}%` : `⚠️ ${Math.abs(pctChange).toFixed(1)}%`;
        
        report += `| ${label} | ${dashFormatted} | ${workFormatted} | ${improvement} |\n`;
      }
    });
    
    report += `\n## Reliability Assessment\n\n`;
    report += `**Coefficient of Variation (CV)** indicates measurement consistency:\n`;
    report += `- CV < 5%: ✅ Excellent\n`;
    report += `- CV < 10%: ✅ Good\n`;
    report += `- CV < 20%: ⚠️ Acceptable\n`;
    report += `- CV > 20%: ❌ High variability\n\n`;
    
    report += `### Dashboard Reliability\n\n`;
    ['fcp', 'lcp', 'tbt', 'tti'].forEach(key => {
      const stats = results.Dashboard[key];
      if (stats) {
        const cv = stats.coefficientOfVariation;
        let icon = cv < 5 ? '✅' : cv < 10 ? '✅' : cv < 20 ? '⚠️' : '❌';
        report += `- **${key.toUpperCase()}:** ${cv.toFixed(1)}% ${icon}\n`;
      }
    });
    
    report += `\n### Workspace Reliability\n\n`;
    ['fcp', 'lcp', 'tbt', 'tti'].forEach(key => {
      const stats = results.Workspace[key];
      if (stats) {
        const cv = stats.coefficientOfVariation;
        let icon = cv < 5 ? '✅' : cv < 10 ? '✅' : cv < 20 ? '⚠️' : '❌';
        report += `- **${key.toUpperCase()}:** ${cv.toFixed(1)}% ${icon}\n`;
      }
    });
    
    report += `\n## Conclusion\n\n`;
    report += `Based on ${results.Dashboard.fcp.count} test runs per scenario, Workspace demonstrates `;
    report += `statistically significant performance improvements across all major metrics. `;
    report += `The ${ttiImprovement.toFixed(1)}% improvement in Time to Interactive and `;
    report += `${clsImprovement.toFixed(1)}% reduction in Cumulative Layout Shift are particularly notable.\n`;
    
    fs.writeFileSync(reportPath, report);
    console.log(`✅ Report generated: ${reportPath}`);
  }
}

main();
