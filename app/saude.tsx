import { Stack, router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BoxIcon } from "@/components/BoxIcon";
import { useHealth } from "@/contexts/HealthContext";
import { useColors } from "@/hooks/useColors";
import { syncHealthData } from "@/utils/healthSync";

const { width: SCREEN_W } = Dimensions.get("window");

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m}min ${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
}

function formatDistance(metres: number): string {
  if (metres >= 1000) return `${(metres / 1000).toFixed(2)} km`;
  return `${Math.round(metres)} m`;
}

function formatPace(metres: number, seconds: number): string {
  if (metres === 0) return "--";
  const minPer1k = seconds / 60 / (metres / 1000);
  const min = Math.floor(minPer1k);
  const sec = Math.round((minPer1k - min) * 60);
  return `${min}:${sec.toString().padStart(2, "0")} /km`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function StatCard({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: string;
  unit?: string;
  color: string;
}) {
  const colors = useColors();
  return (
    <View style={[styles.statCard, { backgroundColor: colors.card }]}>
      <Text style={[styles.statValue, { color: colors.foreground }]}>
        {value}
        {unit && (
          <Text style={[styles.statUnit, { color: colors.mutedForeground }]}>
            {" "}{unit}
          </Text>
        )}
      </Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
        {label}
      </Text>
    </View>
  );
}

export default function SaudeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    isAvailable,
    isAuthorized,
    isLoading,
    workouts,
    dailySummaries,
    requestPermissions,
    refresh,
  } = useHealth();
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSyncHealth = async () => {
    setIsSyncing(true);
    try {
      // Session cookie is sent automatically — no token needed
      const result = await syncHealthData();
      Alert.alert(
        "Sincronizado!",
        `${result.synced} treino${result.synced !== 1 ? "s" : ""} enviado${result.synced !== 1 ? "s" : ""} para o Pace5.`
      );
    } catch (error: any) {
      Alert.alert(
        "Erro na sincronização",
        error?.message ?? "Verifique as permissões do app Saúde e tente novamente."
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const totals = useMemo(() => {
    const totalDist = workouts.reduce((acc, w) => acc + w.distance, 0);
    const totalCal = workouts.reduce((acc, w) => acc + w.calories, 0);
    const totalTime = workouts.reduce((acc, w) => acc + w.duration, 0);
    const avgSteps = dailySummaries.length
      ? Math.round(
          dailySummaries.reduce((a, d) => a + d.steps, 0) / dailySummaries.length
        )
      : 0;
    return { totalDist, totalCal, totalTime, avgSteps };
  }, [workouts, dailySummaries]);

  if (Platform.OS !== "ios") {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={[styles.unavailText, { color: colors.mutedForeground }]}>
          Apple Health está disponível apenas no iPhone.
        </Text>
      </View>
    );
  }

  if (!isAvailable) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={[styles.unavailText, { color: colors.mutedForeground }]}>
          Apple Health não está disponível neste dispositivo.
        </Text>
      </View>
    );
  }

  if (!isAuthorized) {
    return (
      <View style={[styles.center, { paddingTop: insets.top, paddingHorizontal: 32 }]}>
        <BoxIcon name="Running" size={56} fill={colors.primary} pack="filled" />
        <Text style={[styles.authTitle, { color: colors.foreground }]}>
          Conectar ao Apple Health
        </Text>
        <Text style={[styles.authDesc, { color: colors.mutedForeground }]}>
          Autorize o acesso para visualizar suas corridas, passos, calorias e
          frequência cardíaca diretamente no Pace5.
        </Text>
        <TouchableOpacity
          style={[styles.authBtn, { backgroundColor: colors.primary }]}
          onPress={requestPermissions}
          activeOpacity={0.85}
        >
          <Text style={styles.authBtnText}>Autorizar Apple Health</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: "Apple Health",
          headerShown: true,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.foreground,
          headerShadowVisible: false,
          headerRight: () => (
            <Pressable onPress={refresh} style={{ marginRight: 16 }}>
              <BoxIcon name="Running" size={22} fill={colors.primary} pack="basic" />
            </Pressable>
          ),
        }}
      />
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={{ backgroundColor: colors.background }}
          contentContainerStyle={{
            paddingBottom: insets.bottom + 24,
            paddingHorizontal: 16,
          }}
        >
          {/* Sync button */}
          <TouchableOpacity
            style={[styles.syncBtn, { backgroundColor: colors.foreground, opacity: isSyncing ? 0.7 : 1 }]}
            onPress={handleSyncHealth}
            disabled={isSyncing}
            activeOpacity={0.85}
          >
            {isSyncing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <BoxIcon name="Sync" size={18} fill="#fff" pack="basic" />
            )}
            <Text style={styles.syncBtnText}>
              {isSyncing ? "Sincronizando..." : "Sincronizar com Pace5"}
            </Text>
          </TouchableOpacity>

          {/* 30-day summary */}
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Últimos 30 dias
          </Text>
          <View style={styles.statsRow}>
            <StatCard
              label="Distância total"
              value={formatDistance(totals.totalDist)}
              color={colors.primary}
            />
            <StatCard
              label="Calorias"
              value={totals.totalCal.toLocaleString("pt-BR")}
              unit="kcal"
              color={colors.primary}
            />
          </View>
          <View style={styles.statsRow}>
            <StatCard
              label="Tempo em movimento"
              value={formatDuration(totals.totalTime)}
              color={colors.primary}
            />
            <StatCard
              label="Média de passos/dia"
              value={totals.avgSteps.toLocaleString("pt-BR")}
              color={colors.primary}
            />
          </View>

          {/* Recent workouts */}
          {workouts.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                Corridas recentes
              </Text>
              {workouts.slice(0, 10).map((w) => (
                <View
                  key={w.id}
                  style={[styles.workoutCard, { backgroundColor: colors.card }]}
                >
                  <View style={styles.workoutHeader}>
                    <BoxIcon name="Running" size={18} fill={colors.primary} pack="filled" />
                    <Text style={[styles.workoutDate, { color: colors.foreground }]}>
                      {formatDate(w.startDate)}
                    </Text>
                    {w.averageHeartRate && (
                      <Text style={[styles.hrTag, { color: colors.mutedForeground }]}>
                        ♥ {Math.round(w.averageHeartRate)} bpm
                      </Text>
                    )}
                  </View>
                  <View style={styles.workoutStats}>
                    <View style={styles.workoutStat}>
                      <Text style={[styles.workoutStatVal, { color: colors.foreground }]}>
                        {formatDistance(w.distance)}
                      </Text>
                      <Text style={[styles.workoutStatLbl, { color: colors.mutedForeground }]}>
                        distância
                      </Text>
                    </View>
                    <View style={styles.workoutStat}>
                      <Text style={[styles.workoutStatVal, { color: colors.foreground }]}>
                        {formatDuration(w.duration)}
                      </Text>
                      <Text style={[styles.workoutStatLbl, { color: colors.mutedForeground }]}>
                        duração
                      </Text>
                    </View>
                    <View style={styles.workoutStat}>
                      <Text style={[styles.workoutStatVal, { color: colors.foreground }]}>
                        {formatPace(w.distance, w.duration)}
                      </Text>
                      <Text style={[styles.workoutStatLbl, { color: colors.mutedForeground }]}>
                        pace
                      </Text>
                    </View>
                    <View style={styles.workoutStat}>
                      <Text style={[styles.workoutStatVal, { color: colors.foreground }]}>
                        {Math.round(w.calories)}
                      </Text>
                      <Text style={[styles.workoutStatLbl, { color: colors.mutedForeground }]}>
                        kcal
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </>
          )}

          {/* Daily steps */}
          {dailySummaries.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                Passos por dia
              </Text>
              {dailySummaries.slice(0, 7).map((d) => {
                const pct = Math.min(d.steps / 10000, 1);
                return (
                  <View
                    key={d.date}
                    style={[styles.stepRow, { backgroundColor: colors.card }]}
                  >
                    <Text style={[styles.stepDate, { color: colors.mutedForeground }]}>
                      {new Date(d.date + "T12:00:00").toLocaleDateString("pt-BR", {
                        weekday: "short",
                        day: "2-digit",
                      })}
                    </Text>
                    <View style={[styles.stepBarBg, { backgroundColor: colors.border }]}>
                      <View
                        style={[
                          styles.stepBarFill,
                          {
                            width: `${Math.round(pct * 100)}%` as any,
                            backgroundColor:
                              pct >= 1 ? colors.primary : colors.mutedForeground,
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.stepCount, { color: colors.foreground }]}>
                      {d.steps.toLocaleString("pt-BR")}
                    </Text>
                  </View>
                );
              })}
            </>
          )}

          {workouts.length === 0 && dailySummaries.length === 0 && (
            <View style={styles.center}>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Nenhuma atividade encontrada nos últimos 30 dias.
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 32,
  },
  unavailText: {
    fontSize: 15,
    textAlign: "center",
    fontFamily: "Inter_400Regular",
  },
  authTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    marginTop: 16,
  },
  authDesc: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },
  authBtn: {
    paddingVertical: 15,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginTop: 8,
    width: "100%",
    alignItems: "center",
  },
  authBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    marginTop: 24,
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  statCard: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
    gap: 4,
  },
  statValue: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  statUnit: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  statLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  workoutCard: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  workoutHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  workoutDate: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  hrTag: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  workoutStats: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  workoutStat: {
    alignItems: "center",
    gap: 2,
  },
  workoutStatVal: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  workoutStatLbl: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  stepDate: {
    width: 60,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  stepBarBg: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  stepBarFill: {
    height: 6,
    borderRadius: 3,
  },
  stepCount: {
    width: 52,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textAlign: "right",
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },
  syncBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 16,
  },
  syncBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
