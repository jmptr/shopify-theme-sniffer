# Shopify Theme Sniffer — Product Specification

## Overview

A Chrome (Manifest V3) browser extension that detects Shopify storefronts and enables users to back up product catalog data for competitive and market research. Backed data is stored locally in IndexedDB and can be exported as JSON.

---

## 1. Shopify Detection

### Strategy
High-confidence detection only. The extension activates exclusively on confirmed Shopify signals to avoid false positives.

### Signal
| Signal | Method |
|---|---|
| `window.Shopify.shop` is a non-empty string | Content script reads `window.Shopify.shop` at `document_idle`. This property is set exclusively by the Shopify theme runtime on storefront pages and contains the shop's canonical `*.myshopify.com` domain (e.g. `"my-store.myshopify.com"`). Its presence is high-confidence — no network request needed. The value is captured and forwarded to the service worker as the `storefront_id` and API origin. |

> **Domain key:** `window.Shopify.shop` (e.g. `"my-store.myshopify.com"`) is the canonical `storefront_id` and the base origin for the Storefront GraphQL API (`https://{window.Shopify.shop}/api/2026-01/graphql.json`).

### Behavior on Detection
- Extension icon badge changes to **green**.
- Badge text is cleared (no number).
- Clicking the icon opens the **popup** with store info and a **Start Backup** button.

### Behavior on Non-Shopify Pages
- Icon badge is grey / inactive.
- Clicking the icon opens the popup with a "No Shopify store detected" message.

---

## 2. Data Scope

### In Scope
Only the following are fetched via the **Shopify Storefront GraphQL API**:

- **Products** — title, handle, description (HTML), tags, vendor, product type, created/updated timestamps
- **Variants** — title, SKU, price, compare-at price, inventory policy, weight, option values
- **Product Images** — URL (CDN), alt text, width, height (no blob download; images lazy-load from CDN when viewed)

> **Note:** Only published products are returned by the Storefront API. Unpublished/draft/archived products are not accessible without Admin API credentials and are therefore out of scope.

### Out of Scope
- Collections, pages, blog articles, metafields (not selected)
- Theme liquid/asset files (not accessible without Admin API)
- Orders, customers, inventory (require Admin API credentials)
- Unpublished, draft, or archived products

### API

`POST https://{window.Shopify.shop}/api/2026-01/graphql.json`

No credentials or access token required. `Content-Type: application/json` is the only required header. Pagination is cursor-based via `pageInfo.hasNextPage` and `endCursor`. The total product count is obtained from `products { totalCount }` in the first request and stored in `backup_cursors.total_products`.

```graphql
query getProducts($cursor: String) {
  products(first: 250, after: $cursor) {
    totalCount
    pageInfo {
      hasNextPage
      endCursor
    }
    nodes {
      id
      title
      handle
      descriptionHtml
      vendor
      productType
      tags
      createdAt
      updatedAt
      images(first: 250) {
        nodes {
          url
          altText
          width
          height
        }
      }
      variants(first: 250) {
        nodes {
          id
          title
          sku
          price { amount currencyCode }
          compareAtPrice { amount currencyCode }
          inventoryPolicy
          weight
          weightUnit
          selectedOptions { name value }
        }
      }
    }
  }
}
```

> `totalCount` is only present on the first request (when `$cursor` is null); subsequent pages omit it.

---

## 3. Backup Process

### Trigger
User clicks **Start Backup** in the popup. The popup may be closed after initiation.

### Execution Environment
The backup runs in the **Manifest V3 background service worker**. Progress persists even if the popup or any tab is closed.

### Pagination

The service worker sends the query with `first: 250` and tracks `pageInfo.endCursor` as the checkpoint in `backup_cursors.cursor`. Iteration continues while `pageInfo.hasNextPage` is `true`. The first request (cursor `null`) includes `products { totalCount }`, which is stored in `backup_cursors.total_products` and used to render a determinate progress bar immediately. Batch size: 250 products per request (endpoint maximum).

### Rate Limiting

The Storefront API uses a cost-based leaky-bucket throttle. The extension uses a fixed **500ms courtesy delay between each paginated request**. On a `429` response or a `THROTTLED` error in the GraphQL `extensions.cost` field: wait for the `Retry-After` header duration (default 2000ms if absent), then retry once.

### Incremental Backup
Product IDs are used as stable keys. On a re-backup of the same store:
- Records with matching IDs are **updated** if any field has changed.
- Records with matching IDs and no changes are **skipped**.
- New product IDs are **inserted**.
- Products no longer returned by the API are **left in place** (not deleted), marked with a `removed_at` timestamp.

### Service Worker Interruption
If Chrome terminates the service worker (idle timeout, system sleep):
- On the next wake, the service worker checks IndexedDB for an in-progress backup with a saved cursor.
- If found, it **auto-resumes silently** from the last checkpoint.
- A log entry records: `"Backup interrupted at cursor {X}, auto-resumed at {timestamp}"`.
- No user prompt is shown.

### Completion
On successful completion:
- Service worker writes a final status record to IndexedDB.
- Sends a **Chrome browser notification**: `"Backup complete: {store-domain} — {N} products backed up."`

### Quota Handling
Before starting a backup, the **popup** calls `navigator.storage.persist()` to request durable storage and includes the boolean result in the `START_BACKUP` or `UPDATE_BACKUP` message payload as `persistGranted`. (Service workers do not have reliable access to `navigator.storage.persist()`; this must be called from a page context.)

If an `QuotaExceededError` is thrown mid-backup:
- Backup halts immediately.
- The partial data already written is kept.
- A Chrome notification is sent: `"Backup stopped: Storage quota exceeded for {store-domain}. Open the extension to review."`
- The backup status is marked `partial` in IndexedDB.

---

## 4. Storage Architecture (IndexedDB)

### Database Name
`shopify-theme-sniffer`

### Object Stores

#### `storefronts`
| Field | Type | Description |
|---|---|---|
| `id` | string (PK) | `window.Shopify.shop` value (e.g. `my-store.myshopify.com`) — unique per storefront |
| `domain` | string | Display domain |
| `last_backup_at` | ISO timestamp | Last successful or partial backup completion time |
| `backup_status` | `'complete'` \| `'partial'` \| `'in-progress'` \| `'paused'` \| `'never'` | Current backup health |
| `product_count` | number | Count of products in store's current snapshot |
| `size_bytes` | number | Estimated bytes consumed in IndexedDB |
| `created_at` | ISO timestamp | First time store was backed up |

#### `products`
| Field | Type | Description |
|---|---|---|
| `id` | string (PK) | `{storefront_id}::{shopify_product_id}` |
| `storefront_id` | string (index) | Foreign key to `storefronts` |
| `shopify_id` | string | Shopify numeric product ID (e.g. `"123456789"`) |
| `title` | string | |
| `handle` | string | URL slug |
| `description_html` | string | Full HTML description (maps from `descriptionHtml` in GraphQL response) |
| `vendor` | string | |
| `product_type` | string | |
| `tags` | string[] | |
| `images` | `{url, alt, width, height}[]` | CDN URLs only (maps from `images.nodes[].url` in GraphQL response) |
| `variants` | variant object[] | See below |
| `created_at` | ISO timestamp | Shopify creation date |
| `updated_at` | ISO timestamp | Shopify last update |
| `sniffer_updated_at` | ISO timestamp | Last time this record was written by the extension |
| `removed_at` | ISO timestamp \| null | Set if product disappeared from API |

**Variant fields:** `id`, `title`, `sku`, `price`, `compare_at_price`, `inventory_policy`, `weight`, `weight_unit`, `option1`, `option2`, `option3`

> `price` and `compare_at_price` are stored as the `amount` string from the `MoneyV2` object (e.g. `"29.99"`). `option1/2/3` are derived from `selectedOptions[0/1/2].value`.

#### `backup_cursors`
| Field | Type | Description |
|---|---|---|
| `storefront_id` | string (PK) | |
| `cursor` | string \| null | Last `pageInfo.endCursor` value returned by the Storefront API; `null` before the first page is fetched |
| `started_at` | ISO timestamp | |
| `products_fetched` | number | Running count |
| `total_products` | number \| null | Total from `products { totalCount }` in the first GraphQL response; `null` until that response is received |

#### `logs`
| Field | Type | Description |
|---|---|---|
| `id` | auto-increment (PK) | |
| `storefront_id` | string (index) | |
| `timestamp` | ISO timestamp | |
| `level` | `'info'` \| `'warn'` \| `'error'` | |
| `message` | string | Human-readable summary |
| `detail` | object \| null | Raw data: API endpoint, HTTP status, record count, cursor, response time ms |

---

## 5. UI Architecture

### 5.1 Popup

**Dimensions:** Standard Chrome extension popup (~380px wide).

**States:**

**State A — No Shopify detected**
- Grey icon.
- Text: "No Shopify store detected on this page."
- Link: "Open Dashboard"

**State B — Shopify detected, no prior backup**
- Green badge.
- Store domain displayed prominently.
- Shop domain from `window.Shopify.shop` displayed (e.g. `my-store.myshopify.com`).
- Large primary button: **Start Backup**
- Link: "Open Dashboard"

**State C — Backup in progress**
- Green badge with animated indicator.
- Store domain.
- Progress: "Fetching products… 1,250 / ~5,000 estimated"
- Progress bar (determinate from the start — `totalCount` is returned in the first GraphQL response).
- **Pause** button (pauses after current batch completes).
- Link: "View Logs"

**State D — Shopify detected, prior backup exists**
- Green badge.
- Store domain.
- Last backup: date/time + status badge (Complete / Partial).
- Product count from last backup.
- **Update Backup** button (runs incremental).
- Link: "Open Dashboard"

**State E — Backup paused**
- Green badge.
- Store domain.
- Status: "Backup paused — {N} products fetched so far."
- **Resume** button (continues from last cursor).
- **Cancel** button (marks backup `partial`, clears cursor).
- Link: "View Logs"

### 5.2 Dashboard (Full Extension Page)

**URL:** `chrome-extension://{id}/dashboard.html`

**Accessed via:** "Open Dashboard" link in popup, or extension options.

#### Storefront List

A sortable table with one row per backed-up storefront.

| Column | Content |
|---|---|
| Domain | Canonical store domain |
| Products | Count of products in snapshot |
| Status | Pill badge: Complete / Partial / In Progress |
| Last Backup | Relative time (e.g. "2 hours ago") with absolute on hover |
| Size | Human-readable MB (e.g. "12.4 MB") |
| Actions | Export JSON button, Delete button |

**Sorting:** Clickable column headers. Default sort: Last Backup descending.

**Delete:** Clicking Delete shows an inline confirmation ("Delete all data for {domain}? This cannot be undone.") before removing all records from IndexedDB.

#### Export
Clicking **Export JSON** for a storefront triggers a file download: `{domain}-{YYYY-MM-DD}.json`

**JSON structure:**
```json
{
  "exported_at": "2025-08-01T12:00:00Z",
  "storefront": {
    "domain": "example.com",
    "product_count": 1250,
    "last_backup_at": "2025-08-01T11:45:00Z",
    "backup_status": "complete"
  },
  "products": [
    {
      "id": "123456789",
      "title": "...",
      "handle": "...",
      "variants": [...],
      "images": [...]
    }
  ]
}
```

### 5.3 Log Page (Full Extension Page)

**URL:** `chrome-extension://{id}/logs.html`

**Accessed via:** "View Logs" link in popup, tab in Dashboard.

**Features:**
- Filter by storefront (dropdown), log level (Info / Warn / Error), and date range.
- Virtualized list for performance (logs can be thousands of entries for large stores).
- Each row: timestamp, level badge, storefront domain, message, expandable detail panel (raw API response metadata).
- **Clear Logs** button (confirms before clearing, scoped to selected storefront or all).
- Auto-prune: logs older than 30 days are purged at most once per calendar day. The service worker stores a `last_prune_at` timestamp in `chrome.storage.local`; on each startup it skips pruning if fewer than 24 hours have elapsed since the last prune.

---

## 6. Extension Manifest (MV3 Summary)

```json
{
  "manifest_version": 3,
  "permissions": ["storage", "unlimitedStorage", "notifications", "tabs"],
  "host_permissions": ["https://*/*"],
  "background": { "service_worker": "background.js" },
  "action": { "default_popup": "popup.html" },
  "content_scripts": [{
    "matches": ["https://*/*"],
    "js": ["content.js"],
    "run_at": "document_idle"
  }]
}
```

**Content script role:** Detects Shopify signals on the page, sends a message to the service worker with the result. Does NOT make API calls.

**Service worker role:** Owns all IndexedDB reads/writes and all fetch calls to the shop's public JSON endpoints. Responds to messages from content scripts and popup.

**Popup role:** Reads state from service worker via `chrome.runtime.sendMessage`. Sends Start/Update/Pause/Resume/Cancel commands. Calls `navigator.storage.persist()` before initiating a backup and forwards the result to the service worker in the message payload.

---

## 7. Messaging Protocol (Content Script ↔ Service Worker ↔ Popup)

| Message | From | To | Payload |
|---|---|---|---|
| `SHOPIFY_DETECTED` | Content script | Service worker | `{ domain, shop }` — `shop` is the `window.Shopify.shop` value (e.g. `"my-store.myshopify.com"`) |
| `SHOPIFY_NOT_DETECTED` | Content script | Service worker | `{ domain }` |
| `GET_POPUP_STATE` | Popup | Service worker | `{ tabId }` |
| `POPUP_STATE` | Service worker | Popup | `{ detected, domain, shop, backupStatus, lastBackupAt, productCount, progress }` |
| `START_BACKUP` | Popup | Service worker | `{ storefront_id, persistGranted }` |
| `UPDATE_BACKUP` | Popup | Service worker | `{ storefront_id, persistGranted }` |
| `PAUSE_BACKUP` | Popup | Service worker | `{ storefront_id }` |
| `RESUME_BACKUP` | Popup | Service worker | `{ storefront_id }` |
| `CANCEL_BACKUP` | Popup | Service worker | `{ storefront_id }` |
| `BACKUP_PROGRESS` | Service worker | Popup | `{ storefront_id, fetched, estimated }` |

---

## 8. Error States

| Scenario | User-Facing Behavior |
|---|---|
| Store is password-protected | `/products.json` returns a redirect to `/password`. Extension detects non-200 final response, shows: "This store is password-protected. Backup not possible." One log entry written, no further spam. |
| Network offline during backup | Service worker pauses and logs a warning. It registers a `chrome.alarms` alarm with a 30-second delay; on alarm fire it probes connectivity with a HEAD request to the shop domain, and resumes if successful. |
| Unexpected non-200 response | Log the status code and response body. Mark backup `partial`. Send notification. |
| `QuotaExceededError` | Halt backup. Notify user. Mark `partial`. Keep partial data. |
| Service worker terminated mid-backup | Auto-resume from cursor on next wake. Log the gap. |

---

## 9. Out of Scope (v1)

- Firefox support
- Collections, pages, blog posts, metafields
- Image blob storage
- Shopify Admin API (requires credentials)
- Cloud sync or cross-device backup
- Multiple backup versions / snapshot history per store
- In-extension product browser / search UI
- Scheduled / automatic backups
