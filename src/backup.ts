import type { Product, ProductImage, ProductVariant } from './types';
import {
  getStorefront,
  putStorefront,
  putProducts,
  getProductCount,
  getBackupCursor,
  putBackupCursor,
  deleteBackupCursor,
  addLog,
  estimateStorefrontSize,
  markProductsRemoved,
} from './db';

// ---------------------------------------------------------------------------
// GraphQL response types
// ---------------------------------------------------------------------------

interface GqlMoney {
  amount: string;
  currencyCode: string;
}

interface GqlSelectedOption {
  name: string;
  value: string;
}

interface GqlVariantNode {
  id: string;
  title: string;
  sku: string;
  price: GqlMoney;
  compareAtPrice: GqlMoney | null;
  weight: number | null;
  weightUnit: string | null;
  selectedOptions: GqlSelectedOption[];
}

interface GqlImageNode {
  url: string;
  altText: string | null;
  width: number;
  height: number;
}

interface GqlProductNode {
  id: string;
  title: string;
  handle: string;
  descriptionHtml: string;
  vendor: string;
  productType: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  images: { nodes: GqlImageNode[] };
  variants: { nodes: GqlVariantNode[] };
}

interface GqlPageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface GqlProductsData {
  products: {
    pageInfo: GqlPageInfo;
    nodes: GqlProductNode[];
  };
}

interface GqlError {
  message: string;
  extensions?: { code?: string };
}

interface GqlResponse {
  data?: GqlProductsData;
  errors?: GqlError[];
}

// ---------------------------------------------------------------------------
// GraphQL query
// ---------------------------------------------------------------------------

const PRODUCTS_QUERY = `
query getProducts($cursor: String) {
  products(first: 250, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id title handle descriptionHtml vendor productType tags createdAt updatedAt
      images(first: 250) { nodes { url altText width height } }
      variants(first: 250) {
        nodes {
          id title sku
          price { amount currencyCode }
          compareAtPrice { amount currencyCode }
          weight weightUnit
          selectedOptions { name value }
        }
      }
    }
  }
}
`;

// ---------------------------------------------------------------------------
// Notification helper
// ---------------------------------------------------------------------------

function notify(title: string, message: string): void {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon-128.png',
    title,
    message,
  });
}

// ---------------------------------------------------------------------------
// Transform function
// ---------------------------------------------------------------------------

function extractShopifyId(gid: string): string {
  const parts = gid.split('/');
  return parts[parts.length - 1];
}

export function transformProduct(storefrontId: string, node: GqlProductNode): Product {
  const shopifyId = extractShopifyId(node.id);

  const images: ProductImage[] = node.images.nodes.map((img) => ({
    url: img.url,
    alt: img.altText,
    width: img.width,
    height: img.height,
  }));

  const variants: ProductVariant[] = node.variants.nodes.map((v) => ({
    id: v.id,
    title: v.title,
    sku: v.sku,
    price: v.price.amount,
    compare_at_price: v.compareAtPrice?.amount ?? null,
    inventory_policy: null,
    weight: v.weight,
    weight_unit: v.weightUnit,
    option1: v.selectedOptions[0]?.value ?? null,
    option2: v.selectedOptions[1]?.value ?? null,
    option3: v.selectedOptions[2]?.value ?? null,
  }));

  return {
    id: `${storefrontId}::${node.id}`,
    storefront_id: storefrontId,
    shopify_id: shopifyId,
    title: node.title,
    handle: node.handle,
    description_html: node.descriptionHtml,
    vendor: node.vendor,
    product_type: node.productType,
    tags: node.tags,
    images,
    variants,
    created_at: node.createdAt,
    updated_at: node.updatedAt,
    sniffer_updated_at: new Date().toISOString(),
    removed_at: null,
  };
}

// ---------------------------------------------------------------------------
// Utility: delay
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// BackupEngine
// ---------------------------------------------------------------------------

export class BackupEngine {
  private storefrontId: string;
  private paused: boolean = false;
  private cancelled: boolean = false;
  private onProgress: (fetched: number, estimated: number) => void;

  constructor(storefrontId: string, onProgress: (fetched: number, estimated: number) => void) {
    this.storefrontId = storefrontId;
    this.onProgress = onProgress;
  }

  async run(): Promise<void> {
    const sid = this.storefrontId;

    try {
      // 1. Get or create storefront record
      let storefront = await getStorefront(sid);
      const now = new Date().toISOString();

      if (!storefront) {
        storefront = {
          id: sid,
          domain: sid,
          last_backup_at: null,
          backup_status: 'in-progress',
          product_count: 0,
          size_bytes: 0,
          created_at: now,
        };
      } else {
        storefront = { ...storefront, backup_status: 'in-progress' };
      }
      await putStorefront(storefront);

      // 2. Get or create backup cursor
      let cursor = await getBackupCursor(sid);
      if (cursor && cursor.cursor !== null) {
        await addLog({
          storefront_id: sid,
          timestamp: new Date().toISOString(),
          level: 'info',
          message: 'Resuming backup from cursor',
          detail: { cursor: cursor.cursor, products_fetched: cursor.products_fetched },
        });
      }

      if (!cursor) {
        cursor = {
          storefront_id: sid,
          cursor: null,
          started_at: new Date().toISOString(),
          products_fetched: 0,
          total_products: null,
        };
        await putBackupCursor(cursor);
      }

      const seenIds = new Set<string>();

      // 3. Main pagination loop
      while (true) {
        // 3a. Check pause / cancel
        if (this.paused || this.cancelled) {
          break;
        }

        // 3b. Fetch GraphQL endpoint
        const response = await this.fetchPage(cursor.cursor);

        // 3c. Handle HTTP 429 or THROTTLED
        if (response.status === 429 || this.isThrottled(response.body)) {
          const retryAfter = parseInt(response.headers.get('Retry-After') ?? '', 10);
          const waitMs = Number.isFinite(retryAfter) ? retryAfter * 1000 : 2000;

          await addLog({
            storefront_id: sid,
            timestamp: new Date().toISOString(),
            level: 'warn',
            message: `Rate limited, retrying after ${waitMs}ms`,
            detail: null,
          });

          await delay(waitMs);

          // Retry once
          const retry = await this.fetchPage(cursor.cursor);
          if (retry.status === 429 || this.isThrottled(retry.body)) {
            await addLog({
              storefront_id: sid,
              timestamp: new Date().toISOString(),
              level: 'error',
              message: 'Rate limited on retry, stopping backup',
              detail: null,
            });
            await this.markPartial();
            return;
          }

          // Use retry response
          response.status = retry.status;
          response.body = retry.body;
          response.headers = retry.headers;
        }

        // 3d. Handle non-200
        if (response.status !== 200) {
          await addLog({
            storefront_id: sid,
            timestamp: new Date().toISOString(),
            level: 'error',
            message: `HTTP ${response.status} from GraphQL API`,
            detail: { body: response.body },
          });
          await this.markPartial();
          notify('Backup failed', `Backup stopped for ${sid}: HTTP ${response.status}`);
          return;
        }

        // 3e. Parse response
        const gqlResponse = response.body as GqlResponse;
        if (!gqlResponse.data) {
          await addLog({
            storefront_id: sid,
            timestamp: new Date().toISOString(),
            level: 'error',
            message: 'GraphQL response missing data',
            detail: { errors: gqlResponse.errors ?? null },
          });
          await this.markPartial();
          return;
        }

        const productsData = gqlResponse.data.products;

        // 3f. Transform and upsert products
        const products = productsData.nodes.map((node) => transformProduct(sid, node));
        await putProducts(products);

        // 3g. Track seen IDs
        for (const p of products) {
          seenIds.add(p.id);
        }

        // 3h. Update cursor
        cursor.products_fetched += productsData.nodes.length;
        cursor.cursor = productsData.pageInfo.endCursor;

        // 3i. Checkpoint cursor
        await putBackupCursor(cursor);

        // 3j. Progress callback
        this.onProgress(cursor.products_fetched, cursor.total_products ?? 0);

        // 3k/l. Check for more pages
        if (productsData.pageInfo.hasNextPage) {
          await delay(500); // courtesy delay
        } else {
          break;
        }
      }

      // 4. Post-loop handling
      if (this.cancelled) {
        await this.markPartial();
        await deleteBackupCursor(sid);
        await addLog({
          storefront_id: sid,
          timestamp: new Date().toISOString(),
          level: 'info',
          message: 'Backup cancelled by user',
          detail: null,
        });
        return;
      }

      if (this.paused) {
        storefront = { ...storefront, backup_status: 'paused' };
        await putStorefront(storefront);
        await addLog({
          storefront_id: sid,
          timestamp: new Date().toISOString(),
          level: 'info',
          message: 'Backup paused',
          detail: { products_fetched: cursor.products_fetched },
        });
        return;
      }

      // Completed normally
      const completedAt = new Date().toISOString();
      await markProductsRemoved(sid, seenIds, completedAt);

      const productCount = await getProductCount(sid);
      const sizeBytes = await estimateStorefrontSize(sid);

      storefront = {
        ...storefront,
        backup_status: 'complete',
        last_backup_at: completedAt,
        product_count: productCount,
        size_bytes: sizeBytes,
      };
      await putStorefront(storefront);
      await deleteBackupCursor(sid);

      await addLog({
        storefront_id: sid,
        timestamp: completedAt,
        level: 'info',
        message: 'Backup complete',
        detail: { product_count: productCount, size_bytes: sizeBytes },
      });

      notify('Backup complete', `Backup complete: ${sid} — ${productCount} products backed up.`);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        await this.markPartial();
        notify(
          'Backup stopped',
          `Backup stopped: Storage quota exceeded for ${sid}. Open the extension to review.`
        );
        await addLog({
          storefront_id: sid,
          timestamp: new Date().toISOString(),
          level: 'error',
          message: 'Storage quota exceeded',
          detail: null,
        });
      } else {
        await this.markPartial();
        const msg = error instanceof Error ? error.message : String(error);
        await addLog({
          storefront_id: sid,
          timestamp: new Date().toISOString(),
          level: 'error',
          message: `Unexpected error during backup: ${msg}`,
          detail: null,
        });
      }
    }
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    void this.run();
  }

  cancel(): void {
    this.cancelled = true;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async fetchPage(
    cursor: string | null
  ): Promise<{ status: number; body: GqlResponse; headers: Headers }> {
    const url = `https://${this.storefrontId}/api/2026-01/graphql.json`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: PRODUCTS_QUERY,
        variables: { cursor },
      }),
    });

    let body: GqlResponse;
    try {
      body = (await resp.json()) as GqlResponse;
    } catch {
      body = {};
    }

    return { status: resp.status, body, headers: resp.headers };
  }

  private isThrottled(body: GqlResponse): boolean {
    return body.errors?.some((e) => e.extensions?.code === 'THROTTLED') ?? false;
  }

  private async markPartial(): Promise<void> {
    const storefront = await getStorefront(this.storefrontId);
    if (storefront) {
      await putStorefront({ ...storefront, backup_status: 'partial' });
    }
  }
}

// ---------------------------------------------------------------------------
// Active backup tracking
// ---------------------------------------------------------------------------

export const activeBackups = new Map<string, BackupEngine>();

export function startBackup(
  storefrontId: string,
  onProgress: (fetched: number, estimated: number) => void
): void {
  const engine = new BackupEngine(storefrontId, onProgress);
  activeBackups.set(storefrontId, engine);

  void engine.run().finally(() => {
    activeBackups.delete(storefrontId);
  });
}

export function pauseBackup(storefrontId: string): void {
  const engine = activeBackups.get(storefrontId);
  if (engine) {
    engine.pause();
  }
}

export function resumeBackup(
  storefrontId: string,
  onProgress: (fetched: number, estimated: number) => void
): void {
  let engine = activeBackups.get(storefrontId);
  if (engine) {
    engine.resume();
  } else {
    engine = new BackupEngine(storefrontId, onProgress);
    activeBackups.set(storefrontId, engine);
    void engine.run().finally(() => {
      activeBackups.delete(storefrontId);
    });
  }
}

export function cancelBackup(storefrontId: string): void {
  const engine = activeBackups.get(storefrontId);
  if (engine) {
    engine.cancel();
  }
}

export async function checkForInterruptedBackups(
  onProgress: (storefrontId: string, fetched: number, estimated: number) => void
): Promise<void> {
  // Import getDb to scan all backup cursors
  const { getDb } = await import('./db');
  const db = await getDb();
  const cursors = await db.getAll('backup_cursors');

  for (const cursor of cursors) {
    const sid = cursor.storefront_id;
    const now = new Date().toISOString();

    await addLog({
      storefront_id: sid,
      timestamp: now,
      level: 'info',
      message: `Backup interrupted at cursor ${cursor.cursor}, auto-resumed at ${now}`,
      detail: { products_fetched: cursor.products_fetched },
    });

    startBackup(sid, (fetched, estimated) => {
      onProgress(sid, fetched, estimated);
    });
  }
}
