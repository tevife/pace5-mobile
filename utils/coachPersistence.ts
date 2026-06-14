import AsyncStorage from "@react-native-async-storage/async-storage";

import { CoachAnalysis, CoachInsight } from "@/utils/coachEngine";

const SNAPSHOTS_KEY = "pace5.coach.snapshots";
const FEEDBACK_KEY = "pace5.coach.feedback";
const MAX_SNAPSHOTS = 24;

export type CoachFeedbackRating = "veryUseful" | "useful" | "notUseful" | "didNotMakeSense";

export interface CoachFeedback {
  id: string;
  insightId: string;
  rating: CoachFeedbackRating;
  note?: string;
  submittedAt: string;
}

export interface CoachSnapshot {
  id: string;
  generatedAt: string;
  analysis: CoachAnalysis;
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function saveCoachSnapshot(analysis: CoachAnalysis): Promise<void> {
  const snapshots = await getCoachSnapshots();
  const next: CoachSnapshot = {
    id: analysis.generatedAt,
    generatedAt: analysis.generatedAt,
    analysis,
  };
  const deduped = snapshots.filter((snapshot) => snapshot.id !== next.id);
  await AsyncStorage.setItem(
    SNAPSHOTS_KEY,
    JSON.stringify([next, ...deduped].slice(0, MAX_SNAPSHOTS))
  );
}

export function getCoachSnapshots(): Promise<CoachSnapshot[]> {
  return readJson<CoachSnapshot[]>(SNAPSHOTS_KEY, []);
}

export async function submitCoachFeedback(
  insight: CoachInsight,
  rating: CoachFeedbackRating,
  note?: string
): Promise<CoachFeedback> {
  const feedbackList = await getCoachFeedback();
  const feedback: CoachFeedback = {
    id: `${insight.id}-${Date.now()}`,
    insightId: insight.id,
    rating,
    note,
    submittedAt: new Date().toISOString(),
  };

  await AsyncStorage.setItem(FEEDBACK_KEY, JSON.stringify([feedback, ...feedbackList]));
  return feedback;
}

export function getCoachFeedback(): Promise<CoachFeedback[]> {
  return readJson<CoachFeedback[]>(FEEDBACK_KEY, []);
}

export async function clearLocalCoachData(): Promise<void> {
  await AsyncStorage.multiRemove([SNAPSHOTS_KEY, FEEDBACK_KEY]);
}
