import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { Platform } from "react-native";

// react-native-health is iOS-only. On Android/web we stub everything out.
let AppleHealthKit: any = null;
let Permissions: any = {};
if (Platform.OS === "ios") {
  const mod = require("react-native-health");
  AppleHealthKit = mod.default;
  Permissions = mod.HealthKitPermissions ?? mod.AppleHealthKit?.Constants?.Permissions ?? {};
}

export interface WorkoutSample {
  id: string;
  startDate: string;
  endDate: string;
  duration: number;       // seconds
  distance: number;       // metres
  calories: number;
  averageHeartRate?: number;
}

export interface DailySummary {
  date: string;
  steps: number;
  calories: number;
  distance: number;       // metres
}

export interface HealthContextValue {
  isAvailable: boolean;
  isAuthorized: boolean;
  isLoading: boolean;
  workouts: WorkoutSample[];
  dailySummaries: DailySummary[];
  requestPermissions: () => Promise<void>;
  refresh: () => Promise<void>;
}

const HealthContext = createContext<HealthContextValue | null>(null);

const PERMISSIONS = Platform.OS === "ios"
  ? {
      permissions: {
        read: [
          Permissions.Steps,
          Permissions.DistanceWalkingRunning,
          Permissions.ActiveEnergyBurned,
          Permissions.HeartRate,
          Permissions.Workout,
        ],
        write: [],
      },
    }
  : { permissions: { read: [], write: [] } };

function isoToDate(iso: string): Date {
  return new Date(iso);
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

export function HealthProvider({ children }: { children: React.ReactNode }) {
  const [isAvailable] = useState(Platform.OS === "ios" && !!AppleHealthKit);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [workouts, setWorkouts] = useState<WorkoutSample[]>([]);
  const [dailySummaries, setDailySummaries] = useState<DailySummary[]>([]);

  const fetchData = useCallback(async () => {
    if (!isAvailable || !AppleHealthKit) return;
    setIsLoading(true);

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 30);
    const options = {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };

    // Fetch workouts (running only)
    await new Promise<void>((resolve) => {
      AppleHealthKit.getWorkouts(
        { ...options, type: "Running" },
        (err: any, results: any[]) => {
          if (!err && results) {
            const mapped: WorkoutSample[] = results.map((r) => ({
              id: r.id ?? r.startDate,
              startDate: r.start ?? r.startDate,
              endDate: r.end ?? r.endDate,
              duration: r.duration ?? Math.round(
                (new Date(r.end ?? r.endDate).getTime() -
                  new Date(r.start ?? r.startDate).getTime()) / 1000
              ),
              distance: r.distance ?? 0, // react-native-health returns metres
              calories: r.calories ?? 0,
              averageHeartRate: r.heartRate ?? undefined,
            }));
            setWorkouts(mapped.sort((a, b) =>
              new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
            ));
          }
          resolve();
        }
      );
    });

    // Fetch daily steps
    const stepsMap: Record<string, number> = {};
    await new Promise<void>((resolve) => {
      AppleHealthKit.getDailyStepCountSamples(options, (err: any, results: any[]) => {
        if (!err && results) {
          results.forEach((r) => {
            const day = formatDate(isoToDate(r.startDate));
            stepsMap[day] = (stepsMap[day] ?? 0) + (r.value ?? 0);
          });
        }
        resolve();
      });
    });

    // Fetch daily calories
    const calMap: Record<string, number> = {};
    await new Promise<void>((resolve) => {
      AppleHealthKit.getActiveEnergyBurned(options, (err: any, results: any[]) => {
        if (!err && results) {
          results.forEach((r) => {
            const day = formatDate(isoToDate(r.startDate));
            calMap[day] = (calMap[day] ?? 0) + (r.value ?? 0);
          });
        }
        resolve();
      });
    });

    // Fetch daily distance
    const distMap: Record<string, number> = {};
    await new Promise<void>((resolve) => {
      AppleHealthKit.getDailyDistanceWalkingRunningSamples(options, (err: any, results: any[]) => {
        if (!err && results) {
          results.forEach((r) => {
            const day = formatDate(isoToDate(r.startDate));
            distMap[day] = (distMap[day] ?? 0) + (r.value ?? 0) * 1000; // km → m
          });
        }
        resolve();
      });
    });

    // Merge into daily summaries
    const days = new Set([
      ...Object.keys(stepsMap),
      ...Object.keys(calMap),
      ...Object.keys(distMap),
    ]);
    const summaries: DailySummary[] = Array.from(days)
      .sort((a, b) => b.localeCompare(a))
      .slice(0, 30)
      .map((date) => ({
        date,
        steps: Math.round(stepsMap[date] ?? 0),
        calories: Math.round(calMap[date] ?? 0),
        distance: Math.round(distMap[date] ?? 0),
      }));

    setDailySummaries(summaries);
    setIsLoading(false);
  }, [isAvailable]);

  const requestPermissions = useCallback(async () => {
    if (!isAvailable || !AppleHealthKit) return;
    await new Promise<void>((resolve) => {
      AppleHealthKit.initHealthKit(PERMISSIONS, (err: any) => {
        if (!err) setIsAuthorized(true);
        resolve();
      });
    });
    await fetchData();
  }, [isAvailable, fetchData]);

  useEffect(() => {
    if (!isAvailable || !AppleHealthKit) return;
    AppleHealthKit.isAvailable((err: any, available: boolean) => {
      if (!err && available) {
        AppleHealthKit.initHealthKit(PERMISSIONS, (initErr: any) => {
          if (!initErr) {
            setIsAuthorized(true);
            fetchData();
          }
        });
      }
    });
  }, [isAvailable, fetchData]);

  return (
    <HealthContext.Provider
      value={{
        isAvailable,
        isAuthorized,
        isLoading,
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
