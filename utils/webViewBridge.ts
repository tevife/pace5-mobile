/**
 * webViewBridge — module-level singleton that lets non-React code inject
 * JavaScript into any active SiteWebView and receive results back via
 * postMessage / onMessage.
 *
 * Multiple SiteWebView instances (one per tab) can be registered simultaneously.
 * All of them share the same session cookies, so any one of them can execute
 * the authenticated fetch. We use the first available WebView and wait for a
 * single postMessage response.
 *
 * Usage pattern:
 *   1. SiteWebView calls registerInjectJS(fn) on mount → receives unsubscribe().
 *   2. On unmount SiteWebView calls the returned unsubscribe().
 *   3. healthSync.ts calls syncViaWebView(workouts) — picks any registered WebView.
 *   4. Injected JS posts back { type: 'healthSync', ... }.
 *   5. SiteWebView's handleMessage calls dispatchHealthSyncResult().
 *   6. The awaiting Promise in healthSync.ts resolves / rejects.
 */

type InjectFn = (js: string) => void;

type HealthSyncCallback = {
  resolve: (value: { synced: number; message?: string }) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

// All currently mounted SiteWebView inject functions
const _registeredFns = new Set<InjectFn>();
let _pendingHealthSync: HealthSyncCallback | null = null;

/**
 * Register a WebView's inject function.
 * Returns an unsubscribe callback — call it from the effect cleanup.
 */
export function registerInjectJS(fn: InjectFn): () => void {
  _registeredFns.add(fn);
  return () => _registeredFns.delete(fn);
}

/** Pick any available WebView inject function, or null if none mounted. */
function getAnyInjectFn(): InjectFn | null {
  const [first] = _registeredFns;
  return first ?? null;
}

/**
 * Collect workouts natively, then inject a fetch() into the active WebView
 * so the request carries the session cookies automatically.
 * Resolves when the WebView posts back { type: 'healthSync', ok: true }.
 * Rejects after 30 s or on API error.
 */
export function syncViaWebView(
  workouts: object[]
): Promise<{ synced: number; message?: string }> {
  return new Promise((resolve, reject) => {
    const injectFn = getAnyInjectFn();
    if (!injectFn) {
      return reject(
        new Error(
          "Nenhuma aba do Pace5 está aberta. Abra a aba Corridas e tente novamente."
        )
      );
    }

    // Cancel any stale pending sync
    if (_pendingHealthSync) {
      clearTimeout(_pendingHealthSync.timer);
      _pendingHealthSync.reject(new Error("Cancelled by new sync request"));
      _pendingHealthSync = null;
    }

    const timer = setTimeout(() => {
      _pendingHealthSync = null;
      reject(new Error("A sincronização demorou demais. Tente novamente."));
    }, 30_000);

    _pendingHealthSync = { resolve, reject, timer };

    // Double-serialise the payload: the outer JSON.stringify produces a JS
    // string literal that the injected code can safely pass to fetch().
    const payloadLiteral = JSON.stringify(JSON.stringify({ workouts }));
    const syncedCount = workouts.length;

    const js = `
(function() {
  var body = ${payloadLiteral};
  fetch('https://pace5.com.br/api/health/sync', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body
  })
  .then(function(r) {
    return r.text().then(function(t) {
      return { ok: r.ok, status: r.status, text: t };
    });
  })
  .then(function(x) {
    var msg;
    try { msg = JSON.parse(x.text).message; } catch(e) { msg = undefined; }
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'healthSync',
      ok: x.ok,
      status: x.status,
      synced: ${syncedCount},
      message: msg
    }));
  })
  .catch(function(e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'healthSync',
      ok: false,
      error: e.message || 'network error'
    }));
  });
})(); true;
`;

    injectFn(js);
  });
}

/** Called by SiteWebView's handleMessage when type === 'healthSync'. */
export function dispatchHealthSyncResult(payload: {
  ok: boolean;
  synced?: number;
  message?: string;
  status?: number;
  error?: string;
}): void {
  const cb = _pendingHealthSync;
  if (!cb) return;
  _pendingHealthSync = null;
  clearTimeout(cb.timer);

  if (payload.ok) {
    cb.resolve({ synced: payload.synced ?? 0, message: payload.message });
  } else {
    const errMsg =
      payload.error ??
      (payload.status === 401
        ? "Sessão expirada. Faça login no app e tente novamente."
        : `Erro ${payload.status ?? ""}: ${payload.message ?? "falha na sincronização"}`);
    cb.reject(new Error(errMsg));
  }
}
