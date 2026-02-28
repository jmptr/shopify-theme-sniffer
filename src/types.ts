// Messaging protocol types
export type MessageType =
  | 'SHOPIFY_DETECTED'
  | 'SHOPIFY_NOT_DETECTED'
  | 'GET_POPUP_STATE'
  | 'POPUP_STATE'
  | 'START_BACKUP'
  | 'UPDATE_BACKUP'
  | 'PAUSE_BACKUP'
  | 'RESUME_BACKUP'
  | 'CANCEL_BACKUP'
  | 'BACKUP_PROGRESS';

export interface ShopifyDetectedMessage {
  type: 'SHOPIFY_DETECTED';
  domain: string;
  shop: string;
}

export interface ShopifyNotDetectedMessage {
  type: 'SHOPIFY_NOT_DETECTED';
  domain: string;
}

export interface GetPopupStateMessage {
  type: 'GET_POPUP_STATE';
  tabId: number;
}

export interface PopupStateMessage {
  type: 'POPUP_STATE';
  detected: boolean;
  domain: string | null;
  shop: string | null;
  backupStatus: BackupStatus;
  lastBackupAt: string | null;
  productCount: number;
  progress: BackupProgress | null;
}

export interface StartBackupMessage {
  type: 'START_BACKUP';
  storefront_id: string;
  persistGranted: boolean;
}

export interface UpdateBackupMessage {
  type: 'UPDATE_BACKUP';
  storefront_id: string;
  persistGranted: boolean;
}

export interface PauseBackupMessage {
  type: 'PAUSE_BACKUP';
  storefront_id: string;
}

export interface ResumeBackupMessage {
  type: 'RESUME_BACKUP';
  storefront_id: string;
}

export interface CancelBackupMessage {
  type: 'CANCEL_BACKUP';
  storefront_id: string;
}

export interface BackupProgressMessage {
  type: 'BACKUP_PROGRESS';
  storefront_id: string;
  fetched: number;
  estimated: number;
}

export type ExtensionMessage =
  | ShopifyDetectedMessage
  | ShopifyNotDetectedMessage
  | GetPopupStateMessage
  | PopupStateMessage
  | StartBackupMessage
  | UpdateBackupMessage
  | PauseBackupMessage
  | ResumeBackupMessage
  | CancelBackupMessage
  | BackupProgressMessage;

// IndexedDB record types
export type BackupStatus = 'complete' | 'partial' | 'in-progress' | 'paused' | 'never';

export interface Storefront {
  id: string;                  // window.Shopify.shop value
  domain: string;
  last_backup_at: string | null;
  backup_status: BackupStatus;
  product_count: number;
  size_bytes: number;
  created_at: string;
}

export interface ProductImage {
  url: string;
  alt: string | null;
  width: number;
  height: number;
}

export interface ProductVariant {
  id: string;
  title: string;
  sku: string;
  price: string;
  compare_at_price: string | null;
  inventory_policy: string | null;
  weight: number | null;
  weight_unit: string | null;
  option1: string | null;
  option2: string | null;
  option3: string | null;
}

export interface Product {
  id: string;                  // `{storefront_id}::{shopify_product_id}`
  storefront_id: string;
  shopify_id: string;
  title: string;
  handle: string;
  description_html: string;
  vendor: string;
  product_type: string;
  tags: string[];
  images: ProductImage[];
  variants: ProductVariant[];
  created_at: string;
  updated_at: string;
  sniffer_updated_at: string;
  removed_at: string | null;
}

export interface BackupCursor {
  storefront_id: string;       // PK
  cursor: string | null;
  started_at: string;
  products_fetched: number;
  total_products: number | null;
}

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  id?: number;                 // auto-increment
  storefront_id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  detail: Record<string, unknown> | null;
}

export interface BackupProgress {
  fetched: number;
  estimated: number;
}
