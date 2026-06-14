# Pace5 Coach Sync API

This local server contract mirrors the mobile sync payload used by the HealthKit integration.

## POST `/api/health/sync`

Receives a full Coach sync snapshot:

```json
{
  "clientGeneratedAt": "2026-05-20T12:00:00.000Z",
  "schemaVersion": 1,
  "workouts": [],
  "dailyMetrics": [],
  "coachAnalysis": {},
  "feedback": []
}
```

The server deduplicates:

- Workouts by `sourceId`
- Daily metrics by `date`
- Feedback by `id`
- Analyses by `generatedAt`

Response:

```json
{
  "message": "Dados sincronizados com o Coach Engine.",
  "synced": 4,
  "totals": {
    "workouts": 1,
    "dailyMetrics": 1,
    "analyses": 1,
    "feedback": 1
  }
}
```

## GET `/api/health/sync/status`

Returns persisted local totals and the latest sync event.

## GET `/api/coach/insights`

Returns the latest stored Coach profile, scores, insights, and next best action.

## Local Storage

Development data is stored in `server/data/coach-sync-store.json`. This file is runtime state, not source code.
