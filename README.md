# Global Sentiment Dashboard (Static UI)

This repo is a **static, client-side dashboard** (HTML/CSS/JS) that loads a JSON dataset and renders:

- A **Strategic Brief** narrative view (KPIs + a Chart.js bar chart)
- An **Institutional Resilience Matrix** table (D3-driven) with links to school PDF reports

## How to run

No build step is required.

- Open `dashboard/index.html` in a browser, **or**
- Serve the `dashboard/` folder with any static server (recommended so `fetch()` works reliably).

Example (any one of these):

```bash
python -m http.server 8000
```

Then open `http://localhost:8000/dashboard/`.

## UI runtime files (required)

The UI only depends on these local files:

- `dashboard/index.html`
- `dashboard/styles.css`
- `dashboard/script.js`
- `dashboard/full_dashboard_data.json` (loaded by `fetch('full_dashboard_data.json')`)

Optional content used by UI clicks:

- `dashboard/School_Reports/*.pdf` (opened in a new tab when you click a school name)

External libraries are loaded via CDN:

- D3 (`d3.v7`)
- Chart.js

## Non-UI / tooling files (not required to view the dashboard)

- `dashboard/code/` contains Python helper scripts used to prepare/inspect data. These are **not used by the browser UI at runtime**.
- `dashboard/data/` may contain intermediate/alternate data files. The current UI loads the JSON file at `dashboard/full_dashboard_data.json`.


