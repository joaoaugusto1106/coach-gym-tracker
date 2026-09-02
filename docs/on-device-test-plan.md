# On-device test plan

Everything in Coach is built and tested except two things, and neither can be settled
from a desktop browser:

1. Do Shortcuts-logged workouts count toward **Activity rings**, and show in **Fitness**
   and on the **Watch**?
2. Is the **Health read exchange** (HRV / resting HR / sleep) reliable enough to keep, or
   should it be deleted in favour of the manual entry that already works?

This is the sequence that answers both. It is ordered deliberately: each phase assumes the
one before it passed, so a failure always has one obvious suspect instead of three.

Budget: about 30 minutes of setup, then roughly 20 seconds a day for a week.

---

## Phase 0 — Get Coach onto the phone

Nothing below works until the app is installed, and the Health bridges cannot be tested in
desktop Safari at all.

| # | Do | Expect |
|---|---|---|
| 0.1 | Repo → Settings → General → Danger Zone → **Change visibility** → public | Pages is only free on a public repo |
| 0.2 | Repo → Settings → **Pages** → *Build and deployment* → Source → **GitHub Actions** | One-time, and it must be done by hand — the workflow's own token is not allowed to create the Pages site |
| 0.3 | Merge the Pages PR into `main` | Actions → *Deploy to GitHub Pages* runs green |
| 0.4 | Open **<https://joaoaugusto1106.github.io/coach-gym-tracker/>** in **Safari** on the iPhone | Coach loads, Today shows the next day in the rotation |
| 0.5 | Share → **Add to Home Screen** → Add | An icon called Coach |
| 0.6 | Open it **from the home screen** | Full screen, no Safari chrome |
| 0.7 | More → **On this device** | *Installed to home screen: **Yes***, *Works offline: **Ready*** |

**Only Safari can install a web app on iOS.** Chrome on iPhone will load Coach but cannot
add it to the home screen.

### 0.8 — Prove offline before trusting it in a basement

1. Force-quit Coach (swipe up).
2. Turn on **Airplane mode**.
3. Open Coach from the home screen.

It must load and let you log a set. If it shows *"Coach is offline"* instead, the service
worker had not finished caching — turn Airplane mode off, open it once more, wait a few
seconds, and repeat.

---

## Phase 1 — Prove the app before adding Health

Do not debug the Health bridge while also unsure whether logging works.

- [ ] Log one real session end to end and **Finish** it
- [ ] Force-quit, reopen — the session is in History with the right numbers
- [ ] More → **Export backup** — a `.json` file lands in Files

If anything here is wrong, stop. It is a Coach bug, not a Shortcuts problem.

---

## Phase 2 — The write bridge, and the rings question

Build the Shortcut first: **[`shortcuts/log-strength-workout.md`](../shortcuts/log-strength-workout.md)**.
Name it exactly `Log Strength Workout` (this is what Coach is set to call it — More → Apple
Health → *Write Shortcut* shows the current name and lets you change it).

### 2.1 Run it once by hand — do not skip

Tap ▶ **in the Shortcuts editor**. iOS asks for Health *write* permission on first run, and
**that prompt cannot appear when another app launches it**. Skip this and the first real
save silently does nothing.

Allow it. Then check Health → Browse → Activity → Workouts for the entry.

### 2.2 Test the bridge from inside Coach

More → **Apple Health** → **Test the write bridge** → **Send a test workout**.

It sends a clearly-labelled 1-minute workout dated now, so nothing pollutes your real log.
Coach then asks *"Did the test work?"* — it cannot see inside Shortcuts, so it only records
what you tell it.

- [ ] Check Health → Browse → Activity → Workouts for a 1-minute entry dated now
- [ ] Tap **Yes, it's there** (or **No — show me what to check**)
- [ ] **Delete the test entry** in Health

If it failed, the symptom table in the Shortcut doc names the cause — the most common is a
Shortcut name that doesn't match exactly, including capitals and trailing spaces.

### 2.3 The actual question: rings, Fitness and Watch

Log a **real** session, then on the save screen tap **Save to Apple Health**. Check the
duration on the sheet before sending — a draft left open overnight is clamped, but it is
worth a glance.

Then, in order, and record what you see:

| Where | Question | Answer |
|---|---|---|
| Health → Browse → Activity → Workouts | Is the workout there, with the right duration? | |
| Fitness app → Summary | Does it appear in today's activity? | |
| Fitness app → Move ring | Did the Move ring change at all? | |
| Watch → Activity | Do the rings on the Watch reflect it? | |
| Watch → Fitness / workout list | Does the session show there? | |

**Expectation, stated honestly:** a Shortcuts-logged workout with no energy value very
likely records as a workout **without** contributing to the Move ring, because Move is
driven by active energy and Coach deliberately sends none rather than inventing a number.
That is a guess. The table above replaces it with a fact.

**If the rings matter to you and the answer is no**, the options are, in increasing cost:
add an active-energy estimate to the Shortcut (a fabricated number — I would not), accept
that Coach logs the workout but the rings come from the Watch, or move to a native
companion. Decide once you have the answers, not before.

---

## Phase 3 — The read bridge, over a week

This one is explicitly a trial. **Nothing depends on it** — Body → Recovery lets you type
the three numbers in about fifteen seconds, and the whole recovery feature works with none
of them.

Build it: **[`shortcuts/read-recovery.md`](../shortcuts/read-recovery.md)**, named exactly
`Read Recovery`. Run it once by hand for the *read* permission prompt, same reason as 2.1.

### The daily loop

Body → **Recovery** → **Import from Health** → **Open the Shortcut** → come back →
**Paste from clipboard** → check the preview → **Import**.

Do it once a day for about a week, ideally at the time you would really do it — after work,
on the way to the gym, not sitting calmly at a desk.

**Time it.** The number in the last column is the one that decides this.

| Day | Numbers real? | Units/date right? | Round-trip worked? | Seconds | Notes |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |
| 6 | | | | | |
| 7 | | | | | |

Coach rejects implausible input rather than importing it, so a refusal is a *result*, not a
failure of the test — write down what it said. Sleep arriving as `444` means the divide step
in the Shortcut needs changing; an HRV of `2000` means the wrong sample type.

### The decision, after seven days

Answer the five questions from
[`shortcuts/read-recovery.md`](../shortcuts/read-recovery.md):

1. Does it retrieve real numbers?
2. Are the units and dates right?
3. Does it come back reliably, every time?
4. Is it tolerable before a workout — about fifteen seconds, not more?
5. Is it actually better than typing them?

| Fails on | Meaning | Action |
|---|---|---|
| 1 or 2 | A Shortcut-building problem | Fixable — tell me exactly what it returned |
| 3 or 4 | Structural: Shortcuts is the wrong tool for reading into a web app | A small native companion, or drop it |
| 5 | The Shortcut is ceremony | **Delete it and keep manual entry** |

Failing on 5 is a perfectly good outcome. The recovery feature was designed to work without
any of this, and "the manual box is faster" is a real answer, not a defeat.

---

## What to report back

Three things settle it:

1. The **rings table** from 2.3 — five yes/nos.
2. The **daily table** from Phase 3 — especially the seconds column.
3. Anything Coach *said* that was wrong or confusing on a real phone, as opposed to in a
   desktop browser at 390 px.

The docs currently list both questions as unverified. They get updated with your answers
rather than with a guess.
