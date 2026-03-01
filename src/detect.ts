// Runs in the MAIN world to access window.Shopify
(function () {
  interface ShopifyWindow {
    Shopify?: {
      shop?: unknown;
    };
  }
  try {
    const shop = (window as ShopifyWindow).Shopify?.shop;
    window.postMessage(
      {
        type: '__SNIFFER_SHOPIFY_DETECT__',
        shop: typeof shop === 'string' && shop.length > 0 ? shop : null,
      },
      '*'
    );
  } catch {
    window.postMessage(
      {
        type: '__SNIFFER_SHOPIFY_DETECT__',
        shop: null,
      },
      '*'
    );
  }
})();
