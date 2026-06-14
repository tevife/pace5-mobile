import { Stack, router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
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
import {
  CoachAnalysis,
  CoachInsight,
  buildCoachAnalysis,
  riskLabel,
  runnerLevelLabel,
} from "@/utils/coachEngine";
import {
  CoachFeedbackRating,
  saveCoachSnapshot,
  submitCoachFeedback,
} from "@/utils/coachPersistence";
import { coachSyncTransportLabel, healthSyncEndpoint } from "@/utils/coachBackend";
import { getQueuedCoachSyncCount } from "@/utils/coachSyncQueue";
import { syncCoachData } from "@/utils/healthSync";

const { width: SCREEN_W } = Dimensions.get("window");
const ANALYSIS_PERIODS = [
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
  { label: "1 ano", days: 365 },
] as const;

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

function formatKm(value: number): string {
  return `${value.toFixed(value >= 10 ? 0 : 1)} km`;
}

function formatRatio(value: number): string {
  return value > 0 ? value.toFixed(2) : "--";
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatSignedPercent(value: number): string {
  if (value === 0) return "0%";
  return `${value > 0 ? "+" : ""}${Math.round(value * 100)}%`;
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

function scoreStatus(score: number): string {
  if (score >= 76) return "forte";
  if (score >= 56) return "bom";
  if (score >= 31) return "atenção";
  return "baixo";
}

function CoachMomentCard({ analysis }: { analysis: CoachAnalysis }) {
  const colors = useColors();
  const readiness = analysis.scores.readiness10k;
  const risk = analysis.scores.riskScore;

  return (
    <View style={[styles.momentCard, { backgroundColor: colors.foreground }]}>
      <View style={styles.momentHeader}>
        <View>
          <Text style={styles.momentEyebrow}>Seu Momento</Text>
          <Text style={styles.momentTitle}>
            {runnerLevelLabel(analysis.profile.level)}
          </Text>
        </View>
        <View style={styles.confidenceBadge}>
          <Text style={styles.confidenceText}>
            {analysis.profile.confidence === "high"
              ? "alta confiança"
              : analysis.profile.confidence === "medium"
                ? "confiança média"
                : "análise inicial"}
          </Text>
        </View>
      </View>

      <Text style={styles.momentSummary}>{analysis.profile.summary}</Text>

      <View style={styles.momentMetrics}>
        <View style={styles.momentMetric}>
          <Text style={styles.momentMetricValue}>{readiness}</Text>
          <Text style={styles.momentMetricLabel}>Readiness 10k</Text>
        </View>
        <View style={styles.momentMetric}>
          <Text style={styles.momentMetricValue}>{riskLabel(risk)}</Text>
          <Text style={styles.momentMetricLabel}>Risco atual</Text>
        </View>
      </View>

      <View style={styles.nextActionBox}>
        <Text style={styles.nextActionLabel}>Próximo melhor passo</Text>
        <Text style={styles.nextActionText}>{analysis.nextBestAction}</Text>
      </View>
    </View>
  );
}

function ScoreCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  const colors = useColors();
  return (
    <View style={[styles.scoreCard, { backgroundColor: colors.card }]}>
      <View style={styles.scoreTopRow}>
        <Text style={[styles.scoreLabel, { color: colors.mutedForeground }]}>
          {label}
        </Text>
        <Text style={[styles.scoreStatus, { color: colors.mutedForeground }]}>
          {scoreStatus(value)}
        </Text>
      </View>
      <Text style={[styles.scoreValue, { color: colors.foreground }]}>
        {value}
        <Text style={[styles.scoreMax, { color: colors.mutedForeground }]}>/100</Text>
      </Text>
      <View style={[styles.scoreBarBg, { backgroundColor: colors.border }]}>
        <View
          style={[
            styles.scoreBarFill,
            { width: `${value}%` as any, backgroundColor: colors.foreground },
          ]}
        />
      </View>
    </View>
  );
}

function ReadinessDistanceCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  const colors = useColors();
  return (
    <View style={[styles.distanceCard, { backgroundColor: colors.card }]}>
      <Text style={[styles.distanceLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.distanceValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

function MetricTile({
  label,
  value,
  detail,
  fullWidth,
}: {
  label: string;
  value: string;
  detail?: string;
  fullWidth?: boolean;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.metricTile,
        fullWidth && styles.metricTileFull,
        { backgroundColor: colors.background },
      ]}
    >
      <Text style={[styles.metricTileValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.metricTileLabel, { color: colors.mutedForeground }]}>{label}</Text>
      {detail && (
        <Text style={[styles.metricTileDetail, { color: colors.mutedForeground }]}>
          {detail}
        </Text>
      )}
    </View>
  );
}

function LoadOverviewCard({ analysis }: { analysis: CoachAnalysis }) {
  const colors = useColors();
  const features = analysis.features;
  const ratio = features.acuteChronicRatio;
  const ratioLabel =
    ratio === 0 ? "sem base" : ratio > 1.35 ? "subiu rapido" : ratio < 0.75 ? "reduzida" : "equilibrada";

  return (
    <View style={[styles.dashboardCard, { backgroundColor: colors.card }]}>
      <View style={styles.dashboardHeader}>
        <Text style={[styles.dashboardTitle, { color: colors.foreground }]}>
          Carga de treino
        </Text>
        <Text style={[styles.dashboardBadge, { color: colors.mutedForeground }]}>
          {ratioLabel}
        </Text>
      </View>
      <View style={styles.metricGrid}>
        <MetricTile
          label="carga aguda"
          value={Math.round(features.acuteLoad).toLocaleString("pt-BR")}
          detail="ultimos 7 dias"
        />
        <MetricTile
          label="carga cronica"
          value={Math.round(features.chronicLoad).toLocaleString("pt-BR")}
          detail="media 28 dias"
        />
        <MetricTile
          label="A/C ratio"
          value={formatRatio(features.acuteChronicRatio)}
          detail="aguda / cronica"
        />
        <MetricTile
          label="vs semana anterior"
          value={formatSignedPercent(features.weeklyVolumeChangeRatio)}
          detail="volume 7d"
        />
      </View>
    </View>
  );
}

function IntensityDistributionCard({ analysis }: { analysis: CoachAnalysis }) {
  const colors = useColors();
  const features = analysis.features;
  const items = [
    { label: "Leve", value: features.easyIntensityRatio, color: "#16a34a" },
    { label: "Moderado", value: features.moderateIntensityRatio, color: "#d97706" },
    { label: "Forte", value: features.hardIntensityRatio, color: colors.destructive },
  ];

  return (
    <View style={[styles.dashboardCard, { backgroundColor: colors.card }]}>
      <View style={styles.dashboardHeader}>
        <Text style={[styles.dashboardTitle, { color: colors.foreground }]}>
          Distribuicao de intensidade
        </Text>
        <Text style={[styles.dashboardBadge, { color: colors.mutedForeground }]}>
          28 dias
        </Text>
      </View>
      {items.map((item) => (
        <View key={item.label} style={styles.intensityRow}>
          <Text style={[styles.intensityLabel, { color: colors.mutedForeground }]}>
            {item.label}
          </Text>
          <View style={[styles.intensityBarBg, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.intensityBarFill,
                {
                  width: `${Math.max(2, Math.round(item.value * 100))}%` as any,
                  backgroundColor: item.color,
                },
              ]}
            />
          </View>
          <Text style={[styles.intensityValue, { color: colors.foreground }]}>
            {formatPercent(item.value)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function EvolutionCard({ analysis }: { analysis: CoachAnalysis }) {
  const colors = useColors();
  const features = analysis.features;
  const paceTrend = features.paceTrendLast28Days;
  const paceTrendLabel =
    typeof paceTrend === "number"
      ? paceTrend > 0.01
        ? `${formatSignedPercent(paceTrend)} melhor`
        : paceTrend < -0.01
          ? `${formatSignedPercent(paceTrend)} pior`
          : "estavel"
      : "--";

  return (
    <View style={[styles.dashboardCard, styles.halfDashboardCard, { backgroundColor: colors.card }]}>
      <Text style={[styles.dashboardTitle, { color: colors.foreground }]}>
        Evolucao
      </Text>
      <View style={styles.compactMetricList}>
        <MetricTile fullWidth label="7 dias" value={formatKm(features.last7DaysDistanceKm)} />
        <MetricTile fullWidth label="28 dias" value={formatKm(features.last28DaysDistanceKm)} />
        <MetricTile fullWidth label="90 dias" value={formatKm(features.last90DaysDistanceKm)} />
        <MetricTile fullWidth label="pace" value={paceTrendLabel} />
      </View>
    </View>
  );
}

function DataCoverageCard({ analysis }: { analysis: CoachAnalysis }) {
  const colors = useColors();
  const available = analysis.availableData.length;
  const missing = analysis.missingData.length;

  return (
    <View style={[styles.dashboardCard, styles.halfDashboardCard, { backgroundColor: colors.card }]}>
      <Text style={[styles.dashboardTitle, { color: colors.foreground }]}>
        Dados do coach
      </Text>
      <Text style={[styles.coverageValue, { color: colors.foreground }]}>
        {available}
        <Text style={[styles.coverageMuted, { color: colors.mutedForeground }]}> fontes</Text>
      </Text>
      <Text style={[styles.coverageText, { color: colors.mutedForeground }]}>
        {missing > 0
          ? `${missing} sinais ainda podem melhorar a analise.`
          : "Cobertura completa para a analise atual."}
      </Text>
      <View style={styles.coveragePills}>
        {analysis.availableData.slice(0, 3).map((item) => (
          <Text
            key={item}
            style={[
              styles.coveragePill,
              { color: colors.foreground, borderColor: colors.border },
            ]}
          >
            {item}
          </Text>
        ))}
      </View>
    </View>
  );
}

function TrainingShapeCard({ analysis }: { analysis: CoachAnalysis }) {
  const colors = useColors();
  const features = analysis.features;
  return (
    <View style={[styles.dashboardCard, { backgroundColor: colors.card }]}>
      <View style={styles.dashboardHeader}>
        <Text style={[styles.dashboardTitle, { color: colors.foreground }]}>
          Forma atual
        </Text>
        <Text style={[styles.dashboardBadge, { color: colors.mutedForeground }]}>
          {analysis.profile.confidence === "high" ? "confiavel" : "em aprendizado"}
        </Text>
      </View>
      <View style={styles.metricGrid}>
        <MetricTile
          label="frequencia"
          value={features.avgWeeklyRunsLast28Days.toFixed(1)}
          detail="treinos/sem"
        />
        <MetricTile
          label="volume medio"
          value={formatKm(features.avgWeeklyDistanceLast28DaysKm)}
          detail="por semana"
        />
        <MetricTile
          label="longao recente"
          value={formatKm(features.maxLongRunLast90DaysKm)}
          detail="maior em 90d"
        />
        <MetricTile
          label="semanas ativas"
          value={`${features.activeWeeksLast28Days}/4`}
          detail="regularidade"
        />
      </View>
    </View>
  );
}

function feedbackLabel(rating: CoachFeedbackRating): string {
  const labels: Record<CoachFeedbackRating, string> = {
    veryUseful: "Muito útil",
    useful: "Útil",
    notUseful: "Pouco útil",
    didNotMakeSense: "Não fez sentido",
  };
  return labels[rating];
}

function InsightCard({ insight }: { insight: CoachInsight }) {
  const colors = useColors();
  const [selectedFeedback, setSelectedFeedback] = useState<CoachFeedbackRating | null>(null);
  const severityColor =
    insight.severity === "positive"
      ? "#16a34a"
      : insight.severity === "warning" || insight.severity === "critical"
        ? colors.destructive
        : insight.severity === "attention"
          ? "#d97706"
          : colors.mutedForeground;

  const handleFeedback = async (rating: CoachFeedbackRating) => {
    setSelectedFeedback(rating);
    await submitCoachFeedback(insight, rating);
  };

  return (
    <View style={[styles.insightCard, { backgroundColor: colors.card }]}>
      <View style={styles.insightHeader}>
        <View style={[styles.insightDot, { backgroundColor: severityColor }]} />
        <Text style={[styles.insightTitle, { color: colors.foreground }]}>
          {insight.title}
        </Text>
      </View>
      <Text style={[styles.insightSummary, { color: colors.mutedForeground }]}>
        {insight.summary}
      </Text>
      <Text style={[styles.insightRecommendation, { color: colors.foreground }]}>
        {insight.recommendation}
      </Text>
      <View style={styles.feedbackRow}>
        {(["veryUseful", "useful", "notUseful", "didNotMakeSense"] as CoachFeedbackRating[]).map(
          (rating) => {
            const selected = selectedFeedback === rating;
            return (
              <TouchableOpacity
                key={rating}
                style={[
                  styles.feedbackButton,
                  {
                    borderColor: selected ? colors.foreground : colors.border,
                    backgroundColor: selected ? colors.foreground : "transparent",
                  },
                ]}
                onPress={() => handleFeedback(rating)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.feedbackButtonText,
                    { color: selected ? "#fff" : colors.mutedForeground },
                  ]}
                >
                  {feedbackLabel(rating)}
                </Text>
              </TouchableOpacity>
            );
          }
        )}
      </View>
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
    errorMessage,
    requestPermissions,
    refresh,
  } = useHealth();
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedPeriodDays, setSelectedPeriodDays] = useState(30);
  const [queuedSyncCount, setQueuedSyncCount] = useState(0);

  const refreshSyncQueueCount = async () => {
    const count = await getQueuedCoachSyncCount();
    setQueuedSyncCount(count);
  };

  const handleSyncHealth = async () => {
    setIsSyncing(true);
    try {
      const result = await syncCoachData({
        workouts: totals.periodWorkouts,
        dailySummaries: totals.periodSummaries,
        analysis: coachAnalysis,
      });
      Alert.alert(
        result.synced > 0 ? "Sincronizado!" : result.queued > 0 ? "Salvo na fila" : "Nada para sincronizar",
        result.message ??
          `${result.synced} item${result.synced !== 1 ? "s" : ""} enviado${
            result.synced !== 1 ? "s" : ""
          } para o Pace5.`
      );
      await refreshSyncQueueCount();
    } catch (error: any) {
      Alert.alert(
        "Erro na sincronização",
        error?.message ?? "Verifique as permissões do app Saúde e tente novamente."
      );
      await refreshSyncQueueCount();
    } finally {
      setIsSyncing(false);
    }
  };

  const totals = useMemo(() => {
    const periodStart = Date.now() - selectedPeriodDays * 86_400_000;
    const periodWorkouts = workouts.filter(
      (workout) => new Date(workout.startDate).getTime() >= periodStart
    );
    const periodSummaries = dailySummaries.slice(0, selectedPeriodDays);
    const totalDist = periodWorkouts.reduce((acc, w) => acc + w.distance, 0);
    const totalCal = periodWorkouts.reduce((acc, w) => acc + w.calories, 0);
    const totalTime = periodWorkouts.reduce((acc, w) => acc + w.duration, 0);
    const avgSteps = periodSummaries.length
      ? Math.round(
          periodSummaries.reduce((a, d) => a + d.steps, 0) / periodSummaries.length
        )
      : 0;
    return { totalDist, totalCal, totalTime, avgSteps, periodWorkouts, periodSummaries };
  }, [workouts, dailySummaries, selectedPeriodDays]);
  const coachAnalysis = useMemo(
    () => buildCoachAnalysis(totals.periodWorkouts, totals.periodSummaries),
    [totals.periodWorkouts, totals.periodSummaries]
  );

  useEffect(() => {
    if (!isAuthorized) return;
    saveCoachSnapshot(coachAnalysis).catch(() => {});
  }, [coachAnalysis, isAuthorized]);

  useEffect(() => {
    refreshSyncQueueCount().catch(() => {});
  }, []);

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
        {errorMessage && (
          <Text style={[styles.errorText, { color: colors.destructive }]}>
            {errorMessage}
          </Text>
        )}
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
            <Pressable onPress={() => refresh()} style={{ marginRight: 16 }}>
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
          {errorMessage && (
            <Text style={[styles.errorText, { color: colors.destructive }]}>
              {errorMessage}
            </Text>
          )}

          <View style={[styles.syncStatusCard, { backgroundColor: colors.card }]}>
            <View style={styles.syncStatusHeader}>
              <Text style={[styles.syncStatusTitle, { color: colors.foreground }]}>
                Sync do Coach
              </Text>
              <Text style={[styles.syncStatusBadge, { color: colors.mutedForeground }]}>
                {coachSyncTransportLabel()}
              </Text>
            </View>
            <Text style={[styles.syncStatusText, { color: colors.mutedForeground }]}>
              Endpoint: {healthSyncEndpoint()}
            </Text>
            <Text style={[styles.syncStatusText, { color: colors.mutedForeground }]}>
              Fila local: {queuedSyncCount} pendente{queuedSyncCount === 1 ? "" : "s"}
            </Text>
          </View>

          <View style={[styles.periodSelector, { backgroundColor: colors.card }]}>
            {ANALYSIS_PERIODS.map((period) => {
              const selected = selectedPeriodDays === period.days;
              return (
                <TouchableOpacity
                  key={period.days}
                  style={[
                    styles.periodButton,
                    { backgroundColor: selected ? colors.foreground : "transparent" },
                  ]}
                  onPress={() => setSelectedPeriodDays(period.days)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.periodButtonText,
                      { color: selected ? "#fff" : colors.mutedForeground },
                    ]}
                  >
                    {period.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <CoachMomentCard analysis={coachAnalysis} />

          <View style={styles.quickActionsRow}>
            <TouchableOpacity
              style={[styles.quickAction, { backgroundColor: colors.card }]}
              onPress={() => router.push("/dados-conectados")}
              activeOpacity={0.85}
            >
              <Text style={[styles.quickActionTitle, { color: colors.foreground }]}>
                Dados Conectados
              </Text>
              <Text style={[styles.quickActionText, { color: colors.mutedForeground }]}>
                Ver permissões e lacunas
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickAction, { backgroundColor: colors.card }]}
              onPress={() => router.push("/privacidade-coach")}
              activeOpacity={0.85}
            >
              <Text style={[styles.quickActionTitle, { color: colors.foreground }]}>
                Privacidade
              </Text>
              <Text style={[styles.quickActionText, { color: colors.mutedForeground }]}>
                Controlar análise e coach
              </Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.raceFitAction, { backgroundColor: colors.card }]}
            onPress={() => router.push("/prova")}
            activeOpacity={0.85}
          >
            <View style={styles.raceFitIcon}>
              <BoxIcon name="Trophy" size={20} fill={colors.foreground} pack="basic" />
            </View>
            <View style={styles.raceFitCopy}>
              <Text style={[styles.quickActionTitle, { color: colors.foreground }]}>
                Race Fit
              </Text>
              <Text style={[styles.quickActionText, { color: colors.mutedForeground }]}>
                Cadastre uma prova e veja se ela combina com seu momento.
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.raceFitAction, { backgroundColor: colors.card }]}
            onPress={() => router.push("/insights")}
            activeOpacity={0.85}
          >
            <View style={styles.raceFitIcon}>
              <BoxIcon name="Sparkles" size={20} fill={colors.foreground} pack="basic" />
            </View>
            <View style={styles.raceFitCopy}>
              <Text style={[styles.quickActionTitle, { color: colors.foreground }]}>
                Histórico do Coach
              </Text>
              <Text style={[styles.quickActionText, { color: colors.mutedForeground }]}>
                Veja evolução dos scores e insights antigos.
              </Text>
            </View>
          </TouchableOpacity>

          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Dashboard do Coach
          </Text>
          <LoadOverviewCard analysis={coachAnalysis} />
          <TrainingShapeCard analysis={coachAnalysis} />
          <View style={styles.dashboardTwoColumn}>
            <EvolutionCard analysis={coachAnalysis} />
            <DataCoverageCard analysis={coachAnalysis} />
          </View>
          <IntensityDistributionCard analysis={coachAnalysis} />

          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Scores do Coach
          </Text>
          <View style={styles.scoreGrid}>
            <ScoreCard label="Consistência" value={coachAnalysis.scores.consistencyScore} />
            <ScoreCard label="Carga" value={coachAnalysis.scores.loadScore} />
            <ScoreCard label="Recuperação" value={coachAnalysis.scores.recoveryScore} />
            <ScoreCard label="Evolução" value={coachAnalysis.scores.progressScore} />
            <ScoreCard label="Risco" value={coachAnalysis.scores.riskScore} />
            <ScoreCard label="Base aeróbica" value={coachAnalysis.scores.aerobicBaseScore} />
          </View>

          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Prontidão por distância
          </Text>
          <View style={styles.distanceGrid}>
            <ReadinessDistanceCard label="5k" value={coachAnalysis.scores.readiness5k} />
            <ReadinessDistanceCard label="10k" value={coachAnalysis.scores.readiness10k} />
            <ReadinessDistanceCard label="21k" value={coachAnalysis.scores.readiness21k} />
            <ReadinessDistanceCard label="42k" value={coachAnalysis.scores.readiness42k} />
          </View>

          <View style={[styles.recoveryCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.recoveryTitle, { color: colors.foreground }]}>
              Recuperação
            </Text>
            <View style={styles.recoveryGrid}>
              <View style={styles.recoveryItem}>
                <Text style={[styles.recoveryValue, { color: colors.foreground }]}>
                  {coachAnalysis.features.avgSleepMinutesLast7Days
                    ? `${Math.round(coachAnalysis.features.avgSleepMinutesLast7Days / 60)}h`
                    : "--"}
                </Text>
                <Text style={[styles.recoveryLabel, { color: colors.mutedForeground }]}>
                  sono médio
                </Text>
              </View>
              <View style={styles.recoveryItem}>
                <Text style={[styles.recoveryValue, { color: colors.foreground }]}>
                  {coachAnalysis.features.avgHRVLast7Days
                    ? `${Math.round(coachAnalysis.features.avgHRVLast7Days)} ms`
                    : "--"}
                </Text>
                <Text style={[styles.recoveryLabel, { color: colors.mutedForeground }]}>
                  HRV
                </Text>
              </View>
              <View style={styles.recoveryItem}>
                <Text style={[styles.recoveryValue, { color: colors.foreground }]}>
                  {coachAnalysis.features.avgRestingHeartRateLast7Days
                    ? `${Math.round(coachAnalysis.features.avgRestingHeartRateLast7Days)} bpm`
                    : "--"}
                </Text>
                <Text style={[styles.recoveryLabel, { color: colors.mutedForeground }]}>
                  FC repouso
                </Text>
              </View>
            </View>
          </View>

          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Insights da semana
          </Text>
          {coachAnalysis.insights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}

          {coachAnalysis.missingData.length > 0 && (
            <View style={[styles.dataStatusCard, { backgroundColor: colors.card }]}>
              <Text style={[styles.dataStatusTitle, { color: colors.foreground }]}>
                Dados que melhoram a análise
              </Text>
              {coachAnalysis.missingData.slice(0, 3).map((item) => (
                <Text key={item} style={[styles.dataStatusItem, { color: colors.mutedForeground }]}>
                  • {item}
                </Text>
              ))}
            </View>
          )}

          {/* 30-day summary */}
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Últimos {selectedPeriodDays === 365 ? "12 meses" : `${selectedPeriodDays} dias`}
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
              {totals.periodWorkouts.slice(0, 10).map((w) => (
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
          {totals.periodSummaries.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                Passos por dia
              </Text>
              {totals.periodSummaries.slice(0, 7).map((d) => {
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

          {totals.periodWorkouts.length === 0 && totals.periodSummaries.length === 0 && (
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
  errorText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
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
  periodSelector: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 4,
    marginTop: 14,
    gap: 4,
  },
  periodButton: {
    flex: 1,
    borderRadius: 9,
    paddingVertical: 9,
    alignItems: "center",
  },
  periodButtonText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  momentCard: {
    borderRadius: 18,
    padding: 18,
    marginTop: 16,
    gap: 16,
  },
  momentHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  momentEyebrow: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
  },
  momentTitle: {
    color: "#fff",
    fontSize: 23,
    fontFamily: "Inter_700Bold",
    marginTop: 4,
  },
  confidenceBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  confidenceText: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  momentSummary: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
  },
  momentMetrics: {
    flexDirection: "row",
    gap: 10,
  },
  momentMetric: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  momentMetricValue: {
    color: "#fff",
    fontSize: 24,
    fontFamily: "Inter_700Bold",
  },
  momentMetricLabel: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  nextActionBox: {
    borderRadius: 12,
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  nextActionLabel: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
  },
  nextActionText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 20,
  },
  quickActionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  quickAction: {
    flex: 1,
    borderRadius: 12,
    padding: 13,
    gap: 4,
  },
  quickActionTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  quickActionText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },
  raceFitAction: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    padding: 13,
    gap: 12,
    marginTop: 10,
  },
  raceFitIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  raceFitCopy: {
    flex: 1,
    gap: 3,
  },
  syncStatusCard: {
    borderRadius: 12,
    padding: 13,
    marginTop: 10,
    gap: 6,
  },
  syncStatusHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  syncStatusTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  syncStatusBadge: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
  },
  syncStatusText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
  },
  dashboardCard: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  halfDashboardCard: {
    flex: 1,
  },
  dashboardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  dashboardTitle: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  dashboardBadge: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
  },
  dashboardTwoColumn: {
    flexDirection: "row",
    gap: 10,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metricTile: {
    width: (SCREEN_W - 64) / 2,
    borderRadius: 10,
    padding: 11,
    gap: 3,
  },
  metricTileFull: {
    width: "100%",
  },
  metricTileValue: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  metricTileLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  metricTileDetail: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    lineHeight: 14,
  },
  compactMetricList: {
    gap: 8,
  },
  intensityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  intensityLabel: {
    width: 68,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  intensityBarBg: {
    flex: 1,
    height: 7,
    borderRadius: 999,
    overflow: "hidden",
  },
  intensityBarFill: {
    height: 7,
    borderRadius: 999,
  },
  intensityValue: {
    width: 38,
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    textAlign: "right",
  },
  coverageValue: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
  },
  coverageMuted: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  coverageText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  coveragePills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  coveragePill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  scoreGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  scoreCard: {
    width: (SCREEN_W - 42) / 2,
    borderRadius: 12,
    padding: 13,
    gap: 8,
  },
  scoreTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  scoreLabel: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  scoreStatus: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  scoreValue: {
    fontSize: 23,
    fontFamily: "Inter_700Bold",
  },
  scoreMax: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  scoreBarBg: {
    height: 5,
    borderRadius: 999,
    overflow: "hidden",
  },
  scoreBarFill: {
    height: 5,
    borderRadius: 999,
  },
  distanceGrid: {
    flexDirection: "row",
    gap: 8,
  },
  distanceCard: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    gap: 3,
  },
  distanceLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  distanceValue: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  recoveryCard: {
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    gap: 12,
  },
  recoveryTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  recoveryGrid: {
    flexDirection: "row",
    gap: 10,
  },
  recoveryItem: {
    flex: 1,
    gap: 3,
  },
  recoveryValue: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  recoveryLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  insightCard: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    gap: 8,
  },
  insightHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  insightDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  insightTitle: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  insightSummary: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  insightRecommendation: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 20,
  },
  feedbackRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  feedbackButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  feedbackButtonText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  dataStatusCard: {
    borderRadius: 12,
    padding: 14,
    marginTop: 4,
    gap: 7,
  },
  dataStatusTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  dataStatusItem: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
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
