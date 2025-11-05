This investigation focuses on frontend (client-side) metrics and user experience — measuring how fast the Workspace loads, becomes interactive, and responds to user actions.
The new frontend architecture may impact load performance, rendering efficiency, and interactivity. We want to quantify the difference from the user’s perspective and identify opportunities for optimization.



**Goals**

* Measure and compare user-perceived performance between the old and new Workspaces.
* Recommend actionable performance improvements




**Scope**
Focus entirely on client-side performance metrics — the aspects of performance visible to end users:



| Area | What to Measure | Why It Matters |
| --- | --- | --- |
| Loading | \- First Contentful Paint (FCP)<br />\- Largest Contentful Paint (LCP)<br />\- Time to Interactive (TTI) | Measures how fast the Workspace appears and becomes usable |
| Interactivity | \- Interaction to Next Paint (INP)<br />\- Input latency for filters, tab switches, drill-downs | Reflects how responsive the UI feels to user input |
| Rendering Efficiency | \- React render and commit durations<br />\- Long tasks (\>50 ms)<br />\- Main thread blocking time | Helps identify rendering bottlenecks and UI jank |
| Network & Assets | \- Number and size of JS/CSS bundles<br />\- Caching and lazy loading behavior | Affects first load and repeat visits |



**Test Scenarios**

* Initial Workspace load (cold cache)
* Warm load (repeat visit with cached assets)
* Filter application (date filters,...)
* Stress test — multiple widgets loaded concurrently




**Tasks**

* Define test users and representative Workspace configurations
* Collect metrics for the old Workspace
* Collect metrics for the new Workspace
* Compare and summarize results
* Identify top frontend bottlenecks
* Propose optimization actions