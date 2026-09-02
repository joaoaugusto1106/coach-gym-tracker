# Coach

A personal training / recovery / nutrition companion for João. Plain HTML/CSS/JS,
no build step. Single user, offline, data stored locally in the browser.

## Run it

```bash
cd "Joao Gym train"
python3 tools/dev-server.py
```

Then open <http://localhost:8123>. The dev server sends `Cache-Control: no-store`, so an edit
always shows up on reload, and serves `.webmanifest` with the right MIME type (Python's
built-in server doesn't, and without it the app can't be installed).

Opening `index.html` from disk (`file://`) will **not** work — the scripts load as separate
files, and service workers need http.

Tests: open <http://localhost:8123/tests/> — it runs every suite and prints one total.
Individual suites: `model`, `migration`, `rotation`, `review`, `nutrition`, `sw`.

Icons are generated, not hand-drawn — `python3 tools/make-icons.py` rebuilds `assets/`.

## Installing it on your iPhone

1. Publish the folder (GitHub Pages works: repo → Settings → Pages → deploy from `main`).
2. Open the published URL **in Safari** — only Safari can install a web app on iOS.
3. Share → **Add to Home Screen** → name it Coach → Add.
4. Open it from the home screen. It runs full-screen with no browser chrome, and works with
   no signal once it has loaded once online.

More → *On this device* shows whether it's installed, whether offline support is ready, and
the offline bundle version.

### Updating an installed copy

Bump `VERSION` in `sw.js` and republish. Next time you open the app online it downloads the
new files in the background and shows a small **"A new version of Coach is ready · Reload"**
bar. Nothing changes until you tap Reload, so an update can never interrupt a session mid-set
— and your draft is saved either way. The old cache is deleted only after the new one is in
place, so an interrupted update leaves the previous version working.

**The service worker cannot touch your training data.** It only manages Cache Storage, which
holds the app's own files. Your sessions live in `localStorage`, which a service worker can't
read, write or clear. Clearing the cache re-downloads the app; it never loses a workout.

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
| `js/app.js` | Boot, hash router, tab bar, save-health banner, service-worker registration and the update bar |
| `sw.js` | Service worker — offline shell. Bump `VERSION` to ship an update |
| `manifest.webmanifest` | PWA manifest (name, icons, standalone display) |
| `assets/` | Generated app icons — rebuild with `tools/make-icons.py` |
| `tools/dev-server.py` | Local server with caching disabled and correct MIME types |

Script and stylesheet URLs carry no version query: the service worker's cache name is the
version. Bump `VERSION` in `sw.js` to ship an update; the dev server disables caching so
local edits are always live.

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
settings.mealPlan   the six checkpoints (time, label, detail) + kcal/protein targets
bodyweights[]   entryId, date (Perth), kg, note
nutritionDays[] date (Perth), checkpoints[] { index, id, state, largerPortion, at }
                state = done | partial | skipped | none
recoveryReadings[] readinessCheckins[]                              (Stage 6)
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

## The progression engine

Every recommendation is derived from your own logged working sets for that **exact**
exercise, and every one carries a reason. Four actions:

| When | Says |
|---|---|
| Every working set reached the top of the rep range at or above target RIR | **Add load** — last top set + your configured increment |
| Sets stayed inside the range but didn't top it, effort near target | **Hold, add reps** — with a concrete total-rep goal |
| A set fell below the rep floor, or effort ran far past target | **Consolidate** — repeat the weight cleanly |
| Under target *twice in a row at the same weight* | **Reduce one increment, or cut a set** |

It refuses to guess. Confidence drops to **low** (with the reason shown) when RIR is missing
or you logged fewer working sets than prescribed — and low confidence blocks "add load". It
returns **no recommendation at all** when there's no history, or when the prescription
changed too much for last time's numbers to be a fair target.

Loading patterns are preserved, never flattened: a top-set/back-off session is recognised
and the suggestion keeps the same shape ("102.5 kg top, 92.5 kg back-offs"). Warm-up and
drop sets are excluded from everything.

Load increments default to 2 kg for dumbbells, 2.5 kg otherwise, and are configurable per
exercise (tap the exercise name during a session). The setting drives both the weight
stepper and the "add load" target.

## History, Week and Exercises

The History tab has three sections.

**Sessions** — every session, newest first, filterable by training day, phase, program
version and exercise (filters combine). Dividers mark where a phase or a program version
began. Abandoned sessions are hidden behind a toggle.

**Week** — one weekly review, steppable back through your history:

- sessions, working sets, and completed vs planned (planned = what each session's own
  prescription asked for)
- working sets per muscle group with the change vs last week — counted once per working set
  against the exercise's main muscle group. It's a tracking number, stated as such, not a
  claim that every set produces the same stimulus.
- personal records that week
- biggest estimated-1RM changes vs the previous time you did each exercise (changes under
  0.5 kg are ignored as noise)
- **Worth knowing** — at most three plain observations (shortfall vs planned, a muscle group
  that dropped out, missing RIR, PR count)
- **What the app couldn't see** — sets without RIR, partial sessions, and an explicit note
  that recovery isn't tracked yet

**Exercises** — every exercise you've logged, newest-used first. Tap one for its records, a
progress chart (best estimated 1RM or heaviest working set per session), and every session
it appears in. Warm-up and drop sets are excluded throughout; abandoned sessions never count.

## Food and body weight

**Food** is a checklist of João's six real meals — not a food database, and it never will be.
Each checkpoint is *eaten*, *ate some*, *skipped*, or unmarked. Tap the circle for the common
case; tap the meal for the rest, plus a "bigger portion" flag. A day scores 1 per meal eaten
and 0.5 per partial. Today is shown live but kept out of the weekly average until it's over,
and days you never logged are reported separately rather than counted as zeros.

The kcal and protein targets are shown as what they are: a starting estimate to be corrected
by what the scale does.

**Body** logs a weigh-in per day and plots every reading with a 7-day rolling average over
the top — single mornings bounce too much to read. The trend is a least-squares fit over the
last 21 days, reported in kg/week.

### When the app will and won't change your portions

It checks four things in order, and stops at the first one it can't answer:

1. **Enough weigh-ins?** At least 14 days, 8 readings, ~4 a week. Otherwise it says so and
   stops — it never invents a number.
2. **Enough meals logged to judge the plan?** Fewer than 7 scored days, or under 60% coverage,
   and it won't act on the trend.
3. **Is adherence good enough?** Under 80% and it says to follow the current plan properly
   first — changing portions while meals are being missed would be guessing.
4. **Is the trend clearly and consistently outside the band?** It must miss the
   0.2–0.3 kg/week target by more than 0.05 kg/week, **and** the 3-week and 2-week windows
   must agree. A near-miss or a single odd stretch changes nothing.

Only then does it suggest **one** change — about 50 g more rice at dinner, or half a scoop
less oats — and says to wait two weeks before the next one.

## Devices

Installing on two devices does **not** sync them — each browser has its own dataset. Real
per-set sync would need a native app; it is not built and not planned for v1.

**Moving your data** (More → Device → *Move my data to another device*): export a backup,
get the file to the other device (iCloud Drive, AirDrop, email), import it there, check the
preview counts, confirm. Your existing data on the receiving device is snapshotted first.

**Pick one device to log on** and set it in More → Device. The other one then shows a warning
at the top of Today before you type anything: *"Your iPhone is the source of truth. Anything
you log here stays on this device — it won't reach it."*

## Stages

1. ✅ Logging + storage + program engine
1.5. ✅ Architecture & reliability — identity, movement families, program versioning,
   session states, set types, edit/undo/draft recovery, Perth dates, migrations, backups,
   import safety, tests
2. ✅ Performance coach — exact-exercise recall, rep-range + RIR progression with four
   actions, repeated-underperformance handling, loading-pattern awareness, configurable
   increments, PR classification, explanations, visible confidence, repeat-set, rest timer
3. ✅ Program & weekly review — phase and program-version boundaries, session filters,
   weekly review, muscle-group volume, per-exercise progress charts and records
4. ✅ Mobile & offline — PWA manifest, generated icons, service worker, install and
   data-migration guides, source-of-truth warning, no-cache dev server
5. ✅ Nutrition & body weight — six checkpoints with done/partial/skipped, daily and
   weekly adherence, weigh-in log, rolling trend, and conservative portion advice
6. Recovery — manual check-in, baselines, base recommendation vs today's adjustment
7. Apple Health write bridge (Shortcut)
8. Apple Health read experiment
9. Refinement — curated exercise photos, plate maths, accessibility, final polish
