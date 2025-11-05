#!/usr/bin/env node
/**
 * Warm Cache Results Analysis
 * 
 * Analyzes and compares cold cache vs warm cache performance
 * Shows the benefit of cached assets on repeat visits
 */

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

const rootDir = path.join(__dirname, '..');

function extractMetrics(report) {
  const nav = report.steps?.find(s => s.name.toLowerCase().includes('navigation'));
  const interaction = report.steps?.find(s => s.name.toLowerCase().includes('interaction') || s.name.toLowerCase().includes('timespan'));

  if (!nav?.lhr) return null;

  const audits = nav.lhr.audits;
  return {
    fcp: audits['first-contentful-paint']?.numericValue / 1000,
    lcp: audits['largest-contentful-paint']?.numericValue / 1000,
    tbt: audits['total-blocking-time']?.numericValue,
    cls: audits['cumulative-layout-shift']?.numericValue,
    speedIndex: audits['speed-index']?.numericValue / 1000,
    tti: audits['interactive']?.numericValue / 1000,
    interactionTbt: interaction?.lhr?.audits?.['total-blocking-time']?.numericValue,
    interactionCls: interaction?.lhr?.audits?.['cumulative-layout-shift']?.numericValue,
  };
}

function analyzeFiles(directory, variant, cacheState) {
  const dirPath = path.join(rootDir, directory);
  if (!fs.existsSync(dirPath)) {
    console.warn(`Directory not found: ${dirPath}`);
    return [];
  }

  const files = fs.readdirSync(dirPath)
    .filter(f => f.endsWith('.json') && f.includes(cacheState))
    .sort();

  const results = [];
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const report = JSON.parse(content);
      const metrics = extractMetrics(report);
      if (metrics) {
        results.push({ file, metrics });
      }
    } catch (error) {
      console.warn(`Failed to parse ${file}:`, error.message);
    }
  }

  return results;
}

function calculateStats(values) {
  if (values.length === 0) return { mean: 0, stdDev: 0, cv: 0 };
  
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  const cv = mean !== 0 ? (stdDev / mean) * 100 : 0;
  
  return { mean, stdDev, cv };
}

function formatMetric(value, unit = 's') {
  if (value === undefined || value === null) return 'N/A';
  if (unit === 's') return `${value.toFixed(2)}s`;
  if (unit === 'ms') return `${Math.round(value)}ms`;
  return value.toFixed(3);
}

function formatStats(stats, unit = 's') {
  const { mean, stdDev, cv } = stats;
  const formatted = formatMetric(mean, unit);
  const stdFormatted = formatMetric(stdDev, unit);
  const cvFormatted = `${cv.toFixed(1)}%`;
  
  let reliability = '';
  if (cv < 5) reliability = '✅ Excellent';
  else if (cv < 10) reliability = '✅ Good';
  else if (cv < 20) reliability = '⚠️  Acceptable';
  else reliability = '❌ High variability';
  
  return `${formatted} ±${stdFormatted} (CV: ${cvFormatted})`;
}

function analyzeVariant(directory, variant) {
  console.log(`\n📊 Analyzing ${variant}...`);
  
  const coldResults = analyzeFiles(directory, variant, 'cold');
  const warmResults = analyzeFiles(directory, variant, 'warm');
  
  console.log(`   Found ${coldResults.length} cold cache run(s)`);
  console.log(`   Found ${warmResults.length} warm cache run(s)`);
  
  if (coldResults.length === 0 && warmResults.length === 0) {
    console.log('   ⚠️  No test data found');
    return null;
  }

  const getValues = (results, key) => results.map(r => r.metrics[key]).filter(v => v !== undefined && v !== null);
  
  const coldStats = {
    fcp: calculateStats(getValues(coldResults, 'fcp')),
    lcp: calculateStats(getValues(coldResults, 'lcp')),
    tbt: calculateStats(getValues(coldResults, 'tbt')),
    cls: calculateStats(getValues(coldResults, 'cls')),
    speedIndex: calculateStats(getValues(coldResults, 'speedIndex')),
    tti: calculateStats(getValues(coldResults, 'tti')),
  };
  
  const warmStats = {
    fcp: calculateStats(getValues(warmResults, 'fcp')),
    lcp: calculateStats(getValues(warmResults, 'lcp')),
    tbt: calculateStats(getValues(warmResults, 'tbt')),
    cls: calculateStats(getValues(warmResults, 'cls')),
    speedIndex: calculateStats(getValues(warmResults, 'speedIndex')),
    tti: calculateStats(getValues(warmResults, 'tti')),
  };

  console.log(`\n   Cold Cache (${coldResults.length} runs):`);
  console.log(`   ├─ FCP:         ${formatStats(coldStats.fcp)}`);
  console.log(`   ├─ LCP:         ${formatStats(coldStats.lcp)}`);
  console.log(`   ├─ TBT:         ${formatStats(coldStats.tbt, 'ms')}`);
  console.log(`   ├─ CLS:         ${formatStats(coldStats.cls, 'raw')}`);
  console.log(`   ├─ Speed Index: ${formatStats(coldStats.speedIndex)}`);
  console.log(`   └─ TTI:         ${formatStats(coldStats.tti)}`);
  
  console.log(`\n   Warm Cache (${warmResults.length} runs):`);
  console.log(`   ├─ FCP:         ${formatStats(warmStats.fcp)}`);
  console.log(`   ├─ LCP:         ${formatStats(warmStats.lcp)}`);
  console.log(`   ├─ TBT:         ${formatStats(warmStats.tbt, 'ms')}`);
  console.log(`   ├─ CLS:         ${formatStats(warmStats.cls, 'raw')}`);
  console.log(`   ├─ Speed Index: ${formatStats(warmStats.speedIndex)}`);
  console.log(`   └─ TTI:         ${formatStats(warmStats.tti)}`);

  return { coldStats, warmStats, coldResults, warmResults };
}

function printCacheImpact(variantName, coldStats, warmStats) {
  console.log(`\n   Cache Impact (Cold → Warm):`);
  
  const metrics = [
    { key: 'fcp', name: 'FCP', unit: 's', multiplier: 1000 },
    { key: 'lcp', name: 'LCP', unit: 's', multiplier: 1000 },
    { key: 'tti', name: 'TTI', unit: 's', multiplier: 1000 },
    { key: 'tbt', name: 'TBT', unit: 'ms', multiplier: 1 },
  ];
  
  for (const { key, name, unit, multiplier } of metrics) {
    const coldVal = coldStats[key].mean;
    const warmVal = warmStats[key].mean;
    const diff = (coldVal - warmVal) * multiplier;
    const percentChange = coldVal !== 0 ? ((warmVal - coldVal) / coldVal * 100) : 0;
    
    let symbol = '';
    if (diff > 0) symbol = '✅';  // Warm is faster
    else if (diff < 0) symbol = '⚠️';  // Warm is slower
    
    const absDiff = Math.abs(diff);
    const absPercent = Math.abs(percentChange);
    
    console.log(`   ├─ ${name}: ${symbol} ${absDiff.toFixed(0)}${unit === 's' ? 'ms' : unit} ${percentChange > 0 ? 'slower' : 'faster'} (${absPercent.toFixed(1)}%)`);
  }
}

console.log('\n═══════════════════════════════════════════════════════');
console.log('  Warm Cache Performance Analysis');
console.log('═══════════════════════════════════════════════════════');

const dashboardData = analyzeVariant('./reports/raw/dashboard-warm', 'Dashboard');
const workspaceData = analyzeVariant('./reports/raw/workspace-warm', 'Workspace');

if (dashboardData) {
  printCacheImpact('Dashboard', dashboardData.coldStats, dashboardData.warmStats);
}

if (workspaceData) {
  printCacheImpact('Workspace', workspaceData.coldStats, workspaceData.warmStats);
}

// Comparative analysis
if (dashboardData && workspaceData) {
  console.log('\n\n═══════════════════════════════════════════════════════');
  console.log('  Cold Cache Comparison (Dashboard vs Workspace)');
  console.log('═══════════════════════════════════════════════════════\n');
  
  console.log('┌────────────────────────────┬──────────────┬──────────────┬────────────────┐');
  console.log('│ Metric                     │   Dashboard  │   Workspace  │   Improvement  │');
  console.log('├────────────────────────────┼──────────────┼──────────────┼────────────────┤');
  
  const metrics = [
    { key: 'fcp', name: 'First Contentful Paint', unit: 's' },
    { key: 'lcp', name: 'Largest Contentful Paint', unit: 's' },
    { key: 'tbt', name: 'Total Blocking Time', unit: 'ms' },
    { key: 'cls', name: 'Cumulative Layout Shift', unit: 'raw' },
    { key: 'tti', name: 'Time to Interactive', unit: 's' },
  ];
  
  for (const { key, name, unit } of metrics) {
    const dashVal = dashboardData.coldStats[key].mean;
    const workVal = workspaceData.coldStats[key].mean;
    const diff = dashVal - workVal;
    
    let improvement = '';
    if (unit === 's') {
      improvement = diff > 0 ? `✅ ${(diff * 1000).toFixed(0)}ms faster` : `⚠️  ${(Math.abs(diff) * 1000).toFixed(0)}ms slower`;
    } else if (unit === 'ms') {
      improvement = diff > 0 ? `✅ ${diff.toFixed(0)}ms faster` : `⚠️  ${Math.abs(diff).toFixed(0)}ms slower`;
    } else {
      const percent = dashVal !== 0 ? (diff / dashVal * 100) : 0;
      improvement = percent > 0 ? `✅ ${percent.toFixed(1)}% better` : `⚠️  ${Math.abs(percent).toFixed(1)}% worse`;
    }
    
    console.log(`│ ${name.padEnd(26)} │ ${formatMetric(dashVal, unit).padStart(12)} │ ${formatMetric(workVal, unit).padStart(12)} │ ${improvement.padEnd(14)} │`);
  }
  
  console.log('└────────────────────────────┴──────────────┴──────────────┴────────────────┘');
  
  console.log('\n\n═══════════════════════════════════════════════════════');
  console.log('  Warm Cache Comparison (Dashboard vs Workspace)');
  console.log('═══════════════════════════════════════════════════════\n');
  
  console.log('┌────────────────────────────┬──────────────┬──────────────┬────────────────┐');
  console.log('│ Metric                     │   Dashboard  │   Workspace  │   Improvement  │');
  console.log('├────────────────────────────┼──────────────┼──────────────┼────────────────┤');
  
  for (const { key, name, unit } of metrics) {
    const dashVal = dashboardData.warmStats[key].mean;
    const workVal = workspaceData.warmStats[key].mean;
    const diff = dashVal - workVal;
    
    let improvement = '';
    if (unit === 's') {
      improvement = diff > 0 ? `✅ ${(diff * 1000).toFixed(0)}ms faster` : `⚠️  ${(Math.abs(diff) * 1000).toFixed(0)}ms slower`;
    } else if (unit === 'ms') {
      improvement = diff > 0 ? `✅ ${diff.toFixed(0)}ms faster` : `⚠️  ${Math.abs(diff).toFixed(0)}ms slower`;
    } else {
      const percent = dashVal !== 0 ? (diff / dashVal * 100) : 0;
      improvement = percent > 0 ? `✅ ${percent.toFixed(1)}% better` : `⚠️  ${Math.abs(percent).toFixed(1)}% worse`;
    }
    
    console.log(`│ ${name.padEnd(26)} │ ${formatMetric(dashVal, unit).padStart(12)} │ ${formatMetric(workVal, unit).padStart(12)} │ ${improvement.padEnd(14)} │`);
  }
  
  console.log('└────────────────────────────┴──────────────┴──────────────┴────────────────┘');
}

console.log('\n');

// Generate markdown report if requested
if (generateReport && dashboardData && workspaceData) {
  const timestamp = new Date().toISOString().split('T')[0];
  const reportPath = outputFile || `./reports/warmcache_analysis_${timestamp}.md`;
  
  console.log(`📝 Generating markdown report: ${reportPath}`);
  
  const dashColdStats = dashboardData.coldStats;
  const dashWarmStats = dashboardData.warmStats;
  const workColdStats = workspaceData.coldStats;
  const workWarmStats = workspaceData.warmStats;
  
  let report = `# Warm Cache Performance Analysis\n\n`;
  report += `**Generated:** ${new Date().toISOString()}\n`;
  report += `**Dashboard Cold Cache Runs:** ${dashboardData.coldResults.length}\n`;
  report += `**Dashboard Warm Cache Runs:** ${dashboardData.warmResults.length}\n`;
  report += `**Workspace Cold Cache Runs:** ${workspaceData.coldResults.length}\n`;
  report += `**Workspace Warm Cache Runs:** ${workspaceData.warmResults.length}\n\n`;
  
  report += `## Executive Summary\n\n`;
  report += `Cache benefits vary by platform:\n\n`;
  report += `- **Dashboard:** Minimal cache benefit (TTI: ${(dashColdStats.tti.mean - dashWarmStats.tti.mean).toFixed(2)}s faster with cache)\n`;
  report += `- **Workspace:** ${(workColdStats.tti.mean - workWarmStats.tti.mean).toFixed(2)}s faster TTI with warm cache\n\n`;
  
  report += `## Dashboard Performance\n\n`;
  report += `| Metric | Cold Cache | Warm Cache | Benefit |\n`;
  report += `|--------|------------|------------|----------|\n`;
  report += `| FCP | ${dashColdStats.fcp.mean.toFixed(2)}s | ${dashWarmStats.fcp.mean.toFixed(2)}s | ${(dashColdStats.fcp.mean - dashWarmStats.fcp.mean).toFixed(2)}s |\n`;
  report += `| LCP | ${dashColdStats.lcp.mean.toFixed(2)}s | ${dashWarmStats.lcp.mean.toFixed(2)}s | ${(dashColdStats.lcp.mean - dashWarmStats.lcp.mean).toFixed(2)}s |\n`;
  report += `| TTI | ${dashColdStats.tti.mean.toFixed(2)}s | ${dashWarmStats.tti.mean.toFixed(2)}s | ${(dashColdStats.tti.mean - dashWarmStats.tti.mean).toFixed(2)}s |\n`;
  report += `| TBT | ${dashColdStats.tbt.mean.toFixed(0)}ms | ${dashWarmStats.tbt.mean.toFixed(0)}ms | ${(dashColdStats.tbt.mean - dashWarmStats.tbt.mean).toFixed(0)}ms |\n`;
  report += `| CLS | ${dashColdStats.cls.mean.toFixed(3)} | ${dashWarmStats.cls.mean.toFixed(3)} | ${(dashColdStats.cls.mean - dashWarmStats.cls.mean).toFixed(3)} |\n\n`;
  
  report += `## Workspace Performance\n\n`;
  report += `| Metric | Cold Cache | Warm Cache | Benefit |\n`;
  report += `|--------|------------|------------|----------|\n`;
  report += `| FCP | ${workColdStats.fcp.mean.toFixed(2)}s | ${workWarmStats.fcp.mean.toFixed(2)}s | ${(workColdStats.fcp.mean - workWarmStats.fcp.mean).toFixed(2)}s |\n`;
  report += `| LCP | ${workColdStats.lcp.mean.toFixed(2)}s | ${workWarmStats.lcp.mean.toFixed(2)}s | ${(workColdStats.lcp.mean - workWarmStats.lcp.mean).toFixed(2)}s |\n`;
  report += `| TTI | ${workColdStats.tti.mean.toFixed(2)}s | ${workWarmStats.tti.mean.toFixed(2)}s | ${(workColdStats.tti.mean - workWarmStats.tti.mean).toFixed(2)}s |\n`;
  report += `| TBT | ${workColdStats.tbt.mean.toFixed(0)}ms | ${workWarmStats.tbt.mean.toFixed(0)}ms | ${(workColdStats.tbt.mean - workWarmStats.tbt.mean).toFixed(0)}ms |\n`;
  report += `| CLS | ${workColdStats.cls.mean.toFixed(3)} | ${workWarmStats.cls.mean.toFixed(3)} | ${(workColdStats.cls.mean - workWarmStats.cls.mean).toFixed(3)} |\n\n`;
  
  report += `## Cache Benefit Analysis\n\n`;
  report += `### Dashboard\n\n`;
  const dashTtiBenefit = (dashColdStats.tti.mean - dashWarmStats.tti.mean);
  const dashTtiBenefitPercent = (dashTtiBenefit / dashColdStats.tti.mean * 100);
  report += `- TTI improvement: ${dashTtiBenefit.toFixed(2)}s (${dashTtiBenefitPercent.toFixed(1)}%)\n`;
  report += `- Assessment: ${dashTtiBenefitPercent < 2 ? 'Minimal benefit' : 'Moderate benefit'}\n\n`;
  
  report += `### Workspace\n\n`;
  const workTtiBenefit = (workColdStats.tti.mean - workWarmStats.tti.mean);
  const workTtiBenefitPercent = (workTtiBenefit / workColdStats.tti.mean * 100);
  report += `- TTI improvement: ${workTtiBenefit.toFixed(2)}s (${workTtiBenefitPercent.toFixed(1)}%)\n`;
  report += `- Assessment: ${workTtiBenefitPercent < 2 ? 'Minimal benefit' : 'Moderate benefit'}\n\n`;
  
  report += `## Platform Comparison\n\n`;
  report += `### Cold Cache (First Visit)\n\n`;
  report += `| Metric | Dashboard | Workspace | Workspace Advantage |\n`;
  report += `|--------|-----------|-----------|---------------------|\n`;
  report += `| TTI | ${dashColdStats.tti.mean.toFixed(2)}s | ${workColdStats.tti.mean.toFixed(2)}s | ${(dashColdStats.tti.mean - workColdStats.tti.mean).toFixed(2)}s (${((dashColdStats.tti.mean - workColdStats.tti.mean) / dashColdStats.tti.mean * 100).toFixed(1)}%) |\n`;
  report += `| FCP | ${dashColdStats.fcp.mean.toFixed(2)}s | ${workColdStats.fcp.mean.toFixed(2)}s | ${(dashColdStats.fcp.mean - workColdStats.fcp.mean).toFixed(2)}s (${((dashColdStats.fcp.mean - workColdStats.fcp.mean) / dashColdStats.fcp.mean * 100).toFixed(1)}%) |\n`;
  report += `| CLS | ${dashColdStats.cls.mean.toFixed(3)} | ${workColdStats.cls.mean.toFixed(3)} | ${((dashColdStats.cls.mean - workColdStats.cls.mean) / dashColdStats.cls.mean * 100).toFixed(1)}% better |\n\n`;
  
  report += `### Warm Cache (Return Visit)\n\n`;
  report += `| Metric | Dashboard | Workspace | Workspace Advantage |\n`;
  report += `|--------|-----------|-----------|---------------------|\n`;
  report += `| TTI | ${dashWarmStats.tti.mean.toFixed(2)}s | ${workWarmStats.tti.mean.toFixed(2)}s | ${(dashWarmStats.tti.mean - workWarmStats.tti.mean).toFixed(2)}s (${((dashWarmStats.tti.mean - workWarmStats.tti.mean) / dashWarmStats.tti.mean * 100).toFixed(1)}%) |\n`;
  report += `| FCP | ${dashWarmStats.fcp.mean.toFixed(2)}s | ${workWarmStats.fcp.mean.toFixed(2)}s | ${(dashWarmStats.fcp.mean - workWarmStats.fcp.mean).toFixed(2)}s (${((dashWarmStats.fcp.mean - workWarmStats.fcp.mean) / dashWarmStats.fcp.mean * 100).toFixed(1)}%) |\n`;
  report += `| CLS | ${dashWarmStats.cls.mean.toFixed(3)} | ${workWarmStats.cls.mean.toFixed(3)} | ${((dashWarmStats.cls.mean - workWarmStats.cls.mean) / dashWarmStats.cls.mean * 100).toFixed(1)}% better |\n\n`;
  
  report += `## Conclusion\n\n`;
  report += `Both platforms benefit from cached assets, but Workspace maintains its performance advantage `;
  report += `in both cold and warm cache scenarios. This indicates that the performance improvements are `;
  report += `fundamental to the application architecture, not just caching behavior.\n`;
  
  fs.writeFileSync(reportPath, report);
  console.log(`✅ Report generated: ${reportPath}`);
}
