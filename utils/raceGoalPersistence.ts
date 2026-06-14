import AsyncStorage from "@react-native-async-storage/async-storage";

import { RaceGoal } from "@/utils/raceFit";

const RACE_GOALS_KEY = "pace5.race.goals";
const ACTIVE_RACE_GOAL_KEY = "pace5.race.activeGoalId";
const MAX_GOALS = 12;

async function readJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function getRaceGoals(): Promise<RaceGoal[]> {
  return readJson<RaceGoal[]>(RACE_GOALS_KEY, []);
}

export async function getActiveRaceGoal(): Promise<RaceGoal | null> {
  const [goals, activeGoalId] = await Promise.all([
    getRaceGoals(),
    AsyncStorage.getItem(ACTIVE_RACE_GOAL_KEY),
  ]);
  return goals.find((goal) => goal.id === activeGoalId) ?? goals[0] ?? null;
}

export async function saveRaceGoal(goal: RaceGoal): Promise<RaceGoal> {
  const goals = await getRaceGoals();
  const next = [goal, ...goals.filter((item) => item.id !== goal.id)].slice(0, MAX_GOALS);
  await AsyncStorage.multiSet([
    [RACE_GOALS_KEY, JSON.stringify(next)],
    [ACTIVE_RACE_GOAL_KEY, goal.id],
  ]);
  return goal;
}

export async function deleteRaceGoal(goalId: string): Promise<void> {
  const goals = await getRaceGoals();
  const next = goals.filter((goal) => goal.id !== goalId);
  const activeGoalId = await AsyncStorage.getItem(ACTIVE_RACE_GOAL_KEY);
  const writes: [string, string][] = [[RACE_GOALS_KEY, JSON.stringify(next)]];

  if (activeGoalId === goalId) {
    if (next[0]) writes.push([ACTIVE_RACE_GOAL_KEY, next[0].id]);
    else await AsyncStorage.removeItem(ACTIVE_RACE_GOAL_KEY);
  }

  if (writes.length > 0) await AsyncStorage.multiSet(writes);
}

export async function setActiveRaceGoal(goalId: string): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_RACE_GOAL_KEY, goalId);
}

export function createRaceGoalId(): string {
  return `race-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
