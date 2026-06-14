import { Platform } from "react-native";

import type {
  QuantitySampleTyped,
  QuantityTypeIdentifier,
  WorkoutProxyTyped,
} from "@kingstinct/react-native-healthkit";

const READ_PERMISSIONS = [
  "HKWorkoutTypeIdentifier",
  "HKQuantityTypeIdentifierStepCount",
  "HKQuantityTypeIdentifierDistanceWalkingRunning",
  "HKQuantityTypeIdentifierActiveEnergyBurned",
  "HKQuantityTypeIdentifierBasalEnergyBurned",
  "HKQuantityTypeIdentifierHeartRate",
  "HKQuantityTypeIdentifierRestingHeartRate",
  "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
  "HKQuantityTypeIdentifierVO2Max",
  "HKQuantityTypeIdentifierBodyMass",
  "HKQuantityTypeIdentifierHeight",
  "HKCategoryTypeIdentifierSleepAnalysis",
  "HKCharacteristicTypeIdentifierDateOfBirth",
  "HKCharacteristicTypeIdentifierBiologicalSex",
] as const;

type QuantityIdentifier = Extract<
  QuantityTypeIdentifier,
  | "HKQuantityTypeIdentifierStepCount"
  | "HKQuantityTypeIdentifierDistanceWalkingRunning"
  | "HKQuantityTypeIdentifierActiveEnergyBurned"
  | "HKQuantityTypeIdentifierBasalEnergyBurned"
  | "HKQuantityTypeIdentifierHeartRate"
  | "HKQuantityTypeIdentifierRestingHeartRate"
  | "HKQuantityTypeIdentifierHeartRateVariabilitySDNN"
  | "HKQuantityTypeIdentifierVO2Max"
  | "HKQuantityTypeIdentifierBodyMass"
  | "HKQuantityTypeIdentifierHeight"
>;

export type HealthKitQuantitySample = QuantitySampleTyped<QuantityIdentifier>;
export type HealthKitCategorySample = {
  startDate?: Date;
  endDate?: Date;
  value?: number | string;
};
export type HealthKitWorkout = WorkoutProxyTyped;

export type HealthKitRangeOptions = {
  startDate: string;
  endDate: string;
  ascending?: boolean;
  unit?: string;
};

export type HealthKitWorkoutOptions = HealthKitRangeOptions & {
  type?: string;
};

function loadHealthKit() {
  if (Platform.OS !== "ios") return null;

  try {
    return require("@kingstinct/react-native-healthkit") as typeof import("@kingstinct/react-native-healthkit");
  } catch {
    return null;
  }
}

function toDateRange(options: HealthKitRangeOptions) {
  return {
    startDate: new Date(options.startDate),
    endDate: new Date(options.endDate),
  };
}

export function getAppleHealthKit() {
  return loadHealthKit();
}

export async function isHealthKitAvailable(): Promise<boolean> {
  const healthKit = loadHealthKit();
  if (!healthKit) return false;

  return healthKit.isHealthDataAvailableAsync();
}

export async function initializeHealthKit(): Promise<void> {
  const healthKit = loadHealthKit();
  if (!healthKit) {
    throw new Error("Apple Health indisponível nesta build.");
  }

  await healthKit.requestAuthorization({
    toRead: READ_PERMISSIONS,
  });
}

export async function readHealthKit(
  identifier: QuantityIdentifier,
  options: HealthKitRangeOptions
): Promise<HealthKitQuantitySample[]> {
  const healthKit = loadHealthKit();
  if (!healthKit) {
    throw new Error("Apple Health indisponível nesta build.");
  }

  const samples = await healthKit.queryQuantitySamples(identifier, {
    filter: {
      date: toDateRange(options),
    },
    ascending: options.ascending,
    limit: 0,
    unit: options.unit as never,
  });

  return [...samples] as HealthKitQuantitySample[];
}

export async function readCategoryHealthKit(
  identifier: "HKCategoryTypeIdentifierSleepAnalysis",
  options: HealthKitRangeOptions
): Promise<HealthKitCategorySample[]> {
  const healthKit = loadHealthKit();
  if (!healthKit) {
    throw new Error("Apple Health indisponível nesta build.");
  }

  const samples = await (healthKit as any).queryCategorySamples(identifier, {
    filter: {
      date: toDateRange(options),
    },
    ascending: options.ascending,
    limit: 0,
  });

  return [...(samples ?? [])] as HealthKitCategorySample[];
}

export async function readWorkouts(options: HealthKitWorkoutOptions): Promise<HealthKitWorkout[]> {
  const healthKit = loadHealthKit();
  if (!healthKit) {
    throw new Error("Apple Health indisponível nesta build.");
  }

  const workouts = await healthKit.queryWorkoutSamples({
    filter: {
      date: toDateRange(options),
      workoutActivityType: 37,
    },
    ascending: options.ascending,
    limit: 0,
  });

  return [...workouts];
}
