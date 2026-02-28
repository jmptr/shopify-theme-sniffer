# Shopify Theme Sniffer

A Chrome extension that detects Shopify storefronts and backs up their product catalog data to IndexedDB for research.

## Features

- **Auto-detection** — Identifies Shopify stores as you browse via `window.Shopify.shop`
- **Product backup** — Fetches full product catalogs using the Shopify Storefront GraphQL API
- **Incremental updates** — Re-run backups to pick up new/changed products; removed products are flagged
- **Pause / Resume / Cancel** — Full control over long-running backups
- **Dashboard** — View all backed-up storefronts, sort by column, export to JSON
- **Log viewer** — Filterable, virtualized log of all extension activity

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- npm (included with Node.js)
- Google Chrome

## Build

```bash
# Install dependencies
npm install

# Build the extension (outputs to dist/)
npm run build

# Or watch for changes during development
npm run watch
```

## Load into Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `dist/` folder from this project
5. The extension icon will appear in your toolbar

## Usage

1. Browse to any Shopify-powered store (e.g. `allbirds.com`, `gymshark.com`)
2. The extension icon badge turns green when a Shopify store is detected
3. Click the extension icon to open the popup
4. Click **Start Backup** to begin fetching the product catalog
5. Use the **Dashboard** to view, export, or delete backed-up data
6. Use the **Log Viewer** to inspect backup activity and troubleshoot issues

## Project Structure

```
src/
  manifest.json        Chrome MV3 manifest
  background.ts        Service worker — orchestrates messaging, backup, lifecycle
  content.ts           Content script — detects Shopify storefronts
  db.ts                IndexedDB module (via idb library)
  types.ts             Shared TypeScript types
  messaging.ts         Message routing, badge updates, tab state
  backup.ts            Backup engine — GraphQL fetch, pagination, rate limiting
  lifecycle.ts         Log pruning, offline recovery, password-protection check
  popup/               Extension popup UI (5 states)
  dashboard/           Full-page dashboard with sortable table + JSON export
  logs/                Full-page log viewer with filters + virtual scroll
  icons/               Extension icons
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Build the extension to `dist/` |
| `npm run watch` | Build and watch for changes |
| `npm run clean` | Remove the `dist/` folder |
