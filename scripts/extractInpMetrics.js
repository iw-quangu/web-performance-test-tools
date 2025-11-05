const fs = require('fs');

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: node extractInpMetrics.js <path-to-flow-json>');
  process.exit(1);
}

const flowPath = args[0];

try {
  const flowData = JSON.parse(fs.readFileSync(flowPath, 'utf8'));
  
  console.log('\n=== Performance Report ===\n');
  
  // Process each step in the flow
  flowData.steps.forEach((step, index) => {
    console.log(`Step ${index + 1}: ${step.name || 'Unnamed Step'}`);
    console.log(`Mode: ${step.lhr.gatherMode}`);
    
    // Extract key metrics from audits
    const audits = step.lhr.audits;
    
    if (step.lhr.gatherMode === 'navigation') {
      // Navigation metrics
      const metrics = {
        'FCP': audits['first-contentful-paint'],
        'LCP': audits['largest-contentful-paint'],
        'TBT': audits['total-blocking-time'],
        'CLS': audits['cumulative-layout-shift'],
        'Speed Index': audits['speed-index'],
        'TTI': audits['interactive']
      };
      
      Object.entries(metrics).forEach(([key, audit]) => {
        if (audit && audit.numericValue !== undefined) {
          const value = audit.numericValue;
          const unit = audit.numericUnit === 'millisecond' ? 'ms' : '';
          const displayValue = audit.displayValue || `${value.toFixed(0)}${unit}`;
          console.log(`  ${key}: ${displayValue}`);
        }
      });
    } else if (step.lhr.gatherMode === 'timespan') {
      // Timespan metrics (INP, TBT during interactions)
      const inpMetrics = [];
      
      // Check for INP in audits
      if (audits['experimental-interaction-to-next-paint']) {
        const inp = audits['experimental-interaction-to-next-paint'];
        console.log(`  INP: ${inp.displayValue || inp.numericValue + 'ms'}`);
        
        // Extract interaction details if available
        if (inp.details && inp.details.items) {
          console.log(`  Interactions detected: ${inp.details.items.length}`);
          inp.details.items.forEach((item, i) => {
            console.log(`    ${i + 1}. ${item.interactionType || 'Unknown'}: ${item.duration}ms`);
          });
        }
      }
      
      // Check for TBT during timespan
      if (audits['total-blocking-time']) {
        const tbt = audits['total-blocking-time'];
        console.log(`  TBT (during interactions): ${tbt.displayValue || tbt.numericValue + 'ms'}`);
      }
      
      // Check for layout shifts
      if (audits['cumulative-layout-shift']) {
        const cls = audits['cumulative-layout-shift'];
        console.log(`  CLS (during interactions): ${cls.displayValue || cls.numericValue}`);
      }
    }
    
    console.log('');
  });
  
  // Print INP config if available
  if (flowData.inpData) {
    console.log('\n=== INP Interaction Analysis ===\n');
    flowData.inpData.forEach((interaction, i) => {
      console.log(`Interaction ${i + 1}: ${interaction.selector}`);
      console.log(`  Description: ${interaction.interaction}`);
      if (interaction.duration) {
        console.log(`  Duration: ${interaction.duration}ms`);
      }
    });
  }
  
} catch (error) {
  console.error('Error processing file:', error.message);
  process.exit(1);
}
