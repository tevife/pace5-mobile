import { Platform } from "react-native";

import { DailySummary, WorkoutSample } from "@/contexts/HealthContext";
import { sendCoachSyncPayload, flushQueuedCoachSyncs } from "@/utils/coachBackend";
import { CoachAnalysis, buildCoachAnalysis } from "@/utils/coachEngine";
import { getCoachFeedback } from "@/utils/coachPersistence";
import {
  CoachDailyMetricSyncPayload,
  CoachSyncPayload,
  CoachWorkoutSyncPayload,
  enqueueCoachSync,
  getQueuedCoachSyncCount,
} from "@/utils/coachSyncQueue";
import {
  HealthKitWorkout,
  getAppleHealthKit,
  initializeHealthKit,
  isHealthKitAvailable,
  readWorkouts,
} from "@/utils/appleHealthKit";

export interface SyncResult {
  synced: number;
  queued: number;
  message?: string;
}

type BuildCoachSyncPayloadInput = {
  workouts: WorkoutSample[];
  dailySummaries: DailySummary[];
  analysis?: CoachAnalysis;
};

function isRunningWorkout(workout: HealthKitWorkout): boolean {
  return workout.workoutActivityType === 37 || String(workout.workoutActivityType).toLowerCase() === "running";
}

function workoutFromHealthKit(workout: HealthKitWorkout): WorkoutSample | null {
  const startDate = workout.startDate;
  const endDate = workout.endDate;
  if (!startDate || !endDate) return null;

  const fallbackDuration = Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 1000));
  const durationQuantity = workout.duration?.quantity;
  const distanceQuantity = workout.totalDistance?.quantity;
  const energyQuantity = workout.totalEnergyBurned?.quantity;

  return {
    id: workout.uuid,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    duration:
      typeof durationQuantity === "number" && Number.isFinite(durationQuantity)
        ? durationQuantity
        : fallbackDuration,
    distance:
      typeof distanceQuantity === "number" && Number.isFinite(distanceQuantity)
        ? distanceQuantity
        : 0,
    calories:
      typeof energyQuantity === "number" && Number.isFinite(energyQuantity)
        ? energyQuantity
        : 0,
  };
}

function workoutPayload(workout: WorkoutSample): CoachWorkoutSyncPayload {
  return {
    sourceId: workout.id,
    type: "running",
    startDate: workout.startDate,
    endDate: workout.endDate,
    duration: workout.duration,
    distance: workout.distance,
    calories: workout.calories,
    averageHeartRate: workout.averageHeartRate,
  };
}

function dailyMetricPayload(day: DailySummary): CoachDailyMetricSyncPayload {
  return {
    date: day.date,
    steps: day.steps,
    activeCalories: day.calories,
    basalCalories: day.basalCalories,
    distance: day.distance,
    restingHeartRate: day.restingHeartRate,
    heartRateVariability: day.heartRateVariability,
    sleepDurationMinutes: day.sleepDurationMinutes,
    vo2Max: day.vo2Max,
    bodyMassKg: day.bodyMassKg,
  };
}

export async function buildCoachSyncPayload({
  workouts,
  dailySummaries,
  analysis,
}: BuildCoachSyncPayloadInput): Promise<CoachSyncPayload> {
  const feedback = await getCoachFeedback();
  return {
    clientGeneratedAt: new Date().toISOString(),
    schemaVersion: 1,
    workouts: workouts.map(workoutPayload),
    dailyMetrics: dailySummaries.map(dailyMetricPayload),
    coachAnalysis: analysis ?? buildCoachAnalysis(workouts, dailySummaries),
    feedback,
  };
}

export async function syncCoachData(input: BuildCoachSyncPayloadInput): Promise<SyncResult> {
  const payload = await buildCoachSyncPayload(input);

  try {
    const flushed = await flushQueuedCoachSyncs();
    const synced = await sendCoachSyncPayload(payload);
    const queued = await getQueuedCoachSyncCount();
    return {
      synced: flushed.synced + synced.synced,
      queued,
      message: synced.message ?? "Dados de saúde e coach sincronizados com o Pace5.",
    };
  } catch (error) {
    await enqueueCoachSync(payload, error);
    const queued = await getQueuedCoachSyncCount();
    return {
      synced: 0,
      queued,
      message:
        error instanceof Error
          ? `Não foi possível enviar agora. Salvei na fila local. Motivo: ${error.message}`
          : "Não foi possível enviar agora. Salvei na fila local.",
    };
  }
}

/**
 * Backward-compatible entry point used by older buttons. It reads HealthKit
 * directly and sends a complete Coach sync payload with the available data.
 */
export async function syncHealthData(): Promise<SyncResult> {
  if (Platform.OS !== "ios") {
    return { synced: 0, queued: 0, message: "Apple Health não disponível neste dispositivo." };
  }

  const healthKit = getAppleHealthKit();
  if (!healthKit) {
    return {
      synced: 0,
      queued: 0,
      message: "Apple Health não está disponível nesta build. Gere um dev client ou build iOS nativa.",
    };
  }

  const available = await isHealthKitAvailable();
  if (!available) {
    return { synced: 0, queued: 0, message: "Apple Health não está disponível neste iPhone." };
  }

  await initializeHealthKit();

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 90);

  const rawWorkouts = await readWorkouts({
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    ascending: false,
    type: "Running",
  });

  const workouts = rawWorkouts
    .filter(isRunningWorkout)
    .map(workoutFromHealthKit)
    .filter((workout): workout is WorkoutSample => workout !== null);

  if (workouts.length === 0) {
    return { synced: 0, queued: 0, message: "Nenhuma corrida encontrada nos últimos 90 dias." };
  }

  return syncCoachData({ workouts, dailySummaries: [] });
}
