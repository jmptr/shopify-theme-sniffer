# Shopify Theme Sniffer

Chrome Extension (Manifest V3) that detects Shopify storefronts and backs up their product catalog data to local IndexedDB.

## Tech Stack

- **Language:** TypeScript (strict mode, ES2022 target, JSX via `react-jsx`)
- **UI:** React 19 + shadcn/ui components + Tailwind CSS v4
- **Component primitives:** Radix UI (AlertDialog, Checkbox, Collapsible, Progress, Select, Slot)
- **Virtual scroll:** @tanstack/react-virtual (logs page)
- **Storage:** IndexedDB via `idb` library
- **API:** Shopify Storefront GraphQL API (public, no auth)
- **Build:** esbuild (JSX automatic transform) + PostCSS/Tailwind
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
├── styles/
│   └── global.css      # Tailwind CSS entry point (@import "tailwindcss")
├── lib/
│   ├── utils.ts        # cn() helper (clsx + tailwind-merge)
│   └── format.ts       # Shared formatters (formatRelativeTime, formatBytes, priceRange, etc.)
├── components/
│   ├── ui/             # shadcn/ui components (Button, Badge, Input, Progress, Table, AlertDialog, Checkbox)
│   └── shared/         # App-specific shared components (StatusBadge, SortableHeader, EmptyState)
├── popup/              # React popup (5 UI states, Chrome messaging via useEffect)
├── dashboard/          # React storefront table with sort, AlertDialog delete, JSON export
├── products/           # React product viewer with sort, search, pagination, expandable details
└── logs/               # React log viewer with @tanstack/react-virtual & filters
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
- **UI is React:** Each page (popup, dashboard, products, logs) is a separate React app with its own `ReactDOM.createRoot` entry point
- **shadcn/ui components** live in `src/components/ui/` as copied source (not npm package); shared app components in `src/components/shared/`
- **Shared utilities** in `src/lib/format.ts` — no duplicated formatters across pages
- Popup renders one of 5 states based on detection + backup status; Chrome messaging via `useEffect` hooks
- Product viewer uses 3 chained `useMemo` hooks: filter → sort → paginate (default 10, configurable to 25/50/100)
- Log viewer uses `@tanstack/react-virtual` `useVirtualizer` for virtualized scrolling
- Delete confirmations use shadcn `AlertDialog` (not `window.confirm()`)
- All styling via Tailwind CSS utility classes — no per-page CSS files
- Badge colors: green `#4CAF50` (detected), grey `#9E9E9E` (not detected)
- MV3 messaging APIs return Promises — use `.catch()` (not `try/catch`) to handle "Receiving end does not exist" errors
- `process.env.NODE_ENV` set to `"production"` in page bundles for MV3 CSP compliance (no `eval`)

## IndexedDB Schema (v1, database: `shopify-theme-sniffer`)

| Store | Primary Key | Indexes |
|-------|-------------|---------|
| storefronts | `id` (myshopify domain) | — |
| products | `id` (storefront_id::graphql_id) | `storefront_id` |
| backup_cursors | `storefront_id` | — |
| logs | `id` (auto-increment) | `storefront_id`, `timestamp` |

## Build Output

esbuild produces 7 IIFE bundles (3 background/content + 4 page React apps) + PostCSS compiles Tailwind CSS to `dist/styles/global.css` + copies static assets (HTML, icons, manifest) into `dist/`. Each page bundle includes React independently (~720-850KB uncompressed, IIFE format).

## Configuration Locations

- Extension permissions: `src/manifest.json`
- GraphQL endpoint & query: `src/backup.ts`
- DB schema & upgrades: `src/db.ts`
- Message types: `src/types.ts`
- Log prune interval (30 days): `src/lifecycle.ts`
- Offline retry delay (30s): `src/lifecycle.ts`
- Tailwind config: `tailwind.config.ts`
- PostCSS config: `postcss.config.mjs`
- Build config (esbuild + PostCSS): `esbuild.config.mjs`
- shadcn component source: `src/components/ui/`
- Shared formatters: `src/lib/format.ts`
