import Constants from "expo-constants";

import {
  CoachSyncPayload,
  getQueuedCoachSyncs,
  markCoachSyncAttempt,
  removeQueuedCoachSync,
} from "@/utils/coachSyncQueue";
import { syncViaWebView } from "@/utils/webViewBridge";

export interface BackendSyncResult {
  synced: number;
  message?: string;
}

type BackendResponse = {
  synced?: number;
  message?: string;
};

const DEFAULT_API_BASE_URL = "https://pace5.com.br/api";

function configuredApiBaseUrl(): string | undefined {
  const envUrl = process.env.EXPO_PUBLIC_PACE5_API_URL;
  const extraUrl = Constants.expoConfig?.extra?.pace5ApiUrl;
  const value = typeof envUrl === "string" && envUrl.length > 0 ? envUrl : extraUrl;
  return typeof value === "string" && value.length > 0 ? value.replace(/\/$/, "") : undefined;
}

export function healthSyncEndpoint(): string {
  return `${configuredApiBaseUrl() ?? DEFAULT_API_BASE_URL}/health/sync`;
}

export function coachSyncTransportLabel(): string {
  return configuredApiBaseUrl() ? "API direta" : "WebView/session";
}

async function parseResponse(response: Response): Promise<BackendResponse> {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text) as BackendResponse;
  } catch {
    return { message: text };
  }
}

async function postDirectly(payload: CoachSyncPayload): Promise<BackendSyncResult> {
  const response = await fetch(healthSyncEndpoint(), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-Pace5-Client": "pace5-mobile",
      "X-Pace5-Schema-Version": String(payload.schemaVersion),
    },
    body: JSON.stringify(payload),
  });
  const body = await parseResponse(response);

  if (!response.ok) {
    throw new Error(
      body.message ??
        (response.status === 401
          ? "Sessão expirada. Faça login no Pace5 e tente novamente."
          : `Erro ${response.status} ao sincronizar com o Pace5.`)
    );
  }

  return {
    synced: body.synced ?? payload.workouts.length + payload.dailyMetrics.length,
    message: body.message,
  };
}

export async function sendCoachSyncPayload(payload: CoachSyncPayload): Promise<BackendSyncResult> {
  if (configuredApiBaseUrl()) {
    return postDirectly(payload);
  }

  return syncViaWebView(payload, healthSyncEndpoint());
}

export async function flushQueuedCoachSyncs(): Promise<BackendSyncResult> {
  const queue = await getQueuedCoachSyncs();
  let synced = 0;

  for (const item of queue.slice().reverse()) {
    try {
      const result = await sendCoachSyncPayload(item.payload);
      synced += result.synced;
      await removeQueuedCoachSync(item.id);
    } catch (error) {
      await markCoachSyncAttempt(item.id, error);
      throw error;
    }
  }

  return {
    synced,
    message: synced > 0 ? "Fila pendente sincronizada." : "Nenhum item pendente na fila.",
  };
}
