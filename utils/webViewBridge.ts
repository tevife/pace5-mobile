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
 *   3. healthSync.ts calls syncViaWebView(payload) — picks any registered WebView.
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

export type SiteCalendarRace = {
  title?: string;
  name?: string;
  date?: string;
  startDate?: string;
  distanceKm?: number;
  distance?: number | string;
  url?: string;
};

type CalendarRacesCallback = {
  resolve: (value: SiteCalendarRace[]) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

// All currently mounted SiteWebView inject functions
const _registeredFns = new Set<InjectFn>();
let _pendingHealthSync: HealthSyncCallback | null = null;
let _pendingCalendarRaces: CalendarRacesCallback | null = null;

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
 * Collect data natively, then inject a fetch() into the active WebView
 * so the request carries the session cookies automatically.
 * Resolves when the WebView posts back { type: 'healthSync', ok: true }.
 * Rejects after 30 s or on API error.
 */
export function syncViaWebView(
  payload: object,
  endpoint = "https://pace5.com.br/api/health/sync"
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
    const payloadLiteral = JSON.stringify(JSON.stringify(payload));
    const endpointLiteral = JSON.stringify(endpoint);
    const payloadForCount = payload as {
      workouts?: object[];
      dailyMetrics?: object[];
      feedback?: object[];
      coachAnalysis?: object;
    };
    const syncedCount =
      (payloadForCount.workouts?.length ?? 0) +
      (payloadForCount.dailyMetrics?.length ?? 0) +
      (payloadForCount.feedback?.length ?? 0) +
      (payloadForCount.coachAnalysis ? 1 : 0);

    const js = `
(function() {
  var body = ${payloadLiteral};
  fetch(${endpointLiteral}, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Pace5-Client': 'pace5-mobile'
    },
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

export function fetchCalendarRacesViaWebView(): Promise<SiteCalendarRace[]> {
  return new Promise((resolve, reject) => {
    const injectFn = getAnyInjectFn();
    if (!injectFn) {
      return reject(
        new Error("Abra a aba Calendário uma vez para usar sua sessão do Pace5.")
      );
    }

    if (_pendingCalendarRaces) {
      clearTimeout(_pendingCalendarRaces.timer);
      _pendingCalendarRaces.reject(new Error("Cancelled by new calendar request"));
      _pendingCalendarRaces = null;
    }

    const timer = setTimeout(() => {
      _pendingCalendarRaces = null;
      reject(new Error("A leitura do calendário demorou demais."));
    }, 30_000);

    _pendingCalendarRaces = { resolve, reject, timer };

    const js = `
(function() {
  function post(ok, races, error) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'calendarRaces',
      ok: ok,
      races: races || [],
      error: error
    }));
  }

  function textOf(el) {
    return (el && (el.innerText || el.textContent) || '').replace(/\\s+/g, ' ').trim();
  }

  function distanceFromText(text) {
    var m = String(text || '').match(/(5|10|21(?:\\.1)?|42(?:\\.2)?)\\s?k/i);
    if (!m) return undefined;
    var n = parseFloat(m[1]);
    if (n >= 40) return 42.2;
    if (n >= 20) return 21.1;
    return n;
  }

  function dateFromText(text) {
    var raw = String(text || '');
    var iso = raw.match(/20\\d{2}-\\d{2}-\\d{2}/);
    if (iso) return iso[0];
    var br = raw.match(/(\\d{1,2})[\\/\\-](\\d{1,2})[\\/\\-](20\\d{2})/);
    if (br) {
      return br[3] + '-' + String(br[2]).padStart(2, '0') + '-' + String(br[1]).padStart(2, '0');
    }
    return undefined;
  }

  function normalizeObject(obj) {
    if (!obj || typeof obj !== 'object') return null;
    var title = obj.title || obj.name || obj.nome || obj.eventName || obj.raceName;
    var date = obj.date || obj.startDate || obj.data || obj.eventDate || obj.raceDate || obj.startsAt;
    var distance = obj.distanceKm || obj.distance || obj.distancia || obj.km;
    var blob = JSON.stringify(obj);
    if (!title && /prova|corrida|race|maratona|meia|10k|5k/i.test(blob)) title = textOf({ innerText: blob }).slice(0, 80);
    if (!date) date = dateFromText(blob);
    if (!distance) distance = distanceFromText(blob);
    if (!title || !date) return null;
    return {
      title: String(title),
      date: String(date).slice(0, 10),
      distanceKm: typeof distance === 'number' ? distance : distanceFromText(String(distance || title)),
      url: obj.url || obj.href
    };
  }

  function collectFromJson(value, out, depth) {
    if (!value || depth > 7) return;
    if (Array.isArray(value)) {
      value.forEach(function(item) { collectFromJson(item, out, depth + 1); });
      return;
    }
    if (typeof value === 'object') {
      var normalized = normalizeObject(value);
      if (normalized) out.push(normalized);
      Object.keys(value).forEach(function(key) { collectFromJson(value[key], out, depth + 1); });
    }
  }

  function collectFromDom(doc) {
    var races = [];
    var selectors = [
      '[data-race]',
      '[data-event]',
      '[data-testid*="event"]',
      '[data-testid*="calendar"]',
      'article',
      'li',
      '.card'
    ];
    selectors.forEach(function(selector) {
      Array.prototype.slice.call(doc.querySelectorAll(selector)).forEach(function(el) {
        var text = textOf(el);
        if (!/(prova|corrida|race|maratona|meia|5k|10k|21k|42k)/i.test(text)) return;
        var date = dateFromText(text);
        if (!date) return;
        races.push({
          title: text.slice(0, 80),
          date: date,
          distanceKm: distanceFromText(text)
        });
      });
    });
    return races;
  }

  function dedupe(races) {
    var seen = {};
    return races.filter(function(race) {
      if (!race || !race.date) return false;
      var key = String(race.title || race.name || '') + '|' + race.date + '|' + String(race.distanceKm || '');
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    }).sort(function(a, b) {
      return String(a.date).localeCompare(String(b.date));
    });
  }

  function parseHtml(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var races = collectFromDom(doc);
    Array.prototype.slice.call(doc.querySelectorAll('script')).forEach(function(script) {
      var text = script.textContent || '';
      if (!/(prova|corrida|race|calendar|event|10k|5k|21k|42k)/i.test(text)) return;
      var jsonMatch = text.match(/\\{[\\s\\S]*\\}|\\[[\\s\\S]*\\]/);
      if (!jsonMatch) return;
      try { collectFromJson(JSON.parse(jsonMatch[0]), races, 0); } catch(e) {}
    });
    return races;
  }

  var endpoints = [
    '/api/calendar/events',
    '/api/calendario',
    '/api/perfil/calendario',
    '/api/profile/calendar',
    '/api/races',
    '/api/provas',
    '/perfil/calendario'
  ];

  Promise.all(endpoints.map(function(path) {
    return fetch(path, { credentials: 'include' })
      .then(function(response) {
        return response.text().then(function(text) {
          var races = [];
          try { collectFromJson(JSON.parse(text), races, 0); }
          catch(e) { races = parseHtml(text); }
          return races;
        });
      })
      .catch(function() { return []; });
  }))
    .then(function(results) {
      var races = dedupe([].concat.apply([], results).concat(collectFromDom(document)));
      post(true, races);
    })
    .catch(function(e) {
      post(false, [], e.message || 'calendar error');
    });
})(); true;
`;

    injectFn(js);
  });
}

export function dispatchCalendarRacesResult(payload: {
  ok: boolean;
  races?: SiteCalendarRace[];
  error?: string;
}): void {
  const cb = _pendingCalendarRaces;
  if (!cb) return;
  _pendingCalendarRaces = null;
  clearTimeout(cb.timer);

  if (payload.ok) {
    cb.resolve(payload.races ?? []);
  } else {
    cb.reject(new Error(payload.error ?? "Falha ao ler calendário."));
  }
}
