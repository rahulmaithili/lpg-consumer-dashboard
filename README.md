# LPG Consumer Portal - Dashboard & Bulk Search Tool

A professional, high-fidelity Single Page Application (SPA) dashboard built with vanilla web technologies to analyze, filter, and extract consumer metrics from your active LPG reports.

## Features

1. **Dashboard & Analytics**:
   - Visual charts (eKYC verification, cylinder package distribution, connection types, and supply areas) powered by **Chart.js**.
   - Important KPIs (total counts, eKYC rates, active connections, and security deposit totals).
2. **IndexedDB Data Caching**:
   - Parses the CSV in the browser using **PapaParse**.
   - Automatically saves the data in your browser's local IndexedDB. It loads instantly upon page reload, so you only upload once!
   - Click **"Remove Data"** in the sidebar to purge browser storage and upload a new report.
3. **All Consumers Directory**:
   - Displays all consumer rows using page-by-page pagination (50 items/page) to prevent browser lag.
   - Live typeahead filtering allows searches across Names, IDs, Areas, or packages instantly.
4. **Bulk Search Engine**:
   - Paste consumer numbers separated by spaces, commas, or new lines.
   - Matches records in milliseconds and shows them in an interactive results table.
   - **Export Sheet**: Download matched results instantly as a clean CSV spreadsheet.
   - **Print PDF**: Generate a clean, printed PDF ledger of the matched list.
5. **Interactive Profile Cards**:
   - Click "View" or "View Details" on any consumer to display their profile styled like an invoice/receipt.
   - Click "Print Profile" in the profile header to print or save the customer sheet as an A4 PDF document.
6. **Responsive Dark/Light Mode**:
   - Easily switch between themes with the toggler in the top-right corner.

---

## How to Run the Tool

This tool runs **entirely in your web browser** and does not send any data to external servers.

### Option 1: Direct Run (Easiest)
1. Navigate to the project directory: `c:\Users\USER\Music\Retulator entry tol\`
2. Double-click the `index.html` file to open it in Google Chrome, Microsoft Edge, or Mozilla Firefox.
3. Drag-and-drop or browse your local file `ActiveConsumer_Report.csv`.

### Option 2: Run via Dev Server (Recommended for full browser compatibility)
Using a local dev server avoids strict browser local-file sandboxing checks (CORS policies) that might trigger on certain versions of Safari or Chrome.
1. Make sure you have Node.js installed.
2. Open your terminal (PowerShell) and run:
   ```powershell
   npx -y lite-server --baseDir="c:\Users\USER\Music\Retulator entry tol"
   ```
3. Your browser will automatically open the dashboard at `http://localhost:3000`.

---

## Technical Details

- **index.html**: Layout and container setup.
- **styles.css**: Themes variables, layouts, and print overrides.
- **app.js**: CSV uploads, IndexedDB read/write transactions, Chart.js graph engines, and data processing.
