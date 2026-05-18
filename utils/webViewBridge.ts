/**
 * webViewBridge — module-level singleton that lets non-React code inject
 * JavaScript into the active SiteWebView and receive results back via
 * postMessage / onMessage.
 *
 * Usage pattern:
 *   1. SiteWebView calls registerInjectJS() on mount / unmount.
 *   2. Any code calls postToWebView() to inject JS.
 *   3. The injected JS posts back { type: 'healthSync', ... }.
 *   4. SiteWebView's handleMessage calls dispatchHealthSyncResult().
 *   5. The awaiting Promise in healthSync.ts resolves / rejects.
 */

type HealthSyncCallback = {
  resolve: (value: { synced: number; message?: string }) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

let _injectJS: ((js: string) => void) | null = null;
let _pendingHealthSync: HealthSyncCallback | null = null;

/** Called by SiteWebView on mount; pass null on unmount. */
export function registerInjectJS(fn: ((js: string) => void) | null): void {
  _injectJS = fn;
}

/** Inject arbitrary JS into the active WebView. Returns false if no WebView is mounted. */
export function postToWebView(js: string): boolean {
  if (!_injectJS) return false;
  _injectJS(js);
  return true;
}

/**
 * Inject JS that POSTs workouts to the Pace5 API using the WebView's session
 * cookies, then waits for the `healthSync` postMessage response.
 *
 * Rejects after 30 s if no response arrives.
 */
export function syncViaWebView(
  workouts: object[]
): Promise<{ synced: number; message?: string }> {
  return new Promise((resolve, reject) => {
    if (!_injectJS) {
      return reject(
        new Error(
          "Abra a aba Corridas primeiro e tente sincronizar novamente."
        )
      );
    }

    // Cancel any previous pending call
    if (_pendingHealthSync) {
      clearTimeout(_pendingHealthSync.timer);
      _pendingHealthSync.reject(new Error("Cancelled"));
      _pendingHealthSync = null;
    }

    const timer = setTimeout(() => {
      _pendingHealthSync = null;
      reject(new Error("A sincronização demorou demais. Tente novamente."));
    }, 30_000);

    _pendingHealthSync = { resolve, reject, timer };

    // Serialise the payload as a JS literal so we don't have to worry about
    // quote escaping inside the template string.
    const payloadLiteral = JSON.stringify(JSON.stringify({ workouts }));

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
    return r.text().then(function(t) { return { ok: r.ok, status: r.status, text: t }; });
  })
  .then(function(x) {
    var msg;
    try { msg = JSON.parse(x.text).message; } catch(e) { msg = x.text; }
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'healthSync',
      ok: x.ok,
      status: x.status,
      synced: ${workouts.length},
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

    _injectJS(js);
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
