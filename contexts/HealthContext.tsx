import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { Platform } from "react-native";

import {
  HealthKitCategorySample,
  HealthKitQuantitySample,
  HealthKitWorkout,
  getAppleHealthKit,
  initializeHealthKit,
  isHealthKitAvailable,
  readCategoryHealthKit,
  readHealthKit,
  readWorkouts,
} from "@/utils/appleHealthKit";

const HEALTH_CONNECTED_KEY = "pace5.health.connected";

export interface WorkoutSample {
  id: string;
  startDate: string;
  endDate: string;
  duration: number;
  distance: number;
  calories: number;
  averageHeartRate?: number;
}

export interface DailySummary {
  date: string;
  steps: number;
  calories: number;
  basalCalories?: number;
  distance: number;
  restingHeartRate?: number;
  heartRateVariability?: number;
  sleepDurationMinutes?: number;
  vo2Max?: number;
  bodyMassKg?: number;
}

export type HealthAuthorizationStatus =
  | "unsupported"
  | "unavailable"
  | "notDetermined"
  | "authorized"
  | "error";

export interface HealthContextValue {
  isAvailable: boolean;
  isAuthorized: boolean;
  isLoading: boolean;
  authorizationStatus: HealthAuthorizationStatus;
  errorMessage?: string;
  workouts: WorkoutSample[];
  dailySummaries: DailySummary[];
  requestPermissions: () => Promise<void>;
  refresh: (days?: number) => Promise<void>;
}

const HealthContext = createContext<HealthContextValue | null>(null);

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sampleDateKey(sample: HealthKitQuantitySample): string | null {
  if (!sample.startDate) return null;
  return dateKey(sample.startDate);
}

function sampleValue(sample: HealthKitQuantitySample): number {
  return Number.isFinite(sample.quantity) ? sample.quantity : 0;
}

function sumSamplesByDay(samples: HealthKitQuantitySample[]): Record<string, number> {
  return samples.reduce<Record<string, number>>((acc, sample) => {
    const key = sampleDateKey(sample);
    if (!key) return acc;
    acc[key] = (acc[key] ?? 0) + sampleValue(sample);
    return acc;
  }, {});
}

function averageSamplesByDay(samples: HealthKitQuantitySample[]): Record<string, number> {
  const valuesByDay = samples.reduce<Record<string, number[]>>((acc, sample) => {
    const key = sampleDateKey(sample);
    if (!key) return acc;
    acc[key] = [...(acc[key] ?? []), sampleValue(sample)];
    return acc;
  }, {});

  return Object.fromEntries(
    Object.entries(valuesByDay).map(([key, values]) => [
      key,
      values.reduce((acc, value) => acc + value, 0) / values.length,
    ])
  );
}

function sleepMinutesByDay(samples: HealthKitCategorySample[]): Record<string, number> {
  return samples.reduce<Record<string, number>>((acc, sample) => {
    if (!sample.startDate || !sample.endDate) return acc;
    const key = dateKey(sample.startDate);
    const durationMinutes = Math.max(
      0,
      (sample.endDate.getTime() - sample.startDate.getTime()) / 60_000
    );
    acc[key] = (acc[key] ?? 0) + durationMinutes;
    return acc;
  }, {});
}

function normalizeWorkout(workout: HealthKitWorkout): WorkoutSample | null {
  const startDate = workout.startDate;
  const endDate = workout.endDate;
  if (!startDate || !endDate) return null;

  const startMs = startDate.getTime();
  const endMs = endDate.getTime();
  const fallbackDuration = Math.max(0, Math.round((endMs - startMs) / 1000));
  const durationQuantity = workout.duration?.quantity;
  const duration = typeof durationQuantity === "number" && Number.isFinite(durationQuantity)
    ? durationQuantity
    : fallbackDuration;
  const distanceQuantity = workout.totalDistance?.quantity;
  const energyQuantity = workout.totalEnergyBurned?.quantity;
  const distance = typeof distanceQuantity === "number" && Number.isFinite(distanceQuantity)
    ? distanceQuantity
    : 0;
  const calories = typeof energyQuantity === "number" && Number.isFinite(energyQuantity)
    ? energyQuantity
    : 0;

  return {
    id: workout.uuid,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    duration,
    distance,
    calories,
  };
}

function isRunningWorkout(workout: HealthKitWorkout): boolean {
  return workout.workoutActivityType === 37 || String(workout.workoutActivityType).toLowerCase() === "running";
}

function attachHeartRate(
  workouts: WorkoutSample[],
  heartRateSamples: HealthKitQuantitySample[]
): WorkoutSample[] {
  if (heartRateSamples.length === 0) return workouts;

  return workouts.map((workout) => {
    if (workout.averageHeartRate) return workout;

    const startMs = new Date(workout.startDate).getTime();
    const endMs = new Date(workout.endDate).getTime();
    const rates = heartRateSamples
      .filter((sample) => {
        if (!sample.startDate) return false;
        const sampleMs = new Date(sample.startDate).getTime();
        return sampleMs >= startMs && sampleMs <= endMs;
      })
      .map(sampleValue)
      .filter((value) => value > 0);

    if (rates.length === 0) return workout;

    return {
      ...workout,
      averageHeartRate: rates.reduce((acc, value) => acc + value, 0) / rates.length,
    };
  });
}

async function safeReadSamples(
  identifier: Parameters<typeof readHealthKit>[0],
  options: Parameters<typeof readHealthKit>[1]
): Promise<HealthKitQuantitySample[]> {
  try {
    return await readHealthKit(identifier, options);
  } catch {
    return [];
  }
}

async function safeReadCategorySamples(
  identifier: Parameters<typeof readCategoryHealthKit>[0],
  options: Parameters<typeof readCategoryHealthKit>[1]
): Promise<HealthKitCategorySample[]> {
  try {
    return await readCategoryHealthKit(identifier, options);
  } catch {
    return [];
  }
}

export function HealthProvider({ children }: { children: React.ReactNode }) {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [authorizationStatus, setAuthorizationStatus] = useState<HealthAuthorizationStatus>(
    Platform.OS === "ios" ? "notDetermined" : "unsupported"
  );
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [workouts, setWorkouts] = useState<WorkoutSample[]>([]);
  const [dailySummaries, setDailySummaries] = useState<DailySummary[]>([]);

  const healthKit = getAppleHealthKit();

  const fetchData = useCallback(async (days = 365) => {
    if (!healthKit) return;

    setIsLoading(true);
    setErrorMessage(undefined);

    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - days);
      const options = {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        ascending: false,
      };

      const [
        rawWorkouts,
        stepSamples,
        calorieSamples,
        basalCalorieSamples,
        distanceSamples,
        heartRateSamples,
        restingHeartRateSamples,
        hrvSamples,
        sleepSamples,
        vo2Samples,
        bodyMassSamples,
      ] =
        await Promise.all([
          readWorkouts({ ...options, type: "Running" }),
          safeReadSamples("HKQuantityTypeIdentifierStepCount", options),
          safeReadSamples("HKQuantityTypeIdentifierActiveEnergyBurned", options),
          safeReadSamples("HKQuantityTypeIdentifierBasalEnergyBurned", options),
          safeReadSamples("HKQuantityTypeIdentifierDistanceWalkingRunning", {
            ...options,
            unit: "m",
          }),
          safeReadSamples("HKQuantityTypeIdentifierHeartRate", options),
          safeReadSamples("HKQuantityTypeIdentifierRestingHeartRate", options),
          safeReadSamples("HKQuantityTypeIdentifierHeartRateVariabilitySDNN", {
            ...options,
            unit: "ms",
          }),
          safeReadCategorySamples("HKCategoryTypeIdentifierSleepAnalysis", options),
          safeReadSamples("HKQuantityTypeIdentifierVO2Max", options),
          safeReadSamples("HKQuantityTypeIdentifierBodyMass", {
            ...options,
            unit: "kg",
          }),
        ]);

      const mappedWorkouts = rawWorkouts
        .filter(isRunningWorkout)
        .map(normalizeWorkout)
        .filter((workout): workout is WorkoutSample => workout !== null)
        .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

      setWorkouts(attachHeartRate(mappedWorkouts, heartRateSamples));

      const stepsByDay = sumSamplesByDay(stepSamples);
      const caloriesByDay = sumSamplesByDay(calorieSamples);
      const basalCaloriesByDay = sumSamplesByDay(basalCalorieSamples);
      const distanceByDay = sumSamplesByDay(distanceSamples);
      const restingHeartRateByDay = averageSamplesByDay(restingHeartRateSamples);
      const hrvByDay = averageSamplesByDay(hrvSamples);
      const sleepByDay = sleepMinutesByDay(sleepSamples);
      const vo2ByDay = averageSamplesByDay(vo2Samples);
      const bodyMassByDay = averageSamplesByDay(bodyMassSamples);
      const summaries: DailySummary[] = Array.from({ length: days }, (_, index) => {
        const day = new Date(endDate);
        day.setDate(endDate.getDate() - index);
        const key = dateKey(day);

        return {
          date: key,
          steps: Math.round(stepsByDay[key] ?? 0),
          calories: Math.round(caloriesByDay[key] ?? 0),
          basalCalories: Math.round(basalCaloriesByDay[key] ?? 0) || undefined,
          distance: Math.round(distanceByDay[key] ?? 0),
          restingHeartRate: restingHeartRateByDay[key]
            ? Math.round(restingHeartRateByDay[key])
            : undefined,
          heartRateVariability: hrvByDay[key] ? Math.round(hrvByDay[key]) : undefined,
          sleepDurationMinutes: sleepByDay[key] ? Math.round(sleepByDay[key]) : undefined,
          vo2Max: vo2ByDay[key] ? Math.round(vo2ByDay[key] * 10) / 10 : undefined,
          bodyMassKg: bodyMassByDay[key] ? Math.round(bodyMassByDay[key] * 10) / 10 : undefined,
        };
      });

      setDailySummaries(summaries);
      setAuthorizationStatus("authorized");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage(message);
      setAuthorizationStatus("error");
    } finally {
      setIsLoading(false);
    }
  }, [healthKit]);

  const requestPermissions = useCallback(async () => {
    if (!healthKit || !isAvailable) return;

    setIsLoading(true);
    setErrorMessage(undefined);

    try {
      await initializeHealthKit();
      await AsyncStorage.setItem(HEALTH_CONNECTED_KEY, "true");
      setIsAuthorized(true);
      setAuthorizationStatus("authorized");
      await fetchData();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage(message);
      setAuthorizationStatus("error");
    } finally {
      setIsLoading(false);
    }
  }, [fetchData, healthKit, isAvailable]);

  useEffect(() => {
    let isMounted = true;

    async function bootstrap() {
      if (Platform.OS !== "ios" || !healthKit) {
        setAuthorizationStatus("unsupported");
        return;
      }

      const available = await isHealthKitAvailable();
      if (!isMounted) return;

      setIsAvailable(available);
      if (!available) {
        setAuthorizationStatus("unavailable");
        return;
      }

      const wasConnected = await AsyncStorage.getItem(HEALTH_CONNECTED_KEY);
      if (!isMounted || wasConnected !== "true") return;

      try {
        await initializeHealthKit();
        if (!isMounted) return;
        setIsAuthorized(true);
        setAuthorizationStatus("authorized");
        await fetchData();
      } catch (error) {
        if (!isMounted) return;
        setIsAuthorized(false);
        setAuthorizationStatus("error");
        setErrorMessage(error instanceof Error ? error.message : String(error));
      }
    }

    bootstrap();

    return () => {
      isMounted = false;
    };
  }, [fetchData, healthKit]);

  return (
    <HealthContext.Provider
      value={{
        isAvailable,
        isAuthorized,
        isLoading,
        authorizationStatus,
        errorMessage,
        workouts,
        dailySummaries,
        requestPermissions,
        refresh: fetchData,
      }}
    >
      {children}
    </HealthContext.Provider>
  );
}

export function useHealth() {
  const ctx = useContext(HealthContext);
  if (!ctx) throw new Error("useHealth must be used within HealthProvider");
  return ctx;
}
