/**
 * Standalone production server for Expo static builds.
 *
 * Serves the output of build.js (static-build/) with two special routes:
 * - GET / or /manifest with expo-platform header → platform manifest JSON
 * - GET / without expo-platform → landing page HTML
 * - GET /.well-known/apple-app-site-association → AASA file for Universal Links
 * - GET /.well-known/assetlinks.json → Android Asset Links
 * Everything else falls through to static file serving from ./static-build/.
 *
 * Zero external dependencies — uses only Node.js built-ins (http, fs, path).
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const STATIC_ROOT = path.resolve(__dirname, "..", "static-build");
const WELL_KNOWN_ROOT = path.resolve(__dirname, "well-known");
const TEMPLATE_PATH = path.resolve(__dirname, "templates", "landing-page.html");
const DATA_ROOT = path.resolve(__dirname, "data");
const COACH_STORE_PATH = path.join(DATA_ROOT, "coach-sync-store.json");
const basePath = (process.env.BASE_PATH || "/").replace(/\/+$/, "");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".map": "application/json",
};

function getAppName() {
  try {
    const appJsonPath = path.resolve(__dirname, "..", "app.json");
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf-8"));
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

function serveManifest(platform, res) {
  const manifestPath = path.join(STATIC_ROOT, platform, "manifest.json");

  if (!fs.existsSync(manifestPath)) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(
      JSON.stringify({ error: `Manifest not found for platform: ${platform}` }),
    );
    return;
  }

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.writeHead(200, {
    "content-type": "application/json",
    "expo-protocol-version": "1",
    "expo-sfv-version": "0",
  });
  res.end(manifest);
}

function serveLandingPage(req, res, landingPageTemplate, appName) {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = forwardedProto || "https";
  const host = req.headers["x-forwarded-host"] || req.headers["host"];
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, appName);

  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}

function serveWellKnown(filename, res) {
  const filePath = path.join(WELL_KNOWN_ROOT, filename);

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  let content = fs.readFileSync(filePath, "utf-8");

  if (filename === "apple-app-site-association") {
    const teamId = process.env.APPLE_TEAM_ID;
    if (!teamId) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(
        JSON.stringify({ error: "APPLE_TEAM_ID environment variable not set" }),
      );
      return;
    }
    content = content.replace(/TEAMID/g, teamId);
  }

  if (filename === "assetlinks.json") {
    const sha256 = process.env.ANDROID_SHA256_FINGERPRINT;
    if (!sha256) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: "ANDROID_SHA256_FINGERPRINT environment variable not set",
        }),
      );
      return;
    }
    content = content.replace(/SHA256FINGERPRINT/g, sha256);
  }

  res.writeHead(200, { "content-type": "application/json" });
  res.end(content);
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req, maxBytes = 2_000_000) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
        reject(new Error("Payload muito grande."));
        req.destroy();
      }
    });

    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("JSON inválido."));
      }
    });

    req.on("error", reject);
  });
}

function ensureDataRoot() {
  if (!fs.existsSync(DATA_ROOT)) {
    fs.mkdirSync(DATA_ROOT, { recursive: true });
  }
}

function emptyCoachStore() {
  return {
    schemaVersion: 1,
    updatedAt: null,
    workoutsBySourceId: {},
    dailyMetricsByDate: {},
    analyses: [],
    feedbackById: {},
    syncEvents: [],
  };
}

function readCoachStore() {
  ensureDataRoot();
  if (!fs.existsSync(COACH_STORE_PATH)) {
    return emptyCoachStore();
  }

  try {
    return {
      ...emptyCoachStore(),
      ...JSON.parse(fs.readFileSync(COACH_STORE_PATH, "utf-8")),
    };
  } catch {
    return emptyCoachStore();
  }
}

function writeCoachStore(store) {
  ensureDataRoot();
  fs.writeFileSync(COACH_STORE_PATH, JSON.stringify(store, null, 2));
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function cleanOptionalNumber(value) {
  return isFiniteNumber(value) ? value : undefined;
}

function cleanWorkout(workout) {
  if (!workout || typeof workout !== "object") return null;
  if (typeof workout.sourceId !== "string" || workout.sourceId.length === 0) return null;
  if (workout.type !== "running") return null;
  if (typeof workout.startDate !== "string" || typeof workout.endDate !== "string") return null;

  const startMs = Date.parse(workout.startDate);
  const endMs = Date.parse(workout.endDate);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null;

  return {
    sourceId: workout.sourceId,
    type: "running",
    startDate: new Date(startMs).toISOString(),
    endDate: new Date(endMs).toISOString(),
    duration: Math.max(0, cleanOptionalNumber(workout.duration) ?? Math.round((endMs - startMs) / 1000)),
    distance: Math.max(0, cleanOptionalNumber(workout.distance) ?? 0),
    calories: Math.max(0, cleanOptionalNumber(workout.calories) ?? 0),
    averageHeartRate: cleanOptionalNumber(workout.averageHeartRate),
  };
}

function cleanDailyMetric(metric) {
  if (!metric || typeof metric !== "object") return null;
  if (typeof metric.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(metric.date)) return null;

  return {
    date: metric.date,
    steps: Math.max(0, cleanOptionalNumber(metric.steps) ?? 0),
    activeCalories: Math.max(0, cleanOptionalNumber(metric.activeCalories) ?? 0),
    basalCalories: cleanOptionalNumber(metric.basalCalories),
    distance: Math.max(0, cleanOptionalNumber(metric.distance) ?? 0),
    restingHeartRate: cleanOptionalNumber(metric.restingHeartRate),
    heartRateVariability: cleanOptionalNumber(metric.heartRateVariability),
    sleepDurationMinutes: cleanOptionalNumber(metric.sleepDurationMinutes),
    vo2Max: cleanOptionalNumber(metric.vo2Max),
    bodyMassKg: cleanOptionalNumber(metric.bodyMassKg),
  };
}

function cleanFeedback(feedback) {
  if (!feedback || typeof feedback !== "object") return null;
  if (typeof feedback.insightId !== "string" || typeof feedback.rating !== "string") return null;

  const submittedAt = Date.parse(feedback.submittedAt);
  const id =
    typeof feedback.id === "string" && feedback.id.length > 0
      ? feedback.id
      : `${feedback.insightId}-${feedback.rating}-${feedback.submittedAt || Date.now()}`;

  return {
    id,
    insightId: feedback.insightId,
    rating: feedback.rating,
    note: typeof feedback.note === "string" ? feedback.note : undefined,
    submittedAt: Number.isFinite(submittedAt)
      ? new Date(submittedAt).toISOString()
      : new Date().toISOString(),
  };
}

function cleanCoachAnalysis(analysis) {
  if (!analysis || typeof analysis !== "object") return null;
  if (typeof analysis.generatedAt !== "string") return null;
  if (!analysis.features || !analysis.profile || !analysis.scores) return null;
  return analysis;
}

async function handleHealthSync(req, res) {
  try {
    const payload = await readJsonBody(req);
    if (payload.schemaVersion !== 1) {
      sendJson(res, 400, { message: "schemaVersion inválido ou ausente." });
      return;
    }

    const workouts = Array.isArray(payload.workouts)
      ? payload.workouts.map(cleanWorkout).filter(Boolean)
      : [];
    const dailyMetrics = Array.isArray(payload.dailyMetrics)
      ? payload.dailyMetrics.map(cleanDailyMetric).filter(Boolean)
      : [];
    const feedback = Array.isArray(payload.feedback)
      ? payload.feedback.map(cleanFeedback).filter(Boolean)
      : [];
    const coachAnalysis = cleanCoachAnalysis(payload.coachAnalysis);

    const store = readCoachStore();
    const now = new Date().toISOString();
    let insertedWorkouts = 0;
    let insertedDailyMetrics = 0;
    let insertedFeedback = 0;

    for (const workout of workouts) {
      if (!store.workoutsBySourceId[workout.sourceId]) insertedWorkouts += 1;
      store.workoutsBySourceId[workout.sourceId] = {
        ...store.workoutsBySourceId[workout.sourceId],
        ...workout,
        syncedAt: now,
      };
    }

    for (const metric of dailyMetrics) {
      if (!store.dailyMetricsByDate[metric.date]) insertedDailyMetrics += 1;
      store.dailyMetricsByDate[metric.date] = {
        ...store.dailyMetricsByDate[metric.date],
        ...metric,
        syncedAt: now,
      };
    }

    for (const item of feedback) {
      if (!store.feedbackById[item.id]) insertedFeedback += 1;
      store.feedbackById[item.id] = {
        ...store.feedbackById[item.id],
        ...item,
        syncedAt: now,
      };
    }

    if (coachAnalysis) {
      store.analyses = [
        { ...coachAnalysis, syncedAt: now },
        ...store.analyses.filter((analysis) => analysis.generatedAt !== coachAnalysis.generatedAt),
      ].slice(0, 50);
    }

    const syncEvent = {
      id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
      receivedAt: now,
      clientGeneratedAt:
        typeof payload.clientGeneratedAt === "string" ? payload.clientGeneratedAt : undefined,
      insertedWorkouts,
      insertedDailyMetrics,
      insertedFeedback,
      includedAnalysis: Boolean(coachAnalysis),
    };

    store.updatedAt = now;
    store.syncEvents = [syncEvent, ...store.syncEvents].slice(0, 100);
    writeCoachStore(store);

    sendJson(res, 200, {
      message: "Dados sincronizados com o Coach Engine.",
      synced:
        insertedWorkouts +
        insertedDailyMetrics +
        insertedFeedback +
        (coachAnalysis ? 1 : 0),
      totals: {
        workouts: Object.keys(store.workoutsBySourceId).length,
        dailyMetrics: Object.keys(store.dailyMetricsByDate).length,
        analyses: store.analyses.length,
        feedback: Object.keys(store.feedbackById).length,
      },
      event: syncEvent,
    });
  } catch (error) {
    sendJson(res, 400, {
      message: error instanceof Error ? error.message : "Falha ao processar sync.",
    });
  }
}

function handleHealthSyncStatus(res) {
  const store = readCoachStore();
  sendJson(res, 200, {
    updatedAt: store.updatedAt,
    totals: {
      workouts: Object.keys(store.workoutsBySourceId).length,
      dailyMetrics: Object.keys(store.dailyMetricsByDate).length,
      analyses: store.analyses.length,
      feedback: Object.keys(store.feedbackById).length,
      syncEvents: store.syncEvents.length,
    },
    lastSync: store.syncEvents[0] ?? null,
  });
}

function handleCoachInsights(res) {
  const store = readCoachStore();
  const latest = store.analyses[0] ?? null;
  sendJson(res, 200, {
    generatedAt: latest?.generatedAt ?? null,
    nextBestAction: latest?.nextBestAction ?? null,
    insights: latest?.insights ?? [],
    scores: latest?.scores ?? null,
    profile: latest?.profile ?? null,
  });
}

function serveStaticFile(urlPath, res) {
  const safePath = path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = path.join(STATIC_ROOT, safePath);

  if (!filePath.startsWith(STATIC_ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end("Not Found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const content = fs.readFileSync(filePath);
  res.writeHead(200, { "content-type": contentType });
  res.end(content);
}

const landingPageTemplate = fs.readFileSync(TEMPLATE_PATH, "utf-8");
const appName = getAppName();

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  let pathname = url.pathname;

  if (basePath && pathname.startsWith(basePath)) {
    pathname = pathname.slice(basePath.length) || "/";
  }

  if (pathname === "/.well-known/apple-app-site-association") {
    return serveWellKnown("apple-app-site-association", res);
  }

  if (pathname === "/.well-known/assetlinks.json") {
    return serveWellKnown("assetlinks.json", res);
  }

  if (pathname === "/api/health/sync" && req.method === "POST") {
    return handleHealthSync(req, res);
  }

  if (pathname === "/api/health/sync/status" && req.method === "GET") {
    return handleHealthSyncStatus(res);
  }

  if (pathname === "/api/coach/insights" && req.method === "GET") {
    return handleCoachInsights(res);
  }

  if (pathname === "/" || pathname === "/manifest") {
    const platform = req.headers["expo-platform"];
    if (platform === "ios" || platform === "android") {
      return serveManifest(platform, res);
    }

    if (pathname === "/") {
      return serveLandingPage(req, res, landingPageTemplate, appName);
    }
  }

  serveStaticFile(pathname, res);
});

const port = parseInt(process.env.PORT || "3000", 10);
server.listen(port, "0.0.0.0", () => {
  console.log(`Serving static Expo build on port ${port}`);
});
