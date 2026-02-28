// Content script: detects Shopify storefronts
import type { ShopifyDetectedMessage, ShopifyNotDetectedMessage } from './types';

function detectShopify(): void {
  // Inject a script into the main world to read window.Shopify.shop
  const script = document.createElement('script');
  script.textContent = `
    (function() {
      try {
        const shop = window.Shopify && window.Shopify.shop;
        window.postMessage({
          type: '__SNIFFER_SHOPIFY_DETECT__',
          shop: typeof shop === 'string' && shop.length > 0 ? shop : null
        }, '*');
      } catch(e) {
        window.postMessage({
          type: '__SNIFFER_SHOPIFY_DETECT__',
          shop: null
        }, '*');
      }
    })();
  `;
  document.documentElement.appendChild(script);
  script.remove();

  // Listen for the result from the injected script
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
