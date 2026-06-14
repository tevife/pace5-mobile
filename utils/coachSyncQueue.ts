import AsyncStorage from "@react-native-async-storage/async-storage";

import { CoachAnalysis } from "@/utils/coachEngine";
import { CoachFeedback } from "@/utils/coachPersistence";

export interface CoachWorkoutSyncPayload {
  sourceId: string;
  type: "running";
  startDate: string;
  endDate: string;
  duration: number;
  distance: number;
  calories: number;
  averageHeartRate?: number;
}

export interface CoachDailyMetricSyncPayload {
  date: string;
  steps: number;
  activeCalories: number;
  basalCalories?: number;
  distance: number;
  restingHeartRate?: number;
  heartRateVariability?: number;
  sleepDurationMinutes?: number;
  vo2Max?: number;
  bodyMassKg?: number;
}

export interface CoachSyncPayload {
  clientGeneratedAt: string;
  schemaVersion: 1;
  workouts: CoachWorkoutSyncPayload[];
  dailyMetrics: CoachDailyMetricSyncPayload[];
  coachAnalysis?: CoachAnalysis;
  feedback: CoachFeedback[];
}

export interface QueuedCoachSync {
  id: string;
  createdAt: string;
  attempts: number;
  lastAttemptAt?: string;
  lastError?: string;
  payload: CoachSyncPayload;
}

const SYNC_QUEUE_KEY = "pace5.coach.sync.queue";
const MAX_QUEUE_ITEMS = 20;

async function readQueue(): Promise<QueuedCoachSync[]> {
  const raw = await AsyncStorage.getItem(SYNC_QUEUE_KEY);
  if (!raw) return [];

  try {
    return JSON.parse(raw) as QueuedCoachSync[];
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueuedCoachSync[]): Promise<void> {
  await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue.slice(0, MAX_QUEUE_ITEMS)));
}

export async function getQueuedCoachSyncs(): Promise<QueuedCoachSync[]> {
  return readQueue();
}

export async function getQueuedCoachSyncCount(): Promise<number> {
  const queue = await readQueue();
  return queue.length;
}

export async function enqueueCoachSync(
  payload: CoachSyncPayload,
  error?: unknown
): Promise<QueuedCoachSync> {
  const queue = await readQueue();
  const now = new Date().toISOString();
  const item: QueuedCoachSync = {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
    attempts: 0,
    lastError: error instanceof Error ? error.message : error ? String(error) : undefined,
    payload,
  };

  await writeQueue([item, ...queue]);
  return item;
}

export async function markCoachSyncAttempt(
  id: string,
  error?: unknown
): Promise<QueuedCoachSync[]> {
  const queue = await readQueue();
  const now = new Date().toISOString();
  const next = queue.map((item) =>
    item.id === id
      ? {
          ...item,
          attempts: item.attempts + 1,
          lastAttemptAt: now,
          lastError: error instanceof Error ? error.message : error ? String(error) : undefined,
        }
      : item
  );
  await writeQueue(next);
  return next;
}

export async function removeQueuedCoachSync(id: string): Promise<void> {
  const queue = await readQueue();
  await writeQueue(queue.filter((item) => item.id !== id));
}

export async function clearCoachSyncQueue(): Promise<void> {
  await AsyncStorage.removeItem(SYNC_QUEUE_KEY);
}
