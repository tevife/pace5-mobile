import { Platform } from "react-native";

import { syncViaWebView } from "@/utils/webViewBridge";

// react-native-health is iOS-only
let AppleHealthKit: any = null;
if (Platform.OS === "ios") {
  AppleHealthKit = require("react-native-health").default;
}

const PERMISSIONS = {
  permissions: {
    read: [
      // Reading workouts (runs) is all we need for sync
      "Workout" as any,
    ],
    write: [],
  },
};

export interface SyncResult {
  synced: number;
  message?: string;
}

/**
 * Requests HealthKit permission (if not already granted), reads running
 * workouts from the last 90 days, then delegates the POST to the active
 * SiteWebView via webViewBridge so the request carries the session cookie.
 */
export async function syncHealthData(): Promise<SyncResult> {
  if (Platform.OS !== "ios" || !AppleHealthKit) {
    return { synced: 0, message: "Apple Health não disponível neste dispositivo." };
  }

  return new Promise((resolve, reject) => {
    // Step 1 — request permissions (shows the native iOS Health sheet)
    AppleHealthKit.initHealthKit(PERMISSIONS, (initErr: any) => {
      if (initErr) {
        return reject(new Error(`Permissão negada: ${initErr}`));
      }

      // Step 2 — fetch running workouts from the last 90 days
      const options = {
        startDate: new Date(Date.now() - 90 * 86_400_000).toISOString(),
        endDate: new Date().toISOString(),
        type: "Running",
      };

      AppleHealthKit.getWorkouts(options, async (workoutErr: any, results: any[]) => {
        if (workoutErr) {
          return reject(new Error(`Erro ao ler treinos: ${workoutErr}`));
        }

        // Step 3 — format to the shape the Pace5 API expects
        const workouts = (results ?? []).map((w: any) => ({
          sourceId: w.id ?? w.startDate,
          type: "running",
          startDate: w.start ?? w.startDate,
          endDate: w.end ?? w.endDate,
          duration: Math.round(
            (new Date(w.end ?? w.endDate).getTime() -
              new Date(w.start ?? w.startDate).getTime()) /
              1000
          ),
          distance: w.distance ?? 0,
          calories: w.calories ?? 0,
        }));

        // Step 4 — delegate the POST to the WebView (which carries session cookies)
        try {
          const result = await syncViaWebView(workouts);
          resolve(result);
        } catch (err: any) {
          reject(err);
        }
      });
    });
  });
}
