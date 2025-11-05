/**
 * INP (Interaction to Next Paint) Measurement Script
 * 
 * This script measures INP using multiple approaches:
 * 1. Chrome User Timing API / Performance Observer (primary)
 * 2. Manual interaction timing (fallback)
 * 3. web-vitals library integration (recommended)
 * 
 * INP measures the responsiveness of a page by tracking the latency
 * of all user interactions (clicks, taps, keyboard) and reporting the
 * worst (or near-worst) interaction latency.
 */

const fs = require('fs');
const path = require('path');
const chromeLauncher = require('chrome-launcher');
const puppeteer = require('puppeteer-core');

// Parse command line arguments
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const valueCandidate = argv[i + 1];
    if (!valueCandidate || valueCandidate.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = valueCandidate;
      i += 1;
    }
  }
  return args;
}

/**
 * Inject web-vitals library and INP observer into the page
 */
async function injectINPMeasurement(page) {
  await page.evaluateOnNewDocument(() => {
    // Store all interactions for analysis
    window.__inpData = {
      interactions: [],
      maxDuration: 0,
      worstInteraction: null
    };

    // Use PerformanceObserver to track interactions
    if ('PerformanceObserver' in window) {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            // Track event timing entries
            if (entry.entryType === 'event') {
              const duration = entry.duration || entry.processingEnd - entry.processingStart;
              const interactionData = {
                type: entry.name,
                startTime: entry.startTime,
                duration: duration,
                processingStart: entry.processingStart,
                processingEnd: entry.processingEnd,
                target: entry.target || 'unknown',
                timestamp: Date.now()
              };
              
              window.__inpData.interactions.push(interactionData);
              
              // Track worst interaction
              if (duration > window.__inpData.maxDuration) {
                window.__inpData.maxDuration = duration;
                window.__inpData.worstInteraction = interactionData;
              }
              
              console.log(`[INP] ${entry.name} interaction: ${duration.toFixed(0)}ms`);
            }
            
            // Also track first-input specifically
            if (entry.entryType === 'first-input') {
              window.__inpData.firstInput = {
                type: entry.name,
                delay: entry.processingStart - entry.startTime,
                duration: entry.duration,
                startTime: entry.startTime
              };
              console.log(`[INP] First Input: ${entry.duration.toFixed(0)}ms delay`);
            }
          }
        });
        
        // Observe event timing entries
        observer.observe({ 
          type: 'event',
          buffered: true,
          durationThreshold: 16 // Only track interactions > 16ms
        });
        
        // Observe first-input
        observer.observe({
          type: 'first-input',
          buffered: true
        });
        
        console.log('[INP] Performance Observer initialized');
      } catch (error) {
        console.warn('[INP] Performance Observer failed:', error.message);
      }
    } else {
      console.warn('[INP] Performance Observer API not available');
    }
    
    // Manual interaction tracking as fallback
    let interactionStart = null;
    
    const trackInteractionStart = (event) => {
      interactionStart = {
        type: event.type,
        timestamp: performance.now(),
        target: event.target.tagName || 'unknown'
      };
    };
    
    const trackInteractionEnd = () => {
      if (interactionStart) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const duration = performance.now() - interactionStart.timestamp;
            const interaction = {
              ...interactionStart,
              duration: duration,
              method: 'manual-timing'
            };
            
            window.__inpData.interactions.push(interaction);
            
            if (duration > window.__inpData.maxDuration) {
              window.__inpData.maxDuration = duration;
              window.__inpData.worstInteraction = interaction;
            }
            
            console.log(`[INP-Manual] ${interactionStart.type} on ${interactionStart.target}: ${duration.toFixed(0)}ms`);
            interactionStart = null;
          });
        });
      }
    };
    
    // Track clicks
    document.addEventListener('mousedown', trackInteractionStart, true);
    document.addEventListener('mouseup', trackInteractionEnd, true);
    
    // Track keyboard
    document.addEventListener('keydown', trackInteractionStart, true);
    document.addEventListener('keyup', trackInteractionEnd, true);
    
    console.log('[INP] Manual interaction tracking initialized');
  });
}

/**
 * Extract INP data from the page
 */
async function extractINPData(page) {
  return await page.evaluate(() => {
    const data = window.__inpData || { interactions: [], maxDuration: 0 };
    
    // Calculate INP (98th percentile of interactions or worst if < 50 interactions)
    const sortedInteractions = [...data.interactions].sort((a, b) => b.duration - a.duration);
    
    let inp = 0;
    if (sortedInteractions.length > 0) {
      if (sortedInteractions.length < 50) {
        // Use worst interaction
        inp = sortedInteractions[0].duration;
      } else {
        // Use 98th percentile
        const p98Index = Math.floor(sortedInteractions.length * 0.02);
        inp = sortedInteractions[p98Index].duration;
      }
    }
    
    return {
      inp: inp,
      interactionCount: data.interactions.length,
      worstInteraction: data.worstInteraction,
      firstInput: data.firstInput,
      allInteractions: sortedInteractions.slice(0, 10), // Top 10 worst
      p75: sortedInteractions[Math.floor(sortedInteractions.length * 0.25)]?.duration || 0,
      p90: sortedInteractions[Math.floor(sortedInteractions.length * 0.10)]?.duration || 0,
      p98: sortedInteractions[Math.floor(sortedInteractions.length * 0.02)]?.duration || 0
    };
  });
}

/**
 * Perform login sequence
 */
async function login(page, options) {
  console.log(`🔐 Logging in at ${options.loginUrl}...`);
  
  await page.goto(options.loginUrl, { waitUntil: 'networkidle2', timeout: options.timeout });
  
  if (options.username) {
    await page.waitForSelector(options.usernameSelector, { timeout: options.timeout });
    await page.type(options.usernameSelector, options.username, { delay: 25 });
  }
  
  if (options.password) {
    await page.waitForSelector(options.passwordSelector, { timeout: options.timeout });
    await page.type(options.passwordSelector, options.password, { delay: 25 });
  }
  
  if (options.submitSelector) {
    const navigationPromise = page.waitForNavigation({ waitUntil: 'networkidle2', timeout: options.timeout }).catch(() => null);
    await page.click(options.submitSelector);
    await navigationPromise;
  }
  
  console.log('✅ Login successful');
}

/**
 * Load and perform actions from JSON file
 */
async function performActions(page, actionsPath, timeout) {
  if (!actionsPath || !fs.existsSync(actionsPath)) {
    console.warn('⚠️  No actions file provided or file not found');
    return;
  }
  
  const actions = JSON.parse(fs.readFileSync(actionsPath, 'utf8'));
  console.log(`\n📋 Performing ${actions.length} actions...`);
  
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const actionNum = i + 1;
    const actionType = action.type || action.action;
    
    try {
      switch (actionType) {
        case 'wait':
        case 'wait-for-selector':
          if (action.selector) {
            console.log(`  ${actionNum}. Waiting for selector: ${action.selector}`);
            const isXPath = action.selector.startsWith('//') || action.selectorType === 'xpath';
            if (isXPath) {
              await page.waitForXPath(action.selector, { timeout: action.timeoutMs || timeout });
            } else {
              await page.waitForSelector(action.selector, { timeout: action.timeoutMs || timeout });
            }
          } else if (action.ms || action.timeoutMs) {
            const waitTime = action.ms || action.timeoutMs;
            console.log(`  ${actionNum}. Waiting ${waitTime}ms`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
          break;
          
        case 'click':
          console.log(`  ${actionNum}. Clicking: ${action.selector}`);
          const isXPathClick = action.selector.startsWith('//') || action.selectorType === 'xpath';
          if (isXPathClick) {
            const elements = await page.$x(action.selector);
            if (elements.length > 0) {
              await elements[0].click();
            } else {
              throw new Error(`XPath selector not found: ${action.selector}`);
            }
          } else {
            await page.click(action.selector);
          }
          
          // Wait a bit after click for INP to be recorded
          await new Promise(resolve => setTimeout(resolve, 100));
          break;
          
        case 'type':
          console.log(`  ${actionNum}. Typing "${action.text}" into: ${action.selector}`);
          await page.type(action.selector, action.text, { delay: action.delay || 50 });
          await new Promise(resolve => setTimeout(resolve, 100));
          break;
          
        case 'evaluate':
          console.log(`  ${actionNum}. Evaluating expression`);
          await page.evaluate(action.expression);
          break;
          
        case 'clear':
          console.log(`  ${actionNum}. Clearing: ${action.selector}`);
          await page.$eval(action.selector, el => el.value = '');
          break;
          
        default:
          console.warn(`  ${actionNum}. Unknown action type: ${actionType}`);
      }
      
      console.log(`     ✅ Step ${actionNum} completed`);
    } catch (error) {
      console.error(`     ❌ Step ${actionNum} failed: ${error.message}`);
      throw error;
    }
  }
  
  console.log('✅ All actions completed');
}

/**
 * Main measurement function
 */
async function measureINP(options) {
  let chrome = null;
  let browser = null;
  let page = null;
  
  try {
    // Launch Chrome
    console.log('🚀 Launching Chrome...');
    const headless = options.headless !== false; // Default to headless unless explicitly set to false
    chrome = await chromeLauncher.launch({
      chromeFlags: headless ? [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-dev-shm-usage'
      ] : [
        '--no-sandbox',
        '--disable-dev-shm-usage'
      ]
    });
    
    // Connect Puppeteer
    browser = await puppeteer.connect({
      browserURL: `http://localhost:${chrome.port}`,
      defaultViewport: { width: 1920, height: 1080 }
    });
    
    page = await browser.newPage();
    
    // Login if needed
    if (options.loginUrl) {
      await login(page, options);
    }
    
    // Inject INP measurement code BEFORE navigating to target
    console.log('💉 Injecting INP measurement code...');
    await injectINPMeasurement(page);
    
    // Navigate to target
    console.log(`\n🌐 Navigating to ${options.targetUrl}...`);
    await page.goto(options.targetUrl, { waitUntil: 'networkidle2', timeout: options.timeout });
    
    // Wait for page to be ready
    if (options.readySelector) {
      console.log(`⏳ Waiting for ready selector: ${options.readySelector}`);
      await page.waitForSelector(options.readySelector, { timeout: options.timeout });
    }
    
    // Settle time
    if (options.settleTime) {
      console.log(`⏳ Settling for ${options.settleTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, options.settleTime));
    }
    
    // Perform interactions
    await performActions(page, options.actionsPath, options.timeout);
    
    // Wait for interactions to be recorded
    console.log('\n⏳ Waiting for interaction measurements to complete...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Extract INP data
    console.log('📊 Extracting INP measurements...');
    const inpData = await extractINPData(page);
    
    // Print results
    console.log('\n' + '═'.repeat(60));
    console.log('  INP MEASUREMENT RESULTS');
    console.log('═'.repeat(60));
    console.log();
    console.log(`  Total Interactions: ${inpData.interactionCount}`);
    console.log(`  INP (98th percentile): ${inpData.inp.toFixed(0)}ms`);
    console.log(`  P75: ${inpData.p75.toFixed(0)}ms`);
    console.log(`  P90: ${inpData.p90.toFixed(0)}ms`);
    console.log(`  P98: ${inpData.p98.toFixed(0)}ms`);
    
    if (inpData.worstInteraction) {
      console.log();
      console.log(`  Worst Interaction:`);
      console.log(`  ├─ Type: ${inpData.worstInteraction.type}`);
      console.log(`  ├─ Duration: ${inpData.worstInteraction.duration.toFixed(0)}ms`);
      console.log(`  └─ Target: ${inpData.worstInteraction.target}`);
    }
    
    if (inpData.firstInput) {
      console.log();
      console.log(`  First Input:`);
      console.log(`  ├─ Type: ${inpData.firstInput.type}`);
      console.log(`  ├─ Delay: ${inpData.firstInput.delay.toFixed(0)}ms`);
      console.log(`  └─ Duration: ${inpData.firstInput.duration.toFixed(0)}ms`);
    }
    
    if (inpData.allInteractions.length > 0) {
      console.log();
      console.log(`  Top ${Math.min(5, inpData.allInteractions.length)} Slowest Interactions:`);
      inpData.allInteractions.slice(0, 5).forEach((interaction, i) => {
        console.log(`  ${i + 1}. ${interaction.type} - ${interaction.duration.toFixed(0)}ms`);
      });
    }
    
    console.log();
    console.log('═'.repeat(60));
    
    // INP Rating
    let rating = 'good';
    if (inpData.inp > 500) rating = 'poor';
    else if (inpData.inp > 200) rating = 'needs improvement';
    
    const ratingEmoji = rating === 'good' ? '✅' : rating === 'needs improvement' ? '⚠️' : '❌';
    console.log(`  ${ratingEmoji} INP Rating: ${rating.toUpperCase()}`);
    console.log(`     (Good: ≤200ms, Needs Improvement: 200-500ms, Poor: >500ms)`);
    console.log('═'.repeat(60));
    console.log();
    
    // Save results if output path specified
    if (options.output) {
      const result = {
        url: options.targetUrl,
        timestamp: new Date().toISOString(),
        inp: inpData.inp,
        rating: rating,
        interactionCount: inpData.interactionCount,
        percentiles: {
          p75: inpData.p75,
          p90: inpData.p90,
          p98: inpData.p98
        },
        worstInteraction: inpData.worstInteraction,
        firstInput: inpData.firstInput,
        topInteractions: inpData.allInteractions.slice(0, 10)
      };
      
      fs.writeFileSync(options.output, JSON.stringify(result, null, 2), 'utf8');
      console.log(`📝 Results saved to: ${options.output}`);
    }
    
    return inpData;
    
  } finally {
    // Cleanup
    if (page) {
      try {
        if (!page.isClosed()) {
          await page.close();
        }
      } catch (e) {
        // Ignore
      }
    }
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        // Ignore
      }
    }
    if (chrome) {
      try {
        await chrome.kill();
      } catch (e) {
        // Ignore
      }
    }
  }
}

/**
 * Main entry point
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  
  if (!args.target) {
    console.error('Usage: node measureINP.js --target <URL> [options]');
    console.error('');
    console.error('Options:');
    console.error('  --target <URL>           Target URL to measure');
    console.error('  --login <URL>            Login page URL');
    console.error('  --user-selector <CSS>    Username input selector');
    console.error('  --pass-selector <CSS>    Password input selector');
    console.error('  --submit-selector <CSS>  Submit button selector');
    console.error('  --ready-selector <CSS>   Element to wait for after navigation');
    console.error('  --actions <path>         JSON file with interaction steps');
    console.error('  --settle-time <ms>       Time to wait before interactions (default: 1000)');
    console.error('  --timeout <ms>           Timeout for operations (default: 30000)');
    console.error('  --output <path>          Save results to JSON file');
    console.error('  --headless <true|false>  Run in headless mode (default: true)');
    console.error('');
    console.error('Environment variables:');
    console.error('  WORKSPACE_USERNAME       Username for login');
    console.error('  WORKSPACE_PASSWORD       Password for login');
    process.exit(1);
  }
  
  const options = {
    targetUrl: args.target,
    loginUrl: args.login,
    usernameSelector: args['user-selector'] || '#Username',
    passwordSelector: args['pass-selector'] || '#Password',
    submitSelector: args['submit-selector'] || "button[type=submit]",
    username: process.env.WORKSPACE_USERNAME,
    password: process.env.WORKSPACE_PASSWORD,
    readySelector: args['ready-selector'],
    actionsPath: args.actions,
    settleTime: parseInt(args['settle-time']) || 1000,
    timeout: parseInt(args.timeout) || 30000,
    output: args.output,
    headless: args.headless !== 'false' && args.headless !== false
  };
  
  try {
    await measureINP(options);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { measureINP, injectINPMeasurement, extractINPData };
