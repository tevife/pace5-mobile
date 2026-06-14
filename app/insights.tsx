import { Stack, router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BoxIcon } from "@/components/BoxIcon";
import { useColors } from "@/hooks/useColors";
import { CoachInsight } from "@/utils/coachEngine";
import { CoachSnapshot, getCoachSnapshots } from "@/utils/coachPersistence";

type ScoreKey =
  | "consistencyScore"
  | "loadScore"
  | "recoveryScore"
  | "progressScore"
  | "riskScore"
  | "aerobicBaseScore";

const SCORE_LABELS: Record<ScoreKey, string> = {
  consistencyScore: "Consistência",
  loadScore: "Carga",
  recoveryScore: "Recuperação",
  progressScore: "Evolução",
  riskScore: "Risco",
  aerobicBaseScore: "Base aeróbica",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function scoreDelta(latest: number, previous?: number): string {
  if (typeof previous !== "number") return "novo";
  const delta = latest - previous;
  if (delta === 0) return "0";
  return `${delta > 0 ? "+" : ""}${delta}`;
}

function severityColor(severity: CoachInsight["severity"], fallback: string, destructive: string): string {
  if (severity === "positive") return "#16a34a";
  if (severity === "attention") return "#d97706";
  if (severity === "warning" || severity === "critical") return destructive;
  return fallback;
}

function TrendCard({
  label,
  value,
  previous,
  inverted,
}: {
  label: string;
  value: number;
  previous?: number;
  inverted?: boolean;
}) {
  const colors = useColors();
  const delta = typeof previous === "number" ? value - previous : 0;
  const improved = inverted ? delta < 0 : delta > 0;
  const accent = delta === 0 ? colors.mutedForeground : improved ? "#16a34a" : colors.destructive;

  return (
    <View style={[styles.trendCard, { backgroundColor: colors.card }]}>
      <View style={styles.trendHeader}>
        <Text style={[styles.trendLabel, { color: colors.mutedForeground }]}>{label}</Text>
        <Text style={[styles.trendDelta, { color: accent }]}>{scoreDelta(value, previous)}</Text>
      </View>
      <Text style={[styles.trendValue, { color: colors.foreground }]}>
        {value}
        <Text style={[styles.trendMax, { color: colors.mutedForeground }]}>/100</Text>
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

function InsightHistoryCard({
  insight,
  generatedAt,
}: {
  insight: CoachInsight;
  generatedAt: string;
}) {
  const colors = useColors();
  const dotColor = severityColor(insight.severity, colors.mutedForeground, colors.destructive);

  return (
    <View style={[styles.insightCard, { backgroundColor: colors.card }]}>
      <View style={styles.insightHeader}>
        <View style={[styles.insightDot, { backgroundColor: dotColor }]} />
        <Text style={[styles.insightTitle, { color: colors.foreground }]}>
          {insight.title}
        </Text>
      </View>
      <Text style={[styles.insightDate, { color: colors.mutedForeground }]}>
        {formatDateTime(generatedAt)}
      </Text>
      <Text style={[styles.insightSummary, { color: colors.mutedForeground }]}>
        {insight.summary}
      </Text>
      <Text style={[styles.insightRecommendation, { color: colors.foreground }]}>
        {insight.recommendation}
      </Text>
    </View>
  );
}

export default function InsightsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [snapshots, setSnapshots] = useState<CoachSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getCoachSnapshots()
      .then((items) =>
        setSnapshots(
          items.sort(
            (a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()
          )
        )
      )
      .finally(() => setIsLoading(false));
  }, []);

  const latest = snapshots[0];
  const previous = snapshots[1];
  const insightHistory = useMemo(
    () =>
      snapshots.flatMap((snapshot) =>
        snapshot.analysis.insights.map((insight) => ({
          insight,
          generatedAt: snapshot.generatedAt,
        }))
      ),
    [snapshots]
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: "Histórico",
          headerShown: true,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.foreground,
          headerShadowVisible: false,
          headerLeft: () => (
            <Pressable onPress={() => router.back()} style={styles.backButton}>
              <BoxIcon name="ChevronLeft" size={26} fill={colors.foreground} pack="basic" />
            </Pressable>
          ),
        }}
      />

      {isLoading ? (
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={{ backgroundColor: colors.background }}
          contentContainerStyle={[
            styles.container,
            { paddingBottom: insets.bottom + 24 },
          ]}
        >
          {!latest ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.card }]}>
              <BoxIcon name="Sparkles" size={34} fill={colors.foreground} pack="basic" />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                Ainda sem histórico
              </Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Abra a tela Apple Health para gerar a primeira análise do Coach.
              </Text>
            </View>
          ) : (
            <>
              <View style={[styles.heroCard, { backgroundColor: colors.foreground }]}>
                <Text style={styles.heroEyebrow}>Última análise</Text>
                <Text style={styles.heroTitle}>
                  {latest.analysis.scores.readiness10k}/100
                </Text>
                <Text style={styles.heroSubtitle}>
                  Readiness 10k • {formatDateTime(latest.generatedAt)}
                </Text>
                <Text style={styles.heroText}>{latest.analysis.nextBestAction}</Text>
              </View>

              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                Evolução dos scores
              </Text>
              <View style={styles.trendGrid}>
                {(Object.keys(SCORE_LABELS) as ScoreKey[]).map((key) => (
                  <TrendCard
                    key={key}
                    label={SCORE_LABELS[key]}
                    value={latest.analysis.scores[key]}
                    previous={previous?.analysis.scores[key]}
                    inverted={key === "riskScore"}
                  />
                ))}
              </View>

              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                Snapshots
              </Text>
              {snapshots.map((snapshot, index) => (
                <View key={snapshot.id} style={[styles.snapshotRow, { backgroundColor: colors.card }]}>
                  <Text style={[styles.snapshotIndex, { color: colors.mutedForeground }]}>
                    #{snapshots.length - index}
                  </Text>
                  <View style={styles.snapshotCopy}>
                    <Text style={[styles.snapshotTitle, { color: colors.foreground }]}>
                      {snapshot.analysis.profile.summary}
                    </Text>
                    <Text style={[styles.snapshotMeta, { color: colors.mutedForeground }]}>
                      {formatDateTime(snapshot.generatedAt)} • {snapshot.analysis.profile.confidence}
                    </Text>
                  </View>
                  <Text style={[styles.snapshotScore, { color: colors.foreground }]}>
                    {snapshot.analysis.scores.readiness10k}
                  </Text>
                </View>
              ))}

              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                Histórico de insights
              </Text>
              {insightHistory.map(({ insight, generatedAt }, index) => (
                <InsightHistoryCard
                  key={`${generatedAt}-${insight.id}-${index}`}
                  insight={insight}
                  generatedAt={generatedAt}
                />
              ))}
            </>
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
  },
  container: {
    paddingHorizontal: 16,
    gap: 10,
  },
  backButton: {
    paddingHorizontal: 8,
  },
  heroCard: {
    borderRadius: 18,
    padding: 18,
    gap: 8,
    marginTop: 10,
  },
  heroEyebrow: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
  },
  heroTitle: {
    color: "#fff",
    fontSize: 38,
    fontFamily: "Inter_700Bold",
  },
  heroSubtitle: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  heroText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 22,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    marginTop: 14,
    marginBottom: 2,
  },
  trendGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  trendCard: {
    width: "48%",
    borderRadius: 12,
    padding: 13,
    gap: 8,
  },
  trendHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  trendLabel: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  trendDelta: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  trendValue: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
  },
  trendMax: {
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
  snapshotRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  snapshotIndex: {
    width: 34,
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  snapshotCopy: {
    flex: 1,
    gap: 3,
  },
  snapshotTitle: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    lineHeight: 18,
  },
  snapshotMeta: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  snapshotScore: {
    width: 34,
    textAlign: "right",
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  insightCard: {
    borderRadius: 12,
    padding: 14,
    gap: 7,
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
  insightDate: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
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
  emptyCard: {
    borderRadius: 14,
    padding: 22,
    alignItems: "center",
    gap: 10,
    marginTop: 18,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 21,
  },
});
