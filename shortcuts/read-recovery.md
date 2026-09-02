# Shortcut: "Read Recovery" — an experiment

Pulls HRV, resting heart rate and sleep out of Apple Health and hands them to
Coach, so "low" can be measured against your own numbers instead of only how
you say you feel.

**This one is explicitly a trial.** The write bridge (logging a workout) is a
one-way hand-off and is simple. Reading is harder: iOS gives no reliable way to
push data back into an installed web app. Before this becomes something you rely
on, it has to earn it — the checklist at the bottom decides whether it stays or
gets replaced with a small native app.

**Nothing depends on this.** The recovery check-in works completely without it,
and you can type the three numbers by hand in Body → Recovery in about fifteen
seconds.

---

## How the exchange works

The Shortcut reads Health, builds one line of JSON, and **copies it to the
clipboard**. You come back to Coach and paste it.

That extra tap is deliberate. The alternative — having the Shortcut open a URL
back into Coach — sometimes lands in Safari rather than the installed app, which
has its own separate storage. That looks exactly like your data vanishing. A
paste box always works, in both.

---

## Build it

Shortcuts → **+** → name it exactly:

```
Read Recovery
```

(Or anything you like, as long as it matches Coach → More → Apple Health → Read
Shortcut.)

### 1. Get the three numbers

Add **Find Health Samples** three times. For each, set:

| # | Type | Sort by | Order | Limit |
|---|---|---|---|---|
| 1 | Heart Rate Variability | Start Date | Latest First | 1 |
| 2 | Resting Heart Rate | Start Date | Latest First | 1 |
| 3 | Sleep Analysis | Start Date | Latest First | 1 |

After each one, add **Get Details of Health Sample** → **Value**, and rename the
result `HRV`, `RHR`, `SleepRaw`.

> Sleep is the awkward one. Depending on your iOS version, Sleep Analysis
> returns a duration in **minutes or seconds**, and may be split into several
> samples per night. Start with the single latest sample and check what the
> number looks like — Coach will tell you if it arrives as minutes rather than
> hours instead of silently importing nonsense.

### 2. Convert sleep to hours

Add **Calculate** → `SleepRaw` ÷ `60` (if it comes through as minutes) → rename
`SleepHours`.

If your sleep value is in seconds, divide by 3600 instead. If Coach says
*"Sleep came through as 444, which looks like minutes"*, that's this step.

### 3. Today's date

Add **Date** → Current Date. Then **Format Date**:

- Date Format: **Custom**
- Format String: `yyyy-MM-dd`

Rename it `Today`.

### 4. Build the line

Add a **Text** action containing exactly this, with the variables inserted where
the names are:

```
{"v":1,"date":"Today","hrvMs":HRV,"restingHrBpm":RHR,"sleepHours":SleepHours}
```

The date is in quotes; the three numbers are not.

### 5. Copy it

Add **Copy to Clipboard** with that Text as input.

Optionally add **Show Notification** with the same text, so you can see what it
produced.

### 6. Run it once by hand

Tap ▶. iOS asks for permission to **read** Health data on the first run, and that
prompt can't appear when another app launches it.

Allow HRV, resting heart rate and sleep. Check the notification shows real
numbers, not blanks.

---

## Then, in Coach

Body → **Recovery** → **Import from Health** → **Run the "Read Recovery"
Shortcut** → come back → paste → check the preview → **Import**.

The preview shows exactly what was understood before anything is saved. If
something's off, it says what and why rather than importing it.

### Fetching several days at once

If you want to backfill, the Shortcut can send an array instead:

```
{"v":1,"days":[{"date":"2026-09-01","hrvMs":49,"restingHrBpm":51,"sleepHours":7.2},
               {"date":"2026-09-02","hrvMs":44,"restingHrBpm":53,"sleepHours":6.1}]}
```

Coach handles either shape. Importing a day that already exists updates only the
fields present, so a sleep-only import won't wipe an HRV figure you already had.

---

## What Coach does with bad input

It assumes the input is garbage until proven otherwise:

| Input | What happens |
|---|---|
| Not JSON | Rejected, with a note to copy the whole line including the braces |
| `{"error":"denied"}` | Tells you to check Health → Sharing → Apps → Shortcuts |
| Sleep of `444` | Rejected — "looks like minutes, divide by 60 in the Shortcut" |
| HRV of `2000` | Rejected as outside anything plausible (5–300 ms) |
| A date in the future | Rejected, pointing at the Shortcut's date step |
| One field missing | Imported anyway — partial data is still worth having |
| All three missing | Rejected: Health probably has no data for that day |

Nothing is ever silently converted or guessed.

---

## The decision this experiment settles

Run it for **about a week**, then answer these. If the answer to any of 1–4 is
no, the honest move is a small native iPhone companion instead of pretending
this is reliable.

1. **Does it retrieve real numbers?** Not blanks, not zeros.
2. **Are the units and dates right?** Sleep in hours, the date being the night
   you actually slept, HRV matching what the Health app shows.
3. **Does it come back reliably?** Copy → paste → import, every time, with no
   step that silently fails.
4. **Is it tolerable before a workout?** You're arriving at the gym after a work
   day. If this is more than about fifteen seconds, it will not survive contact
   with real life — and typing three numbers by hand is already that fast.
5. **Is it actually better than typing them?** If not, the Shortcut is
   ceremony, and the manual entry already in Coach is the better answer.

**If it fails on 1 or 2**, it's a Shortcut-building problem — fixable, tell me
what it returned.

**If it fails on 3 or 4**, it's structural. Shortcuts is the wrong tool for
reading data back into a web app, and the fix is a small native companion that
talks to HealthKit directly and shares a file with Coach. That's a real project,
not an afternoon, and worth doing only if you'd actually use the numbers.

**If it fails on 5**, we delete this and keep the manual entry. That is a
perfectly good outcome — the recovery feature was designed to work without any
of this.
