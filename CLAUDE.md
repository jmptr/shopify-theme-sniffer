# Shopify Theme Sniffer

Chrome Extension (Manifest V3) that detects Shopify storefronts and backs up their product catalog data to local IndexedDB.

## Tech Stack

- **Language:** TypeScript (strict mode, ES2022 target)
- **UI:** Vanilla HTML/CSS/JS (no framework)
- **Storage:** IndexedDB via `idb` library
- **API:** Shopify Storefront GraphQL API (public, no auth)
- **Build:** esbuild with custom copy plugin
- **Target:** Chrome 120+

## Commands

```bash
npm install        # Install dependencies
npm run build      # Build extension to dist/
npm run watch      # Build + watch for changes
npm run clean      # Remove dist/
```

No test framework is configured. Load `dist/` as unpacked extension in Chrome for manual testing.

## Project Structure

```
src/
├── manifest.json       # Chrome MV3 manifest
├── background.ts       # Service worker entry — orchestrates messaging, alarms, recovery
├── content.ts          # Content script (ISOLATED world) — relays detection to service worker
├── detect.ts           # MAIN world script — reads window.Shopify.shop
├── types.ts            # Shared types & messaging protocol
├── db.ts               # IndexedDB schema & CRUD (storefronts, products, backup_cursors, logs)
├── messaging.ts        # Message routing, tab state tracking, badge management
├── backup.ts           # BackupEngine class — GraphQL pagination, rate limiting, pause/resume
├── lifecycle.ts        # Log pruning, offline recovery alarms, password detection
├── popup/              # Extension popup (5 UI states)
├── dashboard/          # Full-page storefront table with sort, delete, export
├── products/           # Full-page product viewer with sort, search, pagination, expand details
└── logs/               # Full-page log viewer with virtualized scrolling & filters
```

## Architecture

- **Detection:** `detect.ts` (MAIN world) reads `window.Shopify.shop` → posts to `content.ts` (ISOLATED world) → sends message to service worker
- **Backup:** `BackupEngine` fetches paginated GraphQL, upserts products into IndexedDB, tracks cursor for resume
- **Messaging:** Event-driven async messaging between popup ↔ service worker; no polling
- **Recovery:** Cursor-based resume on service worker restart; offline retry via Chrome Alarms (30s intervals)
- **Soft delete:** Removed products get `removed_at` timestamp, not deleted

## Key Patterns

- Service worker is the single source of truth for tab state and data access
- All IndexedDB access goes through `db.ts` module functions
- GraphQL responses transformed at boundary into Product records
- Popup renders one of 5 states based on detection + backup status
- Product viewer paginates results (default 10, configurable to 25/50/100)
- Log viewer uses DOM virtualization for performance
- Badge colors: green `#4CAF50` (detected), grey `#9E9E9E` (not detected)

## IndexedDB Schema (v1, database: `shopify-theme-sniffer`)

| Store | Primary Key | Indexes |
|-------|-------------|---------|
| storefronts | `id` (myshopify domain) | — |
| products | `id` (storefront_id::graphql_id) | `storefront_id` |
| backup_cursors | `storefront_id` | — |
| logs | `id` (auto-increment) | `storefront_id`, `timestamp` |

## Build Output

esbuild produces 7 IIFE bundles + copied static assets (HTML, CSS, icons, manifest) into `dist/`.

## Configuration Locations

- Extension permissions: `src/manifest.json`
- GraphQL endpoint & query: `src/backup.ts`
- DB schema & upgrades: `src/db.ts`
- Message types: `src/types.ts`
- Log prune interval (30 days): `src/lifecycle.ts`
- Offline retry delay (30s): `src/lifecycle.ts`
