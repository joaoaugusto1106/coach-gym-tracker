# Coach

A personal training / recovery / nutrition companion. Plain HTML/CSS/JS, no build step.
Single user, offline, data stored locally in the browser.

## Run it

```bash
cd "Joao Gym train"
python3 -m http.server 8123
```

Then open <http://localhost:8123> in a browser. On iPhone (later stages) it becomes an
installable PWA served from GitHub Pages; for now a local server or GitHub Pages both work.

Opening `index.html` straight from disk (`file://`) will **not** work — the scripts load as
separate files and need to be served over http.

## Where things live

| File | What |
|---|---|
| `index.html` | Shell — loads the stylesheet and the six scripts, in order |
| `app.css` | Design system: colour tokens, light/dark, the glass nav + tab bar |
| `js/data.js` | **Seed content** — your exercise library and your program (Variant A). Edit here to change the starting program; only affects a fresh install or "Reset all data" |
| `js/store.js` | Persistence — one JSON blob in `localStorage` under `coach.v1`, versioned, with export/import |
| `js/model.js` | Pure logic — Epley 1RM, phase/week/variant math, next-day rotation, last-performance lookup |
| `js/ui.js` | DOM helpers, the inline icon set, bottom sheet, toast |
| `js/views.js` | Every screen |
| `js/app.js` | Boot, hash router, tab bar |

Asset URLs carry a `?v=` query (currently `s1c`) — bump it when you change a file so the
browser doesn't serve a stale copy.

## Data model (as built in stage 1)

- **Settings** — units, `phaseStartDate` (phase / week / variant are derived from it),
  phase length, kcal/protein targets, theme.
- **Program → Variant → DayTemplate → Slot** — a slot is `exerciseId` + `altIds` +
  `sets` / `repLow`–`repHigh` / `rir`.
- **Session** — date, phase, week, variant, day, then **Entry** per exercise
  (`exerciseId`, `prescribedExerciseId`, `wasSwapped`, `slotId`) each holding **Sets**
  (`weightKg`, `reps`, `rir`, `warmup`, `e1rm`).
- **BodyweightReading / RecoveryReading / NutritionDay / CardioLog** — empty arrays for now,
  filled in later stages.

## Stages

1. **Logging + storage + program engine** ← you are here
2. Beat-last-time recall + PR detection + RIR-driven overload suggestion
3. Exercise reference photos + full exercise swap
4. Phase tagging + variant rotation (A→B→C) + weekly muscle-group volume
5. Nutrition checklist
6. Cardio logging
7. Apple visual pass + installable PWA (manifest, icons, service worker)
8. Apple Health write bridge (Shortcut)
9. Apple Health read bridge + recovery flag
10. Body-weight trend → portion-nudge logic
11. Nice-to-haves (per-exercise progress chart, plate-math helper)
