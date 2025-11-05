# Web Performance Testing Framework

**Purpose:** Compare client-side performance between Dashboard (AngularJS) and Workspace (React) platforms to validate migration decisions and identify optimization opportunities.

---

## 📊 What This Framework Does

Measures user-perceived performance through automated testing:

### Core Metrics

- **Time to Interactive (TTI)** - When users can interact with the page
- **First Contentful Paint (FCP)** - Initial rendering speed
- **Largest Contentful Paint (LCP)** - Main content visibility
- **Total Blocking Time (TBT)** - Main thread responsiveness
- **Cumulative Layout Shift (CLS)** - Visual stability
- **Speed Index** - Visual loading progression

### Analysis Types

- **Baseline Performance** - Optimal conditions (no throttling)
- **Network Throttling** - Mobile network simulation (Fast4G)
- **Cache Behavior** - Cold vs warm cache comparison
- **Bundle Analysis** - JavaScript and CSS resource efficiency

### Test Scenarios

- **Dashboard:** Customer search workflow on CustomPage/15 (10 steps)
- **Workspace:** Identical customer search on workspace/?id=15 (10 steps)

Both scenarios test the same user workflow to ensure fair comparison.

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** v16 or higher
- **npm** or **yarn**
- **Chrome** browser (installed automatically via Puppeteer)
- **Valid credentials** for the target application

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd web-performance-test-tools

# Install dependencies
npm install
```

### Configuration

Create a `.env` file in the project root:

```env
WORKSPACE_USERNAME=your_username
WORKSPACE_PASSWORD=your_password
```

### ⚡ One Command to Rule Them All

Run the complete test suite with a single command:

```bash
npm run test:all
```

**This will automatically:**

- ✅ Run 5 baseline tests (Dashboard + Workspace)
- ✅ Run 6 Fast4G throttled tests  
- ✅ Run 16 warm cache tests (cold + warm)
- ✅ Generate 4 comprehensive markdown reports
- ✅ Display summary with all results

**Time:** ~30-45 minutes | **Output:** `./reports/*.md`

### Alternative Commands

```bash
# Run only baseline tests (no throttling)
npm run test:baseline

# Run only throttled tests (Fast4G network)
npm run test:throttled

# Run only warm cache tests
npm run test:warmcache

# Generate reports from existing test data
npm run reports

# Generate all analysis reports
npm run analyze:all
```

---

## 📁 Project Structure

```
web-performance-test-tools/
├── .env                        # Credentials (not in git)
├── .env.example                # Example credentials file
├── package.json                # NPM scripts and dependencies
├── README.md                   # This file (for humans)
├── AI_CONTEXT.md               # Context for AI assistants
├── REQUIREMENTS.md             # Original requirements (reference)
│
├── scenarios/                  # Test scenario definitions
│   ├── dashboard-interactions.json
│   └── workspace-interactions.json
│
├── scripts/                    # Test execution scripts
│   ├── runCompleteTestSuite.js      # Master orchestrator
│   ├── runMultipleTests.js          # Multi-run test runner
│   ├── runWarmCacheTests.js         # Cold/warm cache tester
│   ├── runInteractionFlow.js        # Core Lighthouse runner
│   ├── analyzeMultipleRuns.js       # Baseline analysis
│   ├── compareThrottledResults.js   # Throttling analysis
│   ├── analyzeWarmCacheResults.js   # Cache analysis
│   └── extractBundleSizes.js        # Bundle analysis
│
└── reports/                    # Generated reports
    ├── EXECUTIVE_PRESENTATION.md    # Executive summary
    ├── baseline_analysis_YYYY-MM-DD.md
    ├── throttled_comparison_YYYY-MM-DD.md
    ├── warmcache_analysis_YYYY-MM-DD.md
    ├── bundle_analysis_YYYY-MM-DD.md
    └── raw/                    # Raw Lighthouse JSON data
        ├── dashboard/          # Dashboard test results
        ├── dashboard-warm/     # Dashboard warm cache results
        ├── workspace/          # Workspace test results
        └── workspace-warm/     # Workspace warm cache results
```

---

## 🔧 Core Scripts

### 1. Single Test Execution

**`runInteractionFlow.js`** - Runs a single Lighthouse test with custom interactions.

```bash
node scripts/runInteractionFlow.js \
  --scenarios "scenarios/scenario.json" \
  --scenario-index 0 \
  --output "reports/raw/test/report.json" \
  --headless false \
  --clear-cache \
  --throttle fast-4g
```

**Options:**

- `--scenarios` - Path to scenarios JSON file (recommended)
- `--scenario-index` - Select scenario by index (0-based, default: 0)
- `--scenario-id` - Select scenario by name
- `--output` - Output path for Lighthouse report
- `--headless` - Run in headless mode (default: true)
- `--clear-cache` - Clear browser cache before test
- `--throttle` - Network throttling preset (fast-4g, slow-4g, slow-3g)

### 2. Multi-Run Testing

**`runMultipleTests.js`** - Runs multiple test iterations for statistical validity.

```bash
node scripts/runMultipleTests.js \
  --scenario "scenarios/scenario.json" \
  --runs 5 \
  --output-dir "reports/raw/myapp"
```

**Why multiple runs?**

- Reduces noise from system variability
- Provides statistical confidence (mean, standard deviation, coefficient of variation)
- Industry best practice: 3-5 runs minimum

### 3. Statistical Analysis

**`analyzeMultipleRuns.js`** - Analyzes multiple test runs with statistical metrics.

```bash
node scripts/analyzeMultipleRuns.js \
  --dir "reports/raw/myapp" \
  --output "reports/myapp-analysis.md" \
  --report
```

**Outputs:**

- Mean, Standard Deviation, Coefficient of Variation for each metric
- Performance budget compliance
- Statistical confidence indicators

### 4. Warm Cache Testing

**`runWarmCacheTests.js`** - Tests cold vs warm cache performance.

```bash
node scripts/runWarmCacheTests.js \
  --dashboard "scenarios/dashboard-interactions.json" \
  --workspace "scenarios/workspace-interactions.json" \
  --runs 3
```

**How it works:**

1. Runs cold cache test (with `--clear-cache`)
2. Immediately runs warm cache test (without clearing)
3. Repeats for specified iterations
4. Measures cache benefit for each scenario

### 5. Bundle Size Analysis

**`extractBundleSizes.js`** - Extracts and compares JavaScript/CSS bundle sizes.

```bash
node scripts/extractBundleSizes.js \
  --dashboard "reports/raw/dashboard" \
  --workspace "reports/raw/workspace" \
  --output "reports/bundle-analysis.md" \
  --report
```

**Analyzes:**

- Total JS/CSS bundle sizes
- Number of network requests
- Compression ratios
- Top 10 largest bundles

### 6. Network Throttling Comparison

**`compareThrottledResults.js`** - Compares performance under different network conditions.

```bash
node scripts/compareThrottledResults.js \
  --baseline-dir "reports/raw/baseline" \
  --throttled-dir "reports/raw/fast4g" \
  --output "reports/throttling-comparison.md" \
  --report
```

---

## 📝 Creating Test Scenarios

Test scenarios define the user interactions to simulate during testing.

### Scenario File Format

Create a JSON file in the `scenarios/` directory:

```json
{
  "scenarios": [
    {
      "name": "Customer Search Flow",
      "url": "https://app.example.com/page",
      "loginUrl": "https://app.example.com/login",
      "loginConfig": {
        "usernameSelector": "#username",
        "passwordSelector": "#password",
        "submitSelector": "button[type=submit]"
      },
      "actions": [
        {
          "type": "wait-for-selector",
          "selector": "input#search",
          "timeoutMs": 30000,
          "description": "Wait for search input"
        },
        {
          "type": "click",
          "selector": "input#search",
          "description": "Focus search input"
        },
        {
          "type": "type",
          "selector": "input#search",
          "text": "search query",
          "description": "Enter search term"
        }
      ]
    }
  ]
}
```

### Supported Action Types

- **`click`** - Click an element
  ```json
  { "type": "click", "selector": "button.submit", "description": "Submit form" }
  ```

- **`type`** - Enter text into an input
  ```json
  { "type": "type", "selector": "input#email", "value": "user@example.com", "description": "Enter email" }
  ```

- **`wait-for-selector`** - Wait for element to appear
  ```json
  { "type": "wait-for-selector", "selector": "div.loaded", "description": "Wait for content" }
  ```

- **`select`** - Select dropdown option
  ```json
  { "type": "select", "selector": "select#country", "value": "USA", "description": "Select country" }
  ```

### Finding the Right Selectors

Use **Chrome DevTools** to identify selectors:

1. Open the page in Chrome
2. Right-click element → Inspect
3. In DevTools Console, test selectors:
   ```javascript
   document.querySelector('button#submit')  // Should return the element
   ```

---

## 📊 Understanding the Results

### Key Performance Metrics

| Metric | Description | Good Target |
|--------|-------------|-------------|
| **FCP** | First Contentful Paint - When first content appears | < 1.8s |
| **LCP** | Largest Contentful Paint - When main content is visible | < 2.5s |
| **TTI** | Time to Interactive - When page is fully interactive | < 3.9s |
| **TBT** | Total Blocking Time - How responsive the page is | < 300ms |
| **CLS** | Cumulative Layout Shift - Visual stability | < 0.1 |
| **Speed Index** | How quickly content is visually displayed | < 3.4s |

### Statistical Indicators

- **Mean** - Average value across all runs
- **SD (Standard Deviation)** - How much variation exists
- **CV (Coefficient of Variation)** - Relative variability (lower is better)
  - CV < 5%: Excellent consistency
  - CV < 10%: Good consistency
  - CV < 20%: Acceptable for most metrics
  - CV > 20%: Consider more test runs

### Example Output

```
=== DASHBOARD STATISTICS (5 runs) ===

Time to Interactive (TTI):
  Mean: 8,233 ms
  Standard Deviation: 156 ms
  Coefficient of Variation: 1.89% ✓ Excellent

Total Blocking Time (TBT):
  Mean: 928 ms
  Standard Deviation: 45 ms
  Coefficient of Variation: 4.85% ✓ Excellent
```

---

## 🌐 Network Throttling

Simulate mobile network conditions to test real-world performance.

### Available Presets

- **`fast-4g`** - 4 Mbps down, 3 Mbps up, 20ms latency (recommended)
- **`slow-4g`** - 1.6 Mbps down, 768 Kbps up, 150ms latency
- **`slow-3g`** - 400 Kbps down, 400 Kbps up, 400ms latency

### Usage

```bash
node scripts/runInteractionFlow.js \
  --scenarios "scenarios/app.json" \
  --throttle fast-4g \
  --output "reports/raw/throttled/report.json"
```

### Comparison Testing

```bash
# Run baseline tests (no throttling)
node scripts/runMultipleTests.js --scenario "scenarios/app.json" --runs 3 --output-dir "reports/raw/baseline"

# Run throttled tests
node scripts/runMultipleTests.js --scenario "scenarios/app.json" --runs 3 --output-dir "reports/raw/fast4g" --throttle fast-4g

# Compare results
node scripts/compareThrottledResults.js \
  --baseline-dir "reports/raw/baseline" \
  --throttled-dir "reports/raw/fast4g" \
  --output "reports/throttling-impact.md" \
  --report
```

---

## 🎯 Best Practices

### 1. Test Consistency

- **Run multiple iterations** (3-5 runs minimum)
- **Test at consistent times** (avoid peak system load)
- **Close unnecessary applications** during testing
- **Use the same machine** for comparison tests
- **Wait between test runs** (5-10 seconds) to allow system stabilization

### 2. Scenario Design

- **Test real user workflows** (not artificial scenarios)
- **Include authentication** if required by your app
- **Wait for dynamic content** to load
- **Test critical paths** that impact business metrics
- **Keep scenarios focused** (5-10 interactions ideal)

### 3. Comparison Testing

When comparing two applications, ensure both scenarios test the **same user workflow** for valid comparison.

### 4. Network Throttling

- **Always test with throttling** for mobile users
- **Fast 4G is recommended** as a realistic baseline
- **Compare throttled vs non-throttled** to see impact

### 5. Cache Testing

- **Test both cold and warm cache** scenarios
- **Cold cache** = First-time visitor experience
- **Warm cache** = Returning visitor experience

---

## 🔍 Advanced Usage

### Custom Lighthouse Configuration

Edit `runInteractionFlow.js` to customize Lighthouse settings:

```javascript
const lighthouseConfig = {
  extends: 'lighthouse:default',
  settings: {
    formFactor: 'desktop',  // or 'mobile'
    screenEmulation: {
      mobile: false,
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      disabled: false
    },
    throttling: {
      rttMs: 20,
      throughputKbps: 4096,
      cpuSlowdownMultiplier: 1
    }
  }
};
```

---

## 🛠️ Troubleshooting

### Common Issues

**1. "Timeout waiting for selector"**

- Verify the selector exists on the page
- Increase timeout: Add `--settle-time 10000` flag
- Test selector in Chrome DevTools Console
- Check if element is in an iframe or shadow DOM

**2. "Login failed"**

- Verify credentials in `.env` file
- Check if login page URL is correct
- Inspect login flow in browser with `--headless false`
- Ensure login button selector is correct

**3. "High coefficient of variation (CV)"**

- Run more test iterations (5-7 runs)
- Close background applications
- Test at consistent times
- Some metrics (CLS) naturally have higher CV

**4. "Chrome process not closing"**

Manually kill Chrome processes:

```powershell
# Windows PowerShell
Get-Process chrome | Stop-Process -Force
```

**5. "Out of memory errors"**

- Reduce parallel test runs
- Clear reports/raw directory periodically
- Increase Node.js memory: `$env:NODE_OPTIONS="--max-old-space-size=4096"`

### Debug Mode

Run with visible browser to see what's happening:

```bash
node scripts/runInteractionFlow.js \
  --scenarios "scenarios/app.json" \
  --headless false \
  --output "reports/debug.json"
```

---

## 📚 Real-World Example

This framework was used to validate the migration from **Dashboard (AngularJS)** to **Workspace (React)**.

**Test Results:**

- **Time to Interactive**: Workspace 1.52s faster (19.7% improvement)
- **Total Blocking Time**: Workspace 197ms faster (26.2% improvement)
- **Cumulative Layout Shift**: Workspace 96.7% better
- **Bundle Size**: Workspace 2.3 MB smaller (30.5% reduction)
- **Cache Efficiency**: Dashboard degrades (-158ms), Workspace improves (+369ms)

See `reports/EXECUTIVE_PRESENTATION.md` for the complete case study.

---

## 🤝 Contributing

Feel free to extend this framework for your needs:

1. Add new analysis scripts to `scripts/`
2. Create reusable scenario templates in `scenarios/`
3. Document your findings in `reports/`

---

## 📄 License

This project is provided as-is for performance testing purposes.

---

## 🆘 Support

For questions or issues:

1. Review this README
2. Check `AI_CONTEXT.md` for detailed technical context
3. Review generated reports for specific metrics
4. Check scenario files for test definitions

---

**Last Updated:** November 6, 2025  
**Framework Version:** 1.0.0

**Happy Testing!** 🚀
