# Coach

A personal training / recovery / nutrition companion for João. Plain HTML/CSS/JS,
no build step. Single user, offline, data stored locally in the browser.

## Run it

```bash
cd "Joao Gym train"
python3 -m http.server 8123
```

Then open <http://localhost:8123>. Opening `index.html` from disk (`file://`) will **not**
work — the scripts load as separate files and must be served over http.

Tests are plain pages you open in a browser:

- <http://localhost:8123/tests/model.test.html> — Epley, phase/week, program versions, PR detection, progression
- <http://localhost:8123/tests/migration.test.html> — schema v1 → v2 migration, validation, idempotency
- <http://localhost:8123/tests/rotation.test.html> — the rotation and session-status rules

## Files

| File | What |
|---|---|
| `index.html` | Shell — loads the stylesheet and the scripts, in order |
| `app.css` | Design system: colour tokens, light/dark, the glass nav + tab bar |
| `js/util.js` | `uid`, UTC timestamps, and Perth calendar dates |
| `js/data.js` | **Seed content** — exercise catalog, movement families, program version `pv1`. Affects a fresh install or "Reset all data" only |
| `js/store.js` | Persistence, schema migrations, validation, backups, import/export |
| `js/model.js` | Pure logic — Epley, phase/week, rotation, recall, PR detection, progression |
| `js/ui.js` | DOM helpers, icon set, bottom sheet, toast |
| `js/views.js` | Every screen |
| `js/app.js` | Boot, hash router, tab bar, save-health banner |

Asset URLs carry a `?v=` query — bump it when you change a file so the browser doesn't
serve a stale copy. The Stage 4 service worker will key its cache off the same string.

## Two clocks

These are deliberately independent:

- **Calendar clock** — phase and week, computed from `settings.phaseStartDate`. Missing a
  workout does not pause it. Each session freezes its own phase/week snapshot at start, so
  changing the start date later never rewrites recorded history.
- **Rotation clock** — `rotationIndex` over `push → lower → pull → arms`. It only moves when
  you intentionally complete a session.

| Event | Status | Rotation |
|---|---|---|
| Start scheduled day | `draft` | unchanged |
| Start manually-picked day | `draft` (`startMode: manual`) | unchanged |
| Force-quit / reload mid-session | stays `draft` | unchanged; Today offers "Resume draft" |
| Finish scheduled day normally | `completed` | **advances**; Undo offered for 10 min |
| Finish a manually-picked day | `completed` | **asks first**, defaults to not advancing |
| Finish with prescribed exercises untouched | offers "Finish as partial" | asks first |
| Abandon a draft | `abandoned` (kept, hidden in History) | never advances |
| Edit or delete a past session | stays as it was | **not** recalculated; PRs restamped |
| Missed days or weeks | — | frozen where it was |

`completed` and `partial` sessions feed last-time recall, suggestions and PRs.
`draft` and `abandoned` sessions never do.

## Data model (schema v2)

```
meta            schemaVersion, appVersion, created/updated, lastSuccessfulSaveAt,
                lastBackupAt, migrationHistory, timezone (Australia/Perth),
                weightUnit, sourceOfTruthDevice
settings        phaseStartDate, phaseLengthWeeks, kcal/protein targets,
                bodyweight target band, theme, Health shortcut names, rest timer
exercises[]     exerciseId, name, movementFamilyId, equipment, primaryMuscle,
                movementPattern, defaultLoadIncrementKg, referenceImage, active, userNote
movementFamilies[]  groups interchangeable variants — offered together as swaps,
                    but each keeps its OWN weights, e1RM and PRs. Never compared.
programVersions[]   append-only. id, name, effectiveStartDate, trainingDayOrder,
                    days[] → slots[] (planSlotId, defaultExerciseId, allowedExerciseIds,
                    sets, repLow, repHigh, rir, loadIncrementKg, note)
sessions[]      sessionId, programVersionId, dayId, startMode, status, started/finished,
                date (Perth), phase/week snapshot, rotationPositionSnapshot,
                advancesRotation, recoverySnapshot, notes, entries[]
  entry         planSlotId, movementFamilyId, prescribedExerciseId, exerciseId,
                wasSwapped, substitutionReason, prescription snapshot, note, sets[]
    set         id, order, type (warmup | working | drop | freestyle), weightKg, reps,
                rir, loggedAt, note, e1rm, prFlags[]
bodyweights[] nutritionDays[] recoveryReadings[] readinessCheckins[]   (later stages)
importEvents[] backups[]
```

## Data safety

- **Autosave** after every set change; "Saved HH:MM" on the Session screen. If a write
  fails, a red banner appears and stays until it succeeds.
- **Last-known-good** copy (`coach.lkg`) written before every save; a corrupt main blob is
  recovered from it on the next launch.
- **Backups** in `coach.backup.<id>`: last 5 rolling, plus one automatic per week, plus
  snapshots taken before every migration, import, restore and reset. Restore from More.
- **Migrations** are numbered and validated. If one fails, your original data is left
  exactly as it was, the app shows a recovery screen instead of loading, and offers to
  export the original. It never resets your data because the schema changed.
- **Import** parses → migrates → validates → shows a preview with counts and a duplicate
  warning → snapshots your current data → replaces. Cancel-safe at every step.
- Storage is `localStorage` (~2 KB/session; years of training fits comfortably). Revisit
  IndexedDB only if the stored size passes ~3.5 MB.

## Devices

Installing on two devices does **not** sync them — each browser has its own dataset. Use
export/import to move data, and mark the real one in More → Device. Real per-set sync
would need a native app; it is not built and not planned for v1.

## Stages

1. ✅ Logging + storage + program engine
1.5. ✅ Architecture & reliability — identity, movement families, program versioning,
   session states, set types, edit/undo/draft recovery, Perth dates, migrations, backups,
   import safety, tests
2. Performance coach — exact-exercise recall, rep-range + RIR progression, PR
   classification, explanations, confidence (partly present; hardened here)
3. Program & weekly review — phase boundaries, planned vs completed, muscle-group volume
4. Mobile & offline — PWA manifest, service worker, iPhone install, Mac → iPhone migration
5. Nutrition & body weight — six checkpoints, adherence, rolling trend, portion nudges
6. Recovery — manual check-in, baselines, base recommendation vs today's adjustment
7. Apple Health write bridge (Shortcut)
8. Apple Health read experiment
9. Refinement — curated exercise photos, plate maths, accessibility, final polish
