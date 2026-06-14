import { DailySummary, WorkoutSample } from "@/contexts/HealthContext";

export type RunnerLevel =
  | "insufficientData"
  | "beginner"
  | "beginnerConsistent"
  | "recreational"
  | "intermediate"
  | "performanceAmateur"
  | "advanced"
  | "competitive";

export type RunnerPattern =
  | "buildingBase"
  | "improving"
  | "plateau"
  | "overloaded"
  | "returningFromBreak"
  | "inconsistent"
  | "raceReady"
  | "recoveryNeeded"
  | "insufficientData";

export type InsightSeverity = "positive" | "neutral" | "attention" | "warning" | "critical";

export type CoachInsightType =
  | "weeklyReview"
  | "loadWarning"
  | "recoveryWarning"
  | "progressDetected"
  | "plateauDetected"
  | "raceReadiness"
  | "injuryRisk"
  | "consistency"
  | "nextWorkout";

export interface RunnerFeatures {
  last7DaysDistanceKm: number;
  last28DaysDistanceKm: number;
  last90DaysDistanceKm: number;
  avgWeeklyDistanceLast28DaysKm: number;
  avgWeeklyRunsLast28Days: number;
  maxLongRunLast90DaysKm: number;
  acuteLoad: number;
  chronicLoad: number;
  acuteChronicRatio: number;
  weeklyVolumeChangeRatio: number;
  easyIntensityRatio: number;
  moderateIntensityRatio: number;
  hardIntensityRatio: number;
  avgSleepMinutesLast7Days?: number;
  avgRestingHeartRateLast7Days?: number;
  avgHRVLast7Days?: number;
  paceTrendLast28Days?: number;
  heartRateEfficiencyTrend?: number;
  consistencyIndex: number;
  activeWeeksLast28Days: number;
  totalRunsLast28Days: number;
}

export interface RunnerProfile {
  level: RunnerLevel;
  primaryPattern: RunnerPattern;
  weeklyFrequency: number;
  avgWeeklyDistanceKm: number;
  maxRecentLongRunKm: number;
  summary: string;
  confidence: "low" | "medium" | "high";
}

export interface RunnerScores {
  consistencyScore: number;
  loadScore: number;
  recoveryScore: number;
  progressScore: number;
  riskScore: number;
  aerobicBaseScore: number;
  speedPotentialScore: number;
  readiness5k: number;
  readiness10k: number;
  readiness21k: number;
  readiness42k: number;
}

export interface CoachInsight {
  id: string;
  type: CoachInsightType;
  severity: InsightSeverity;
  title: string;
  summary: string;
  explanation: string;
  recommendation: string;
  nextBestAction: string;
  confidence: number;
}

export interface CoachAnalysis {
  generatedAt: string;
  features: RunnerFeatures;
  profile: RunnerProfile;
  scores: RunnerScores;
  insights: CoachInsight[];
  nextBestAction: string;
  availableData: string[];
  missingData: string[];
}

const DAY_MS = 86_400_000;

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
}

function isAfter(iso: string, date: Date): boolean {
  return new Date(iso).getTime() >= date.getTime();
}

function runsSince(workouts: WorkoutSample[], days: number): WorkoutSample[] {
  const start = daysAgo(days);
  return workouts.filter((workout) => isAfter(workout.startDate, start));
}

function distanceKm(workouts: WorkoutSample[]): number {
  return workouts.reduce((acc, workout) => acc + workout.distance / 1000, 0);
}

function workoutLoad(workout: WorkoutSample, avgPaceSecPerKm?: number): number {
  const durationMinutes = workout.duration / 60;
  const pace = workout.distance > 0 ? workout.duration / (workout.distance / 1000) : undefined;
  const intensityFactor =
    workout.averageHeartRate && workout.averageHeartRate >= 170
      ? 2.5
      : workout.averageHeartRate && workout.averageHeartRate >= 155
        ? 2
        : workout.averageHeartRate && workout.averageHeartRate >= 140
          ? 1.5
          : pace && avgPaceSecPerKm && pace < avgPaceSecPerKm * 0.92
            ? 2
            : pace && avgPaceSecPerKm && pace < avgPaceSecPerKm * 1.04
              ? 1.5
              : 1;

  return durationMinutes * intensityFactor;
}

function average(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function averageDefined(values: Array<number | undefined>): number | undefined {
  return average(values.filter((value): value is number => typeof value === "number"));
}

function weekKey(iso: string): string {
  const date = new Date(iso);
  const firstDay = new Date(date);
  firstDay.setDate(date.getDate() - date.getDay());
  return firstDay.toISOString().slice(0, 10);
}

function activeWeeks(workouts: WorkoutSample[]): number {
  return new Set(workouts.map((workout) => weekKey(workout.startDate))).size;
}

function classifyIntensity(workout: WorkoutSample, avgPaceSecPerKm?: number): "easy" | "moderate" | "hard" {
  const pace = workout.distance > 0 ? workout.duration / (workout.distance / 1000) : undefined;

  if (workout.averageHeartRate) {
    if (workout.averageHeartRate >= 155) return "hard";
    if (workout.averageHeartRate >= 140) return "moderate";
    return "easy";
  }

  if (pace && avgPaceSecPerKm) {
    if (pace < avgPaceSecPerKm * 0.92) return "hard";
    if (pace < avgPaceSecPerKm * 1.08) return "moderate";
  }

  return "easy";
}

function paceTrend(workouts: WorkoutSample[]): number | undefined {
  const validRuns = workouts
    .filter((workout) => workout.distance >= 1500 && workout.duration > 0)
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  if (validRuns.length < 4) return undefined;

  const midpoint = Math.floor(validRuns.length / 2);
  const first = validRuns.slice(0, midpoint);
  const second = validRuns.slice(midpoint);
  const firstPace = average(first.map((workout) => workout.duration / (workout.distance / 1000)));
  const secondPace = average(second.map((workout) => workout.duration / (workout.distance / 1000)));
  if (!firstPace || !secondPace) return undefined;

  return (firstPace - secondPace) / firstPace;
}

export function buildRunnerFeatures(
  workouts: WorkoutSample[],
  dailySummaries: DailySummary[]
): RunnerFeatures {
  const last7 = runsSince(workouts, 7);
  const last14 = runsSince(workouts, 14);
  const previous7 = last14.filter((workout) => !isAfter(workout.startDate, daysAgo(7)));
  const last28 = runsSince(workouts, 28);
  const last90 = runsSince(workouts, 90);
  const validPaces = last28
    .filter((workout) => workout.distance >= 1000 && workout.duration > 0)
    .map((workout) => workout.duration / (workout.distance / 1000));
  const avgPaceSecPerKm = average(validPaces);
  const acuteLoad = last7.reduce((acc, workout) => acc + workoutLoad(workout, avgPaceSecPerKm), 0);
  const chronicLoad = last28.reduce((acc, workout) => acc + workoutLoad(workout, avgPaceSecPerKm), 0) / 4;
  const intensityCounts = last28.reduce(
    (acc, workout) => {
      acc[classifyIntensity(workout, avgPaceSecPerKm)] += 1;
      return acc;
    },
    { easy: 0, moderate: 0, hard: 0 }
  );
  const intensityTotal = Math.max(1, last28.length);
  const last7Distance = distanceKm(last7);
  const previous7Distance = distanceKm(previous7);
  const activeWeekCount = activeWeeks(last28);
  const last7DailySummaries = dailySummaries.slice(0, 7);
  const avgSleepMinutesLast7Days = averageDefined(
    last7DailySummaries.map((day) => day.sleepDurationMinutes)
  );
  const avgRestingHeartRateLast7Days = averageDefined(
    last7DailySummaries.map((day) => day.restingHeartRate)
  );
  const avgHRVLast7Days = averageDefined(
    last7DailySummaries.map((day) => day.heartRateVariability)
  );

  return {
    last7DaysDistanceKm: last7Distance,
    last28DaysDistanceKm: distanceKm(last28),
    last90DaysDistanceKm: distanceKm(last90),
    avgWeeklyDistanceLast28DaysKm: distanceKm(last28) / 4,
    avgWeeklyRunsLast28Days: last28.length / 4,
    maxLongRunLast90DaysKm: Math.max(0, ...last90.map((workout) => workout.distance / 1000)),
    acuteLoad,
    chronicLoad,
    acuteChronicRatio: chronicLoad > 0 ? acuteLoad / chronicLoad : 0,
    weeklyVolumeChangeRatio: previous7Distance > 0 ? (last7Distance - previous7Distance) / previous7Distance : 0,
    easyIntensityRatio: intensityCounts.easy / intensityTotal,
    moderateIntensityRatio: intensityCounts.moderate / intensityTotal,
    hardIntensityRatio: intensityCounts.hard / intensityTotal,
    avgSleepMinutesLast7Days,
    avgRestingHeartRateLast7Days,
    avgHRVLast7Days,
    paceTrendLast28Days: paceTrend(last28),
    consistencyIndex: activeWeekCount / 4,
    activeWeeksLast28Days: activeWeekCount,
    totalRunsLast28Days: last28.length,
  };
}

export function buildRunnerProfile(features: RunnerFeatures, workouts: WorkoutSample[]): RunnerProfile {
  const hasEnoughData = workouts.length >= 3 && features.totalRunsLast28Days >= 3;
  const weeklyFrequency = features.avgWeeklyRunsLast28Days;
  const weeklyDistance = features.avgWeeklyDistanceLast28DaysKm;
  const longRun = features.maxLongRunLast90DaysKm;

  if (!hasEnoughData) {
    return {
      level: "insufficientData",
      primaryPattern: "insufficientData",
      weeklyFrequency,
      avgWeeklyDistanceKm: weeklyDistance,
      maxRecentLongRunKm: longRun,
      confidence: "low",
      summary: "Ainda temos poucos treinos para classificar seu momento com segurança.",
    };
  }

  let level: RunnerLevel = "beginner";
  if (weeklyFrequency >= 5 && weeklyDistance >= 60 && longRun >= 24) level = "advanced";
  else if (weeklyFrequency >= 4 && weeklyDistance >= 40) level = "performanceAmateur";
  else if (weeklyFrequency >= 3 && weeklyDistance >= 25 && longRun >= 12) level = "intermediate";
  else if (weeklyFrequency >= 3 && weeklyDistance >= 15 && longRun >= 8) level = "recreational";
  else if (weeklyFrequency >= 2 && weeklyDistance >= 8 && longRun >= 5) level = "beginnerConsistent";

  const primaryPattern: RunnerPattern =
    features.acuteChronicRatio > 1.5 || features.weeklyVolumeChangeRatio > 0.45
      ? "overloaded"
      : features.consistencyIndex < 0.5
        ? "inconsistent"
        : features.paceTrendLast28Days && features.paceTrendLast28Days > 0.03
          ? "improving"
          : features.acuteChronicRatio < 0.75 && features.chronicLoad > 0
            ? "recoveryNeeded"
            : "buildingBase";

  return {
    level,
    primaryPattern,
    weeklyFrequency,
    avgWeeklyDistanceKm: weeklyDistance,
    maxRecentLongRunKm: longRun,
    confidence: workouts.length >= 8 ? "high" : "medium",
    summary: profileSummary(level, primaryPattern),
  };
}

function profileSummary(level: RunnerLevel, pattern: RunnerPattern): string {
  if (level === "insufficientData") return "Dados iniciais: conecte mais treinos para melhorar a análise.";
  if (pattern === "overloaded") return "Você tem base, mas a carga recente pede atenção.";
  if (pattern === "improving") return "Seu histórico recente mostra sinais de evolução.";
  if (pattern === "inconsistent") return "Seu principal limitador agora é manter regularidade.";
  if (level === "recreational") return "Você está em uma fase recreativa consistente.";
  if (level === "intermediate") return "Você já sustenta uma rotina intermediária de corrida.";
  return "Você está construindo base para evoluir com mais segurança.";
}

export function buildRunnerScores(features: RunnerFeatures, profile: RunnerProfile): RunnerScores {
  const consistencyScore = clamp(
    features.avgWeeklyRunsLast28Days * 18 +
      features.consistencyIndex * 35 +
      (features.activeWeeksLast28Days >= 4 ? 10 : 0)
  );
  const ratio = features.acuteChronicRatio;
  const loadScore = clamp(ratio === 0 ? 25 : 100 - Math.abs(1.05 - ratio) * 90);
  const sleepComponent =
    typeof features.avgSleepMinutesLast7Days === "number"
      ? clamp((features.avgSleepMinutesLast7Days / 480) * 100)
      : undefined;
  const hrvComponent =
    typeof features.avgHRVLast7Days === "number"
      ? clamp((features.avgHRVLast7Days / 65) * 100)
      : undefined;
  const restingHrComponent =
    typeof features.avgRestingHeartRateLast7Days === "number"
      ? clamp(100 - Math.max(0, features.avgRestingHeartRateLast7Days - 48) * 2.4)
      : undefined;
  const recoverySignals = [sleepComponent, hrvComponent, restingHrComponent].filter(
    (value): value is number => typeof value === "number"
  );
  const recoverySignalScore = average(recoverySignals) ?? 78;
  const recoveryScore = clamp(
    recoverySignalScore -
      Math.max(0, ratio - 1.15) * 35 -
      Math.max(0, features.hardIntensityRatio - 0.35) * 55
  );
  const progressScore = clamp(50 + (features.paceTrendLast28Days ?? 0) * 500 + features.consistencyIndex * 20);
  const riskScore = clamp(
    Math.max(0, ratio - 1) * 55 +
      Math.max(0, features.weeklyVolumeChangeRatio) * 60 +
      Math.max(0, features.hardIntensityRatio - 0.35) * 80
  );
  const aerobicBaseScore = clamp(features.avgWeeklyDistanceLast28DaysKm * 2.2 + features.maxLongRunLast90DaysKm * 2.6);
  const speedPotentialScore = clamp(45 + (features.paceTrendLast28Days ?? 0) * 450 + features.hardIntensityRatio * 35);
  const readinessBase = clamp(
    consistencyScore * 0.25 +
      loadScore * 0.2 +
      progressScore * 0.15 +
      recoveryScore * 0.15 +
      aerobicBaseScore * 0.15 +
      (100 - riskScore) * 0.1
  );

  return {
    consistencyScore,
    loadScore,
    recoveryScore,
    progressScore,
    riskScore,
    aerobicBaseScore,
    speedPotentialScore,
    readiness5k: profile.level === "insufficientData" ? clamp(readinessBase * 0.55) : readinessBase,
    readiness10k: clamp(readinessBase + Math.min(15, features.maxLongRunLast90DaysKm - 8) * 2),
    readiness21k: clamp(readinessBase - 18 + Math.min(20, features.maxLongRunLast90DaysKm - 12) * 2),
    readiness42k: clamp(readinessBase - 42 + Math.min(25, features.maxLongRunLast90DaysKm - 24) * 1.5),
  };
}

function insight(
  type: CoachInsightType,
  severity: InsightSeverity,
  title: string,
  summary: string,
  recommendation: string,
  nextBestAction: string,
  confidence: number
): CoachInsight {
  return {
    id: `${type}-${severity}`,
    type,
    severity,
    title,
    summary,
    explanation: summary,
    recommendation,
    nextBestAction,
    confidence,
  };
}

export function buildCoachInsights(
  features: RunnerFeatures,
  profile: RunnerProfile,
  scores: RunnerScores
): CoachInsight[] {
  const insights: CoachInsight[] = [];
  const confidence = profile.confidence === "high" ? 0.86 : profile.confidence === "medium" ? 0.68 : 0.42;

  if (profile.level === "insufficientData") {
    insights.push(
      insight(
        "weeklyReview",
        "attention",
        "Análise inicial",
        "Ainda não há histórico suficiente para uma leitura completa do seu momento.",
        "Continue registrando treinos e mantenha uma rotina simples por mais algumas semanas.",
        "Faça de 2 a 3 treinos leves nesta semana e volte após novos registros.",
        confidence
      )
    );
    return insights;
  }

  if (scores.riskScore >= 65) {
    insights.push(
      insight(
        "injuryRisk",
        "warning",
        "Sinais de possível sobrecarga",
        "Sua carga recente subiu rápido em relação à base das últimas semanas.",
        "Evite aumentar intensidade agora. Esta análise não substitui acompanhamento médico ou profissional.",
        "Priorize 48 horas de recuperação ou treinos leves.",
        confidence
      )
    );
  }

  if (features.moderateIntensityRatio >= 0.55) {
    insights.push(
      insight(
        "loadWarning",
        "attention",
        "Muito treino no meio-termo",
        "Boa parte dos treinos parece moderada: forte demais para recuperar e leve demais para gerar performance específica.",
        "Separe melhor dias fáceis e dias de qualidade.",
        "Faça o próximo treino realmente leve.",
        confidence
      )
    );
  }

  if (scores.recoveryScore < 55) {
    insights.push(
      insight(
        "recoveryWarning",
        "attention",
        "Recuperação pede atenção",
        "Seus indicadores disponíveis de recuperação e carga sugerem cautela para novo estímulo forte.",
        "Priorize treino leve, sono e controle de esforço. Esta análise não substitui acompanhamento médico.",
        "Evite intensidade alta no próximo treino.",
        confidence
      )
    );
  }

  if ((features.paceTrendLast28Days ?? 0) > 0.03) {
    insights.push(
      insight(
        "progressDetected",
        "positive",
        "Evolução detectada",
        "Seu pace médio melhorou em treinos recentes comparáveis.",
        "Mantenha a progressão sem aumentar volume e intensidade ao mesmo tempo.",
        "Repita uma semana consistente antes de buscar novo estímulo forte.",
        confidence
      )
    );
  }

  if (scores.consistencyScore < 55) {
    insights.push(
      insight(
        "consistency",
        "attention",
        "Consistência limita sua evolução",
        "Seu histórico recente tem lacunas ou baixa frequência semanal.",
        "Antes de buscar performance, consolide uma rotina sustentável.",
        "Defina dois dias fixos para correr nesta semana.",
        confidence
      )
    );
  }

  if (insights.length === 0) {
    insights.push(
      insight(
        "nextWorkout",
        "neutral",
        "Carga produtiva",
        "Seu volume recente parece compatível com sua base atual.",
        "Mantenha a regularidade e evite mudanças bruscas.",
        "Faça o próximo treino em intensidade leve a moderada.",
        confidence
      )
    );
  }

  return insights.slice(0, 4);
}

export function buildCoachAnalysis(
  workouts: WorkoutSample[],
  dailySummaries: DailySummary[]
): CoachAnalysis {
  const features = buildRunnerFeatures(workouts, dailySummaries);
  const profile = buildRunnerProfile(features, workouts);
  const scores = buildRunnerScores(features, profile);
  const insights = buildCoachInsights(features, profile, scores);
  const hasHeartRate = workouts.some((workout) => typeof workout.averageHeartRate === "number");

  return {
    generatedAt: new Date().toISOString(),
    features,
    profile,
    scores,
    insights,
    nextBestAction: insights[0]?.nextBestAction ?? "Conecte seus dados e registre mais treinos.",
    availableData: [
      workouts.length > 0 ? "Treinos de corrida" : "",
      dailySummaries.some((day) => day.steps > 0) ? "Passos" : "",
      dailySummaries.some((day) => day.calories > 0) ? "Calorias ativas" : "",
      hasHeartRate ? "Frequência cardíaca" : "",
      dailySummaries.some((day) => day.sleepDurationMinutes) ? "Sono" : "",
      dailySummaries.some((day) => day.heartRateVariability) ? "HRV" : "",
      dailySummaries.some((day) => day.restingHeartRate) ? "FC de repouso" : "",
      dailySummaries.some((day) => day.vo2Max) ? "VO2 máximo" : "",
    ].filter(Boolean),
    missingData: [
      workouts.length < 3 ? "Mais treinos para classificar seu perfil" : "",
      !hasHeartRate ? "Frequência cardíaca para melhorar intensidade" : "",
      !dailySummaries.some((day) => day.sleepDurationMinutes) ? "Sono para recuperação avançada" : "",
      !dailySummaries.some((day) => day.heartRateVariability) ? "HRV para prontidão" : "",
      !dailySummaries.some((day) => day.restingHeartRate) ? "FC de repouso para recuperação" : "",
      !dailySummaries.some((day) => day.vo2Max) ? "VO2 máximo para base aeróbica" : "",
      "Calendário de provas para Race Fit",
    ].filter(Boolean),
  };
}

export function runnerLevelLabel(level: RunnerLevel): string {
  const labels: Record<RunnerLevel, string> = {
    insufficientData: "Dados insuficientes",
    beginner: "Iniciante",
    beginnerConsistent: "Iniciante consistente",
    recreational: "Recreativo",
    intermediate: "Intermediário",
    performanceAmateur: "Performance amadora",
    advanced: "Avançado",
    competitive: "Competitivo",
  };
  return labels[level];
}

export function riskLabel(score: number): string {
  if (score >= 76) return "Alto";
  if (score >= 51) return "Moderado";
  if (score >= 26) return "Atenção";
  return "Baixo";
}
