// Lightweight bridge between the root Linking listener (_layout.tsx)
// and whichever SiteWebView is active. When a deep link arrives
// (e.g. a magic-link from email) the URL is stored here. The next
// SiteWebView that finishes loading picks it up and navigates to it.

let pendingUrl: string | null = null;
type Listener = (url: string) => void;
let activeListener: Listener | null = null;

export function setPendingDeepLink(url: string) {
  if (activeListener) {
    activeListener(url);
  } else {
    pendingUrl = url;
  }
}

export function consumePendingDeepLink(): string | null {
  const url = pendingUrl;
  pendingUrl = null;
  return url;
}

export function registerDeepLinkListener(fn: Listener): () => void {
  activeListener = fn;
  return () => {
    if (activeListener === fn) activeListener = null;
  };
}
