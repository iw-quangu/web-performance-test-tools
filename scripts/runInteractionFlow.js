require('dotenv').config();
const fs = require('fs');
const path = require('path');
const chromeLauncher = require('chrome-launcher');
const puppeteer = require('puppeteer-core');
const lighthouse = require('lighthouse');

// Network throttling presets
const NETWORK_PRESETS = {
  'Fast3G': {
    offline: false,
    downloadThroughput: 1.6 * 1024 * 1024 / 8,  // 1.6 Mbps
    uploadThroughput: 750 * 1024 / 8,           // 750 Kbps
    latency: 150                                 // 150ms RTT
  },
  'Slow3G': {
    offline: false,
    downloadThroughput: 500 * 1024 / 8,         // 500 Kbps
    uploadThroughput: 500 * 1024 / 8,           // 500 Kbps
    latency: 400                                 // 400ms RTT
  },
  'Fast4G': {
    offline: false,
    downloadThroughput: 4 * 1024 * 1024 / 8,    // 4 Mbps
    uploadThroughput: 3 * 1024 * 1024 / 8,      // 3 Mbps
    latency: 20                                  // 20ms RTT
  },
  'Slow4G': {
    offline: false,
    downloadThroughput: 9 * 1024 * 1024 / 8,    // 9 Mbps
    uploadThroughput: 9 * 1024 * 1024 / 8,      // 9 Mbps
    latency: 170                                 // 170ms RTT
  }
};

async function applyNetworkThrottling(page, throttlePreset) {
  const preset = NETWORK_PRESETS[throttlePreset];
  if (!preset) {
    console.warn(`Unknown throttling preset: ${throttlePreset}. Available: ${Object.keys(NETWORK_PRESETS).join(', ')}`);
    return;
  }
  
  console.log(`🌐 Applying network throttling: ${throttlePreset}`);
  console.log(`   Download: ${(preset.downloadThroughput * 8 / 1024 / 1024).toFixed(2)} Mbps`);
  console.log(`   Upload: ${(preset.uploadThroughput * 8 / 1024 / 1024).toFixed(2)} Mbps`);
  console.log(`   Latency: ${preset.latency}ms`);
  
  const client = await page.target().createCDPSession();
  await client.send('Network.emulateNetworkConditions', preset);
}

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

async function loginForFlow(browser, options) {
  const page = await browser.newPage();
  
  // Apply network throttling if specified
  if (options.networkThrottle) {
    await applyNetworkThrottling(page, options.networkThrottle);
  }
  
  const navigationOptions = {waitUntil: 'networkidle2', timeout: options.timeoutMs};

  await page.goto(options.loginUrl || options.targetUrl, navigationOptions);

  if (options.usernameSelector && options.username) {
    await page.waitForSelector(options.usernameSelector, {timeout: options.timeoutMs});
    await page.type(options.usernameSelector, options.username, {delay: 25});
  }

  if (options.passwordSelector && options.password) {
    await page.waitForSelector(options.passwordSelector, {timeout: options.timeoutMs});
    await page.type(options.passwordSelector, options.password, {delay: 25});
  }

  if (options.submitSelector) {
    const navigationPromise = page.waitForNavigation(navigationOptions).catch(() => null);
    await page.click(options.submitSelector);
    await navigationPromise;
  }

  if (options.postLoginSelector) {
    await page.waitForSelector(options.postLoginSelector, {timeout: options.timeoutMs});
  }

  await page.goto(options.targetUrl, navigationOptions);

  if (options.readySelector) {
    await page.waitForSelector(options.readySelector, {timeout: options.timeoutMs});
  }

  if (options.settleTimeMs) {
    await new Promise((resolve) => setTimeout(resolve, options.settleTimeMs));
  }

  return page;
}

function loadActions(actionsPath) {
  if (!actionsPath) return [];
  const absolutePath = path.resolve(actionsPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Actions file not found: ${absolutePath}`);
  }
  const raw = fs.readFileSync(absolutePath, 'utf8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) {
    throw new Error('Actions file must export an array of action steps.');
  }
  return data;
}

function loadScenarios(scenariosPath) {
  if (!scenariosPath) return null;
  const absolutePath = path.resolve(scenariosPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Scenarios file not found: ${absolutePath}`);
  }
  const raw = fs.readFileSync(absolutePath, 'utf8');
  const data = JSON.parse(raw);
  
  // Support both old format (array) and new format (object with scenarios)
  if (Array.isArray(data)) {
    // Old format: just actions
    return { legacy: true, actions: data };
  }
  
  if (data.scenarios && Array.isArray(data.scenarios)) {
    // New format: scenarios array
    return { legacy: false, scenarios: data.scenarios };
  }
  
  throw new Error('Scenarios file must export either an array of actions (legacy) or an object with a scenarios array.');
}

function ensureSelectorString(selector) {
  if (selector == null) return selector;
  if (typeof selector !== 'string') {
    throw new Error(`Selector must be a string. Received ${typeof selector}: ${JSON.stringify(selector)}`);
  }
  return selector;
}

function isXPath(selector, selectorType) {
  if (selectorType) return selectorType.toLowerCase() === 'xpath';
  if (!selector) return false;
  const normalized = ensureSelectorString(selector);
  return normalized.startsWith('//') || normalized.startsWith('xpath=') || normalized.startsWith('(');
}

function normalizeSelector(selector) {
  if (!selector) return selector;
  const normalizedSelector = ensureSelectorString(selector);
  if (normalizedSelector.startsWith('xpath=')) return normalizedSelector.slice(6);
  return normalizedSelector;
}

async function waitForElement(page, selector, timeout, selectorType) {
  const useXPath = isXPath(selector, selectorType);
  const normalized = normalizeSelector(selector);
  if (useXPath) {
    return page.waitForSelector(`xpath/${normalized}`, {timeout});
  }
  return page.waitForSelector(normalized, {timeout});
}

async function getElementHandle(page, selector, timeout, selectorType) {
  const useXPath = isXPath(selector, selectorType);
  const normalized = normalizeSelector(selector);
  if (useXPath) {
    const handle = await page.waitForSelector(`xpath/${normalized}`, {timeout});
    if (!handle) throw new Error(`XPath not found: ${normalized}`);
    return handle;
  }
  await page.waitForSelector(normalized, {timeout});
  const handle = await page.$(normalized);
  if (!handle) throw new Error(`Selector not found: ${normalized}`);
  return handle;
}

async function clickElement(page, action, defaults) {
  const timeout = action.timeoutMs ?? defaults.timeoutMs;
  const selector = action.selector;
  const handle = await getElementHandle(page, selector, timeout, action.selectorType);
  if (action.waitForNavigation) {
    const navigationOptions = {waitUntil: action.waitUntil || 'networkidle2', timeout};
    const navigationPromise = page.waitForNavigation(navigationOptions).catch(() => null);
    await handle.click({delay: action.delay ?? defaults.clickDelay});
    await navigationPromise;
  } else {
    await handle.click({delay: action.delay ?? defaults.clickDelay});
  }
  await handle.dispose().catch(() => {});
}

async function typeIntoElement(page, action, defaults) {
  const timeout = action.timeoutMs ?? defaults.timeoutMs;
  const selector = action.selector;
  const handle = await getElementHandle(page, selector, timeout, action.selectorType);
  await handle.type(action.text ?? '', {delay: action.delay ?? defaults.typeDelay});
  await handle.dispose().catch(() => {});
}

async function performAction(page, action, defaults) {
  const timeout = action.timeoutMs ?? defaults.timeoutMs;
  const description = action.description ? ` (${action.description})` : '';
  console.log(`→ ${action.type}${description}`);

  switch (action.type) {
    case 'wait-for-selector':
      if (!action.selector) throw new Error('wait-for-selector requires selector.');
      await waitForElement(page, action.selector, timeout, action.selectorType);
      break;
    case 'click':
      if (!action.selector) throw new Error('click action requires selector.');
      await clickElement(page, action, defaults);
      break;
    case 'type':
      if (!action.selector) throw new Error('type action requires selector.');
      await typeIntoElement(page, action, defaults);
      break;
    case 'press':
      if (!action.key) throw new Error('press action requires key.');
      await page.keyboard.press(action.key, {delay: action.delay ?? defaults.keyDelay});
      break;
    case 'wait':
      await new Promise((resolve) => setTimeout(resolve, action.ms ?? defaults.waitMs));
      break;
    case 'evaluate':
      if (!action.expression) throw new Error('evaluate action requires expression.');
      if (typeof action.expression === 'string') {
        await page.evaluate(new Function(action.expression));
      } else {
        throw new Error('evaluate action must supply expression as string.');
      }
      break;
    case 'scroll-to':
      await page.evaluate(({x = 0, y = 0}) => window.scrollTo(x, y), {x: action.x, y: action.y});
      if (action.waitAfterMs) await page.waitForTimeout(action.waitAfterMs);
      break;
    default:
      throw new Error(`Unsupported action type: ${action.type}`);
  }
}

async function runInteractionFlow(args) {
  // Load scenarios or actions
  const scenariosData = loadScenarios(args.actions || args.scenarios);
  
  let targetUrl, loginUrl, loginConfig, actions, scenarioName;
  
  if (scenariosData.legacy) {
    // Legacy format: actions array
    if (!args.target) throw new Error('Missing required argument: --target <workspace URL>');
    targetUrl = args.target;
    loginUrl = args.login;
    loginConfig = {
      usernameSelector: args['user-selector'],
      passwordSelector: args['pass-selector'],
      submitSelector: args['submit-selector'],
      postLoginSelector: args['post-login-selector']
    };
    actions = scenariosData.actions;
    scenarioName = args['flow-name'] || 'Interaction flow';
  } else {
    // New format: scenarios array
    const scenarioIndex = args['scenario-index'] ? Number(args['scenario-index']) : 0;
    const scenarioId = args['scenario-id'];
    
    let scenario;
    if (scenarioId) {
      scenario = scenariosData.scenarios.find(s => s.name === scenarioId);
      if (!scenario) {
        throw new Error(`Scenario not found: ${scenarioId}. Available: ${scenariosData.scenarios.map(s => s.name).join(', ')}`);
      }
    } else {
      scenario = scenariosData.scenarios[scenarioIndex];
      if (!scenario) {
        throw new Error(`Scenario index ${scenarioIndex} out of range. Available: 0-${scenariosData.scenarios.length - 1}`);
      }
    }
    
    // Extract scenario configuration
    targetUrl = scenario.url || args.target;
    loginUrl = scenario.loginUrl || args.login;
    loginConfig = scenario.loginConfig || {
      usernameSelector: args['user-selector'],
      passwordSelector: args['pass-selector'],
      submitSelector: args['submit-selector'],
      postLoginSelector: args['post-login-selector']
    };
    actions = scenario.actions || [];
    scenarioName = scenario.name || args['flow-name'] || 'Interaction flow';
    
    if (!targetUrl) {
      throw new Error('No target URL found in scenario or command line arguments');
    }
  }
  
  const remoteDebugPort = args.port ? Number(args.port) : 9222;
  const username = args.username || (args['username-env'] ? process.env[args['username-env']] : process.env.WORKSPACE_USERNAME);
  const password = args.password || (args['password-env'] ? process.env[args['password-env']] : process.env.WORKSPACE_PASSWORD);
  const timeoutMs = args['timeout-ms'] ? Number(args['timeout-ms']) : 30000;
  const settleTimeMs = args['settle-ms'] ? Number(args['settle-ms']) : 2000;
  const networkThrottle = args['network-throttle'] || args.throttle;

  const resolvedUserDataDir = args['user-data-dir'] ? path.resolve(args['user-data-dir']) : undefined;
  if (resolvedUserDataDir) {
    fs.mkdirSync(resolvedUserDataDir, {recursive: true});
  }

  const chrome = await chromeLauncher.launch({
    port: remoteDebugPort,
    userDataDir: resolvedUserDataDir,
    chromeFlags: (() => {
      const flags = [
        `--remote-debugging-port=${remoteDebugPort}`,
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-features=Translate',
        '--ignore-certificate-errors',
        '--window-size=1280,720',
        ...(args.headless === 'false' ? [] : ['--headless=new']),
      ];

      if (args['chrome-flag']) {
        const extraFlag = Array.isArray(args['chrome-flag']) ? args['chrome-flag'] : [args['chrome-flag']];
        flags.push(...extraFlag);
      }

      return flags;
    })(),
  });

  const browserURL = `http://127.0.0.1:${chrome.port}`;

  async function connectWithRetry(attempt = 0) {
    try {
      return await puppeteer.connect({browserURL, defaultViewport: null});
    } catch (error) {
      if (attempt >= 10) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
      return connectWithRetry(attempt + 1);
    }
  }

  const browser = await connectWithRetry();
  
  // Clear cache if requested
  if (args['clear-cache']) {
    console.log('🗑️  Clearing browser cache and cookies...');
    const pages = await browser.pages();
    if (pages.length > 0) {
      const client = await pages[0].target().createCDPSession();
      await client.send('Network.clearBrowserCache');
      await client.send('Network.clearBrowserCookies');
    }
  }
  
  const defaults = {
    timeoutMs,
    clickDelay: 50,
    typeDelay: 25,
    keyDelay: 25,
    waitMs: 500,
  };

  let page;

  try {
    page = await loginForFlow(browser, {
      loginUrl: loginUrl,
      targetUrl: targetUrl,
      usernameSelector: loginConfig.usernameSelector,
      passwordSelector: loginConfig.passwordSelector,
      submitSelector: loginConfig.submitSelector,
      postLoginSelector: loginConfig.postLoginSelector || args['post-login-selector'],
      readySelector: args['ready-selector'],
      username,
      password,
      timeoutMs,
      settleTimeMs,
      networkThrottle,
    });

    const configModule = args.preset === 'mobile'
      ? await import('lighthouse/core/config/lr-mobile-config.js')
      : await import('lighthouse/core/config/desktop-config.js');
    const flowConfig = configModule.default;

    const flow = await lighthouse.startFlow(page, {
      name: args['flow-name'] || scenarioName,
      config: flowConfig,
      configContext: {
        settingsOverrides: {
          disableStorageReset: true,
          formFactor: args.preset === 'mobile' ? 'mobile' : 'desktop',
          emulatedFormFactor: args.preset === 'mobile' ? 'mobile' : 'desktop',
        },
      },
    });

    const navigationName = args['navigation-name'] || `${scenarioName} - Navigation`;
    console.log(`Running navigation step: ${navigationName}`);
    await flow.navigate(targetUrl, {name: navigationName});

    const postNavReady = args['post-navigation-selector'] || args['ready-selector'];
    if (postNavReady) {
      await page.waitForSelector(postNavReady, {timeout: timeoutMs});
    }

    if (actions.length > 0) {
      const timespanName = args['timespan-name'] || `${scenarioName} - Interactions`;
      console.log(`Starting timespan: ${timespanName}`);
      await flow.startTimespan({name: timespanName});
      for (const action of actions) {
        await performAction(page, action, defaults);
      }
      await flow.endTimespan();
    } else {
      console.warn('No interaction actions supplied; skipping timespan step.');
    }

    if (args['snapshot-name']) {
      console.log(`Capturing snapshot: ${args['snapshot-name']}`);
      await flow.snapshot({name: args['snapshot-name']});
    }

    const flowResult = await flow.createFlowResult();
    const outputPath = args.output || path.resolve(process.cwd(), 'workspace-flow.json');
    fs.writeFileSync(outputPath, JSON.stringify(flowResult, null, 2), 'utf8');
    console.log(`Flow JSON written to ${outputPath}`);

    if (args['html']) {
      const htmlReport = await flow.generateReport();
      const htmlPath = args['html'] === true ? outputPath.replace(/\.json$/i, '.html') : path.resolve(args['html']);
      fs.writeFileSync(htmlPath, htmlReport, 'utf8');
      console.log(`Flow HTML report written to ${htmlPath}`);
    }
  } finally {
    if (page && !page.isClosed()) {
      try {
        await page.close();
      } catch (error) {
        console.warn(`page.close warning: ${error.message || error}`);
      }
    }
    if (browser) {
      try {
        await browser.close();
      } catch (error) {
        console.warn(`browser.close warning: ${error.message || error}`);
      }
    }
    try {
      await chrome.kill();
    } catch (error) {
      console.warn(`chrome.kill warning: ${error.message || error}`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  try {
    await runInteractionFlow(args);
  } catch (error) {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  }
}

main();
