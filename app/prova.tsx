import { Stack, router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BoxIcon } from "@/components/BoxIcon";
import { useHealth } from "@/contexts/HealthContext";
import { useColors } from "@/hooks/useColors";
import { buildCoachAnalysis } from "@/utils/coachEngine";
import {
  createRaceGoalId,
  getActiveRaceGoal,
  getRaceGoals,
  saveRaceGoal,
  setActiveRaceGoal,
} from "@/utils/raceGoalPersistence";
import { fetchUpcomingRaceGoalsFromSite } from "@/utils/siteCalendar";
import {
  RaceFitAssessment,
  RaceGoal,
  RaceGoalType,
  RacePriority,
  assessRaceFit,
  raceGoalTypeLabel,
  racePriorityLabel,
} from "@/utils/raceFit";

const DISTANCES: RaceGoalType[] = ["5k", "10k", "21k", "42k"];
const PRIORITIES: RacePriority[] = ["complete", "personalBest", "firstTime", "trainingRace"];

function defaultRaceDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 56);
  return date.toISOString().slice(0, 10);
}

function decisionLabel(decision: RaceFitAssessment["decision"]): string {
  if (decision === "recommended") return "Recomendada";
  if (decision === "possibleWithCaution") return "Possível com cautela";
  if (decision === "notRecommended") return "Não recomendada";
  return "Dados insuficientes";
}

function decisionColor(decision: RaceFitAssessment["decision"], fallback: string): string {
  if (decision === "recommended") return "#16a34a";
  if (decision === "possibleWithCaution") return "#d97706";
  if (decision === "notRecommended") return "#ef4444";
  return fallback;
}

function formatRaceDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function isUpcomingRace(goal: RaceGoal): boolean {
  const target = new Date(`${goal.raceDate}T12:00:00`);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  return target.getTime() >= today.getTime();
}

function ScoreRow({ label, value }: { label: string; value: number }) {
  const colors = useColors();
  return (
    <View style={styles.scoreRow}>
      <Text style={[styles.scoreRowLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <View style={[styles.scoreRowBarBg, { backgroundColor: colors.border }]}>
        <View
          style={[
            styles.scoreRowBarFill,
            { width: `${value}%` as any, backgroundColor: colors.foreground },
          ]}
        />
      </View>
      <Text style={[styles.scoreRowValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

export default function ProvaScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { workouts, dailySummaries } = useHealth();
  const [goalId, setGoalId] = useState<string | null>(null);
  const [name, setName] = useState("Minha próxima prova");
  const [type, setType] = useState<RaceGoalType>("10k");
  const [priority, setPriority] = useState<RacePriority>("complete");
  const [raceDate, setRaceDate] = useState(defaultRaceDate());
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [raceGoals, setRaceGoals] = useState<RaceGoal[]>([]);

  const refreshRaceGoals = async () => {
    const goals = await getRaceGoals();
    setRaceGoals(
      goals.filter(isUpcomingRace).sort((a, b) => a.raceDate.localeCompare(b.raceDate))
    );
  };

  const analysis = useMemo(
    () => buildCoachAnalysis(workouts, dailySummaries),
    [workouts, dailySummaries]
  );
  const draftGoal = useMemo<RaceGoal>(
    () => ({
      id: goalId ?? "draft",
      name: name.trim() || "Minha próxima prova",
      type,
      priority,
      raceDate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    [goalId, name, priority, raceDate, type]
  );
  const assessment = useMemo(
    () => assessRaceFit(draftGoal, analysis),
    [analysis, draftGoal]
  );
  const accent = decisionColor(assessment.decision, colors.mutedForeground);

  useEffect(() => {
    Promise.all([getActiveRaceGoal(), getRaceGoals()])
      .then(([goal, goals]) => {
        setRaceGoals(
          goals.filter(isUpcomingRace).sort((a, b) => a.raceDate.localeCompare(b.raceDate))
        );
        if (!goal) return;
        setGoalId(goal.id);
        setName(goal.name);
        setType(goal.type);
        setPriority(goal.priority);
        setRaceDate(goal.raceDate);
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raceDate)) {
      Alert.alert("Data inválida", "Use o formato AAAA-MM-DD.");
      return;
    }

    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      await saveRaceGoal({
        ...draftGoal,
        id: goalId ?? createRaceGoalId(),
        createdAt: goalId ? draftGoal.createdAt : now,
        updatedAt: now,
      });
      await refreshRaceGoals();
      Alert.alert("Prova salva", "O Race Fit foi atualizado para essa prova.");
    } finally {
      setIsSaving(false);
    }
  };

  const applyGoalToForm = (goal: RaceGoal) => {
    setGoalId(goal.id);
    setName(goal.name);
    setType(goal.type);
    setPriority(goal.priority);
    setRaceDate(goal.raceDate);
  };

  const handleSelectGoal = async (goal: RaceGoal) => {
    applyGoalToForm(goal);
    await setActiveRaceGoal(goal.id);
  };

  const handleImportFromSite = async () => {
    setIsImporting(true);
    try {
      const goals = await fetchUpcomingRaceGoalsFromSite();
      if (goals.length === 0) {
        Alert.alert(
          "Nenhuma prova encontrada",
          "Abra a aba Calendário, confirme que você está logado e tente importar novamente."
        );
        return;
      }

      for (const goal of goals) {
        await saveRaceGoal(goal);
      }
      await refreshRaceGoals();
      applyGoalToForm(goals[0]);
      Alert.alert(
        "Calendário importado",
        `${goals.length} prova${goals.length === 1 ? "" : "s"} encontrada${goals.length === 1 ? "" : "s"}. Você pode escolher qualquer uma na lista.`
      );
    } catch (error) {
      Alert.alert(
        "Não consegui ler o calendário",
        error instanceof Error ? error.message : "Abra a aba Calendário e tente novamente."
      );
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "Prova",
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
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={[
          styles.container,
          { paddingBottom: insets.bottom + 24 },
        ]}
      >
        <View style={[styles.heroCard, { backgroundColor: colors.foreground }]}>
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.heroEyebrow}>Race Fit</Text>
              <Text style={styles.heroTitle}>{assessment.fitScore}/100</Text>
            </View>
            <View style={[styles.decisionBadge, { backgroundColor: accent }]}>
              <Text style={styles.decisionBadgeText}>{decisionLabel(assessment.decision)}</Text>
            </View>
          </View>
          <Text style={styles.heroSummary}>{assessment.summary}</Text>
          <Text style={styles.heroRecommendation}>{assessment.recommendation}</Text>
        </View>

        {raceGoals.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                Próximas provas
              </Text>
              <Text style={[styles.sectionCount, { color: colors.mutedForeground }]}>
                {raceGoals.length}
              </Text>
            </View>
            {raceGoals.map((goal) => {
              const selected = goal.id === goalId;
              const goalAssessment = assessRaceFit(goal, analysis);
              const goalAccent = decisionColor(goalAssessment.decision, colors.mutedForeground);
              return (
                <TouchableOpacity
                  key={goal.id}
                  style={[
                    styles.raceGoalRow,
                    {
                      borderColor: selected ? colors.foreground : colors.border,
                      backgroundColor: selected ? colors.background : "transparent",
                    },
                  ]}
                  onPress={() => handleSelectGoal(goal)}
                  activeOpacity={0.85}
                >
                  <View style={styles.raceGoalMain}>
                    <Text style={[styles.raceGoalName, { color: colors.foreground }]}>
                      {goal.name}
                    </Text>
                    <Text style={[styles.raceGoalMeta, { color: colors.mutedForeground }]}>
                      {formatRaceDate(goal.raceDate)} • {raceGoalTypeLabel(goal.type)} • {racePriorityLabel(goal.priority)}
                    </Text>
                  </View>
                  <View style={[styles.raceGoalScore, { backgroundColor: goalAccent }]}>
                    <Text style={styles.raceGoalScoreText}>{goalAssessment.fitScore}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View style={[styles.formCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Prova-alvo</Text>
          <TouchableOpacity
            style={[
              styles.importButton,
              { borderColor: colors.border, backgroundColor: colors.background, opacity: isImporting ? 0.7 : 1 },
            ]}
            onPress={handleImportFromSite}
            disabled={isImporting}
            activeOpacity={0.85}
          >
            <BoxIcon name="Calendar" size={18} fill={colors.foreground} pack="basic" />
            <Text style={[styles.importButtonText, { color: colors.foreground }]}>
              {isImporting ? "Importando calendário..." : "Importar do calendário Pace5"}
            </Text>
          </TouchableOpacity>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Nome da prova"
            placeholderTextColor={colors.mutedForeground}
            style={[
              styles.input,
              { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background },
            ]}
          />
          <TextInput
            value={raceDate}
            onChangeText={setRaceDate}
            placeholder="AAAA-MM-DD"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            style={[
              styles.input,
              { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background },
            ]}
          />

          <Text style={[styles.controlLabel, { color: colors.mutedForeground }]}>Distância</Text>
          <View style={styles.segmentRow}>
            {DISTANCES.map((distance) => {
              const selected = type === distance;
              return (
                <TouchableOpacity
                  key={distance}
                  style={[
                    styles.segmentButton,
                    {
                      backgroundColor: selected ? colors.foreground : colors.background,
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={() => setType(distance)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.segmentButtonText,
                      { color: selected ? "#fff" : colors.foreground },
                    ]}
                  >
                    {raceGoalTypeLabel(distance)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.controlLabel, { color: colors.mutedForeground }]}>Objetivo</Text>
          <View style={styles.priorityGrid}>
            {PRIORITIES.map((item) => {
              const selected = priority === item;
              return (
                <TouchableOpacity
                  key={item}
                  style={[
                    styles.priorityButton,
                    {
                      backgroundColor: selected ? colors.foreground : colors.background,
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={() => setPriority(item)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.priorityButtonText,
                      { color: selected ? "#fff" : colors.foreground },
                    ]}
                  >
                    {racePriorityLabel(item)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: colors.foreground, opacity: isSaving ? 0.7 : 1 }]}
            onPress={handleSave}
            disabled={isSaving}
            activeOpacity={0.85}
          >
            <Text style={styles.saveButtonText}>{isSaving ? "Salvando..." : "Salvar prova"}</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Componentes do fit</Text>
          <ScoreRow label="Readiness" value={assessment.readinessScore} />
          <ScoreRow label="Distância" value={assessment.distancePreparednessScore} />
          <ScoreRow label="Carga segura" value={assessment.loadSafetyScore} />
          <ScoreRow label="Recuperação" value={assessment.recoveryScore} />
          <ScoreRow label="Consistência" value={assessment.consistencyScore} />
        </View>

        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Por que</Text>
          {assessment.reasons.map((reason) => (
            <Text key={reason} style={[styles.listItem, { color: colors.mutedForeground }]}>
              • {reason}
            </Text>
          ))}
        </View>

        {assessment.risks.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Riscos</Text>
            {assessment.risks.map((risk) => (
              <Text key={risk} style={[styles.listItem, { color: colors.mutedForeground }]}>
                • {risk}
              </Text>
            ))}
          </View>
        )}

        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Próximos passos</Text>
          {assessment.nextSteps.map((step) => (
            <Text key={step} style={[styles.listItem, { color: colors.mutedForeground }]}>
              • {step}
            </Text>
          ))}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    gap: 12,
  },
  backButton: {
    paddingHorizontal: 8,
  },
  heroCard: {
    borderRadius: 18,
    padding: 18,
    gap: 14,
    marginTop: 10,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  heroEyebrow: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
  },
  heroTitle: {
    color: "#fff",
    fontSize: 38,
    fontFamily: "Inter_700Bold",
  },
  decisionBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  decisionBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase",
  },
  heroSummary: {
    color: "#fff",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    lineHeight: 23,
  },
  heroRecommendation: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
  },
  formCard: {
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  card: {
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  sectionCount: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  raceGoalRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  raceGoalMain: {
    flex: 1,
    gap: 3,
  },
  raceGoalName: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  raceGoalMeta: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },
  raceGoalScore: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  raceGoalScoreText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  importButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
  },
  importButtonText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  controlLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    marginTop: 4,
  },
  segmentRow: {
    flexDirection: "row",
    gap: 8,
  },
  segmentButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  segmentButtonText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  priorityGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  priorityButton: {
    width: "48%",
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  priorityButtonText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  saveButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  scoreRowLabel: {
    width: 88,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  scoreRowBarBg: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    overflow: "hidden",
  },
  scoreRowBarFill: {
    height: 6,
    borderRadius: 999,
  },
  scoreRowValue: {
    width: 34,
    textAlign: "right",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  listItem: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
});
