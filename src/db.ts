import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Storefront, Product, BackupCursor, LogEntry } from './types';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

interface SnifferDB extends DBSchema {
  storefronts: {
    key: string;
    value: Storefront;
  };
  products: {
    key: string;
    value: Product;
    indexes: {
      storefront_id: string;
    };
  };
  backup_cursors: {
    key: string;
    value: BackupCursor;
  };
  logs: {
    key: number;
    value: LogEntry;
    indexes: {
      storefront_id: string;
      timestamp: string;
    };
  };
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

const DB_NAME = 'shopify-theme-sniffer';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<SnifferDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<SnifferDB>> {
  if (!dbPromise) {
    dbPromise = openDB<SnifferDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('storefronts', { keyPath: 'id' });

        const productStore = db.createObjectStore('products', { keyPath: 'id' });
        productStore.createIndex('storefront_id', 'storefront_id', { unique: false });

        db.createObjectStore('backup_cursors', { keyPath: 'storefront_id' });

        const logStore = db.createObjectStore('logs', {
          keyPath: 'id',
          autoIncrement: true,
        });
        logStore.createIndex('storefront_id', 'storefront_id', { unique: false });
        logStore.createIndex('timestamp', 'timestamp', { unique: false });
      },
    });
  }
  return dbPromise;
}

// ---------------------------------------------------------------------------
// Storefront operations
// ---------------------------------------------------------------------------

export async function getStorefront(id: string): Promise<Storefront | undefined> {
  const db = await getDb();
  return db.get('storefronts', id);
}

export async function putStorefront(storefront: Storefront): Promise<void> {
  const db = await getDb();
  await db.put('storefronts', storefront);
}

export async function getAllStorefronts(): Promise<Storefront[]> {
  const db = await getDb();
  return db.getAll('storefronts');
}

export async function deleteStorefront(id: string): Promise<void> {
  const db = await getDb();

  const tx = db.transaction(['storefronts', 'products', 'backup_cursors', 'logs'], 'readwrite');

  // Storefront
  tx.objectStore('storefronts').delete(id);

  // Products — iterate the index and delete each record
  const productIndex = tx.objectStore('products').index('storefront_id');
  let productCursor = await productIndex.openCursor(id);
  while (productCursor) {
    productCursor.delete();
    productCursor = await productCursor.continue();
  }

  // Backup cursor
  tx.objectStore('backup_cursors').delete(id);

  // Logs — iterate the storefront_id index and delete each record
  const logIndex = tx.objectStore('logs').index('storefront_id');
  let logCursor = await logIndex.openCursor(id);
  while (logCursor) {
    logCursor.delete();
    logCursor = await logCursor.continue();
  }

  await tx.done;
}

// ---------------------------------------------------------------------------
// Product operations
// ---------------------------------------------------------------------------

export async function putProduct(product: Product): Promise<void> {
  const db = await getDb();
  await db.put('products', product);
}

export async function putProducts(products: Product[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('products', 'readwrite');
  for (const product of products) {
    tx.store.put(product);
  }
  await tx.done;
}

export async function getProductsByStorefront(storefrontId: string): Promise<Product[]> {
  const db = await getDb();
  return db.getAllFromIndex('products', 'storefront_id', storefrontId);
}

export async function getProductCount(storefrontId: string): Promise<number> {
  const db = await getDb();
  return db.countFromIndex('products', 'storefront_id', storefrontId);
}

export async function markProductsRemoved(
  storefrontId: string,
  activeIds: Set<string>,
  timestamp: string
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('products', 'readwrite');
  const index = tx.store.index('storefront_id');

  let cursor = await index.openCursor(storefrontId);
  while (cursor) {
    const product = cursor.value;
    if (!activeIds.has(product.id) && product.removed_at === null) {
      cursor.update({ ...product, removed_at: timestamp });
    }
    cursor = await cursor.continue();
  }

  await tx.done;
}

// ---------------------------------------------------------------------------
// Backup cursor operations
// ---------------------------------------------------------------------------

export async function getBackupCursor(storefrontId: string): Promise<BackupCursor | undefined> {
  const db = await getDb();
  return db.get('backup_cursors', storefrontId);
}

export async function putBackupCursor(cursor: BackupCursor): Promise<void> {
  const db = await getDb();
  await db.put('backup_cursors', cursor);
}

export async function deleteBackupCursor(storefrontId: string): Promise<void> {
  const db = await getDb();
  await db.delete('backup_cursors', storefrontId);
}

// ---------------------------------------------------------------------------
// Log operations
// ---------------------------------------------------------------------------

export async function addLog(entry: Omit<LogEntry, 'id'>): Promise<void> {
  const db = await getDb();
  await db.add('logs', entry as LogEntry);
}

export async function getLogsByStorefront(storefrontId: string): Promise<LogEntry[]> {
  const db = await getDb();
  return db.getAllFromIndex('logs', 'storefront_id', storefrontId);
}

export async function getAllLogs(): Promise<LogEntry[]> {
  const db = await getDb();
  return db.getAll('logs');
}

export async function clearLogs(storefrontId?: string): Promise<void> {
  const db = await getDb();

  if (storefrontId === undefined) {
    await db.clear('logs');
    return;
  }

  const tx = db.transaction('logs', 'readwrite');
  const index = tx.store.index('storefront_id');
  let cursor = await index.openCursor(storefrontId);
  while (cursor) {
    cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

export async function pruneOldLogs(daysOld: number): Promise<number> {
  const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();
  const db = await getDb();
  const tx = db.transaction('logs', 'readwrite');
  const index = tx.store.index('timestamp');

  let deleted = 0;
  let cursor = await index.openCursor(IDBKeyRange.upperBound(cutoff, true));
  while (cursor) {
    cursor.delete();
    deleted++;
    cursor = await cursor.continue();
  }

  await tx.done;
  return deleted;
}

// ---------------------------------------------------------------------------
// Storage estimation
// ---------------------------------------------------------------------------

export async function estimateStorefrontSize(storefrontId: string): Promise<number> {
  const products = await getProductsByStorefront(storefrontId);
  const json = JSON.stringify(products);
  return new Blob([json]).size;
}
