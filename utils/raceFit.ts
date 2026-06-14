import { CoachAnalysis } from "@/utils/coachEngine";

export type RaceGoalType = "5k" | "10k" | "21k" | "42k";
export type RacePriority = "complete" | "personalBest" | "firstTime" | "trainingRace";

export interface RaceGoal {
  id: string;
  name: string;
  type: RaceGoalType;
  raceDate: string;
  priority: RacePriority;
  createdAt: string;
  updatedAt: string;
}

export type RaceRecommendationDecision =
  | "recommended"
  | "possibleWithCaution"
  | "notRecommended"
  | "insufficientData";

export interface RaceFitAssessment {
  generatedAt: string;
  goal: RaceGoal;
  fitScore: number;
  decision: RaceRecommendationDecision;
  weeksUntilRace: number;
  readinessScore: number;
  distancePreparednessScore: number;
  loadSafetyScore: number;
  recoveryScore: number;
  consistencyScore: number;
  summary: string;
  recommendation: string;
  reasons: string[];
  risks: string[];
  nextSteps: string[];
}

const DISTANCE_KM: Record<RaceGoalType, number> = {
  "5k": 5,
  "10k": 10,
  "21k": 21.1,
  "42k": 42.2,
};

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function daysUntil(date: string): number {
  const target = new Date(`${date}T12:00:00`);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

function readinessForGoal(analysis: CoachAnalysis, type: RaceGoalType): number {
  if (type === "5k") return analysis.scores.readiness5k;
  if (type === "10k") return analysis.scores.readiness10k;
  if (type === "21k") return analysis.scores.readiness21k;
  return analysis.scores.readiness42k;
}

function priorityPenalty(priority: RacePriority): number {
  if (priority === "personalBest") return 12;
  if (priority === "firstTime") return 6;
  if (priority === "trainingRace") return -4;
  return 0;
}

function distancePreparedness(analysis: CoachAnalysis, type: RaceGoalType): number {
  const targetDistance = DISTANCE_KM[type];
  const longRunRatio = analysis.features.maxLongRunLast90DaysKm / targetDistance;
  const weeklyRatio = analysis.features.avgWeeklyDistanceLast28DaysKm / targetDistance;

  return clamp(longRunRatio * 58 + weeklyRatio * 24 + analysis.features.consistencyIndex * 18);
}

function timingScore(type: RaceGoalType, weeksUntilRace: number): number {
  if (weeksUntilRace < 0) return 0;
  if (weeksUntilRace <= 1) return type === "5k" ? 45 : 25;
  if (weeksUntilRace <= 4) return type === "5k" || type === "10k" ? 70 : 42;
  if (weeksUntilRace <= 12) return type === "42k" ? 68 : 82;
  return 88;
}

function decisionFor(score: number, analysis: CoachAnalysis): RaceRecommendationDecision {
  if (analysis.profile.confidence === "low") return "insufficientData";
  if (score >= 76 && analysis.scores.riskScore < 55) return "recommended";
  if (score >= 54 && analysis.scores.riskScore < 75) return "possibleWithCaution";
  return "notRecommended";
}

function decisionSummary(decision: RaceRecommendationDecision): string {
  if (decision === "recommended") return "Essa prova combina com seu momento atual.";
  if (decision === "possibleWithCaution") return "Essa prova é possível, mas pede ajustes e cautela.";
  if (decision === "notRecommended") return "Essa prova não parece a melhor escolha agora.";
  return "Ainda faltam dados para avaliar essa prova com segurança.";
}

function decisionRecommendation(decision: RaceRecommendationDecision, priority: RacePriority): string {
  if (decision === "recommended" && priority === "personalBest") {
    return "Mantenha progressão controlada e reserve intensidade específica apenas quando a carga estiver estável.";
  }
  if (decision === "recommended") {
    return "Siga com consistência e evite mudanças bruscas nas próximas semanas.";
  }
  if (decision === "possibleWithCaution") {
    return "Trate como objetivo controlado. Reduza ambição se sinais de recuperação ou carga piorarem.";
  }
  if (decision === "notRecommended") {
    return "Escolha uma distância menor, adie a prova ou use como treino leve, sem buscar performance.";
  }
  return "Conecte mais treinos e dados de recuperação antes de tomar uma decisão.";
}

function buildReasons(analysis: CoachAnalysis, type: RaceGoalType, weeksUntilRace: number): string[] {
  const features = analysis.features;
  const reasons = [
    `Readiness para ${type}: ${readinessForGoal(analysis, type)}/100.`,
    `Maior longão recente: ${features.maxLongRunLast90DaysKm.toFixed(1)} km.`,
    `Volume médio: ${features.avgWeeklyDistanceLast28DaysKm.toFixed(1)} km/semana.`,
    `Tempo até a prova: ${Math.max(0, weeksUntilRace)} semana${weeksUntilRace === 1 ? "" : "s"}.`,
  ];

  if (analysis.scores.recoveryScore >= 70) reasons.push("Recuperação disponível em bom nível.");
  if (analysis.scores.consistencyScore >= 70) reasons.push("Consistência recente favorece preparação.");
  return reasons;
}

function buildRisks(analysis: CoachAnalysis, type: RaceGoalType, weeksUntilRace: number): string[] {
  const risks: string[] = [];
  const targetDistance = DISTANCE_KM[type];

  if (analysis.scores.riskScore >= 55) risks.push("Risco de sobrecarga acima do ideal.");
  if (analysis.scores.recoveryScore < 55) risks.push("Recuperação baixa para assumir objetivo agressivo.");
  if (analysis.features.maxLongRunLast90DaysKm < targetDistance * 0.55) {
    risks.push("Longão recente ainda distante da exigência da prova.");
  }
  if (weeksUntilRace < 4 && (type === "21k" || type === "42k")) {
    risks.push("Pouco tempo para construir base com segurança.");
  }
  if (analysis.profile.confidence === "low") risks.push("Histórico insuficiente para uma decisão forte.");
  return risks;
}

function buildNextSteps(analysis: CoachAnalysis, type: RaceGoalType, decision: RaceRecommendationDecision): string[] {
  if (decision === "insufficientData") {
    return [
      "Registre pelo menos 3 corridas recentes.",
      "Conecte frequência cardíaca e sono para melhorar a confiança.",
      "Reavalie a prova depois de mais uma semana de dados.",
    ];
  }

  const nextSteps = [
    analysis.nextBestAction,
    "Mantenha os treinos fáceis realmente fáceis.",
    "Reavalie o Race Fit semanalmente até a prova.",
  ];

  if (type === "21k" || type === "42k") {
    nextSteps.push("Priorize progressão gradual do longão, sem saltos bruscos.");
  }

  if (decision === "notRecommended") {
    nextSteps.unshift("Considere trocar para uma distância menor ou adiar o objetivo.");
  }

  return nextSteps.slice(0, 4);
}

export function assessRaceFit(goal: RaceGoal, analysis: CoachAnalysis): RaceFitAssessment {
  const weeksUntilRace = Math.ceil(daysUntil(goal.raceDate) / 7);
  const readinessScore = readinessForGoal(analysis, goal.type);
  const distanceScore = distancePreparedness(analysis, goal.type);
  const loadSafetyScore = clamp(100 - analysis.scores.riskScore);
  const recoveryScore = analysis.scores.recoveryScore;
  const consistencyScore = analysis.scores.consistencyScore;
  const timeScore = timingScore(goal.type, weeksUntilRace);
  const fitScore = clamp(
    readinessScore * 0.26 +
      distanceScore * 0.24 +
      loadSafetyScore * 0.18 +
      recoveryScore * 0.12 +
      consistencyScore * 0.12 +
      timeScore * 0.08 -
      priorityPenalty(goal.priority)
  );
  const decision = decisionFor(fitScore, analysis);

  return {
    generatedAt: new Date().toISOString(),
    goal,
    fitScore,
    decision,
    weeksUntilRace,
    readinessScore,
    distancePreparednessScore: distanceScore,
    loadSafetyScore,
    recoveryScore,
    consistencyScore,
    summary: decisionSummary(decision),
    recommendation: decisionRecommendation(decision, goal.priority),
    reasons: buildReasons(analysis, goal.type, weeksUntilRace),
    risks: buildRisks(analysis, goal.type, weeksUntilRace),
    nextSteps: buildNextSteps(analysis, goal.type, decision),
  };
}

export function raceGoalTypeLabel(type: RaceGoalType): string {
  const labels: Record<RaceGoalType, string> = {
    "5k": "5 km",
    "10k": "10 km",
    "21k": "21 km",
    "42k": "42 km",
  };
  return labels[type];
}

export function racePriorityLabel(priority: RacePriority): string {
  const labels: Record<RacePriority, string> = {
    complete: "Completar",
    personalBest: "Buscar RP",
    firstTime: "Estreia",
    trainingRace: "Prova treino",
  };
  return labels[priority];
}
