import { fetchCalendarRacesViaWebView, SiteCalendarRace } from "@/utils/webViewBridge";
import {
  RaceGoal,
  RaceGoalType,
  RacePriority,
} from "@/utils/raceFit";
import { createRaceGoalId } from "@/utils/raceGoalPersistence";

function raceTypeFromDistance(distanceKm?: number): RaceGoalType {
  if (!distanceKm) return "10k";
  if (distanceKm <= 6) return "5k";
  if (distanceKm <= 15) return "10k";
  if (distanceKm <= 30) return "21k";
  return "42k";
}

function priorityFromTitle(title: string): RacePriority {
  if (/rp|recorde|personal best|pb/i.test(title)) return "personalBest";
  if (/estreia|primeira|first/i.test(title)) return "firstTime";
  if (/treino|training/i.test(title)) return "trainingRace";
  return "complete";
}

function normalizeRaceDate(value?: string): string | null {
  if (!value) return null;
  const iso = value.match(/20\d{2}-\d{2}-\d{2}/);
  if (iso) return iso[0];

  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function isUpcoming(date: string): boolean {
  const target = new Date(`${date}T12:00:00`);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  return target.getTime() >= today.getTime();
}

function normalizeSiteRace(race: SiteCalendarRace): RaceGoal | null {
  const title = race.title ?? race.name ?? "Prova Pace5";
  const date = normalizeRaceDate(race.date ?? race.startDate);
  if (!date || !isUpcoming(date)) return null;

  const distance =
    typeof race.distanceKm === "number"
      ? race.distanceKm
      : typeof race.distance === "number"
        ? race.distance
        : undefined;
  const now = new Date().toISOString();

  return {
    id: createRaceGoalId(),
    name: title.slice(0, 80),
    type: raceTypeFromDistance(distance),
    raceDate: date,
    priority: priorityFromTitle(title),
    createdAt: now,
    updatedAt: now,
  };
}

export async function fetchUpcomingRaceGoalsFromSite(): Promise<RaceGoal[]> {
  const races = await fetchCalendarRacesViaWebView();
  const goals = races
    .map(normalizeSiteRace)
    .filter((goal): goal is RaceGoal => goal !== null)
    .sort((a, b) => a.raceDate.localeCompare(b.raceDate));

  return goals;
}
