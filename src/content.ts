// Content script: detects Shopify storefronts
import type { ShopifyDetectedMessage, ShopifyNotDetectedMessage } from './types';

function detectShopify(): void {
  // Listen for the result from the MAIN-world detect script
  window.addEventListener('message', function handler(event: MessageEvent) {
    if (event.source !== window) return;
    if (event.data?.type !== '__SNIFFER_SHOPIFY_DETECT__') return;

    window.removeEventListener('message', handler);

    const shop: string | null = event.data.shop;
    const domain = window.location.hostname;

    if (shop) {
      const message: ShopifyDetectedMessage = {
        type: 'SHOPIFY_DETECTED',
        domain,
        shop,
      };
      chrome.runtime.sendMessage(message);
    } else {
      const message: ShopifyNotDetectedMessage = {
        type: 'SHOPIFY_NOT_DETECTED',
        domain,
      };
      chrome.runtime.sendMessage(message);
    }
  });
}

detectShopify();
