# Shortcut: "Log Strength Workout"

The one piece of Coach that lives outside the app. It takes a summary of a
finished session and writes it into Apple Health as a workout.

Build it once on your iPhone. About five minutes.

---

## What it does

Coach opens this Shortcut with a line of JSON like:

```json
{"v":1,"type":"Functional Strength Training","sessionId":"s-mhx3-1k2","day":"Upper · Push",
 "date":"2026-09-02","start":"2026-09-02T08:31:00.000Z","end":"2026-09-02T09:23:00.000Z",
 "durationMin":52,"exercises":6,"sets":19,"volumeKg":11840}
```

The Shortcut reads `start`, `end` and `type`, logs the workout, and shows you a
notification saying what it saved.

**Health gets a summary only** — the workout type, when it started, and how long
it lasted. Your sets, weights and RIR stay in Coach, the same as every other
strength app.

---

## Build it

Open **Shortcuts** → **+** (new shortcut) → name it exactly:

```
Log Strength Workout
```

The name has to match what Coach is set to call it, capitals included. If you
want a different name, change it in Coach → More → Apple Health.

### 1. Accept text input

Tap the **ⓘ** (info) button at the bottom, or the shortcut name → **Details**:

- Turn **Show in Share Sheet** ON (this is what makes the shortcut accept input)
- Under **Accepted Types**, leave **Text** ticked

### 2. Get Dictionary from Input

Add action → search **Get Dictionary from Input**.

It should read: *Get Dictionary from **Shortcut Input***.
If it says something else, tap the variable and pick **Shortcut Input**.

### 3. Pull out the values

Add **Get Dictionary Value** four times. For each one, set *Dictionary* to the
**Dictionary** from step 2, and *Key* to:

| Action | Key |
|---|---|
| Get Dictionary Value | `start` |
| Get Dictionary Value | `end` |
| Get Dictionary Value | `durationMin` |
| Get Dictionary Value | `day` |

Rename each result so the next steps are readable — long-press the action →
**Rename** → `StartText`, `EndText`, `Minutes`, `DayName`.

### 4. Turn the timestamps into dates

The two timestamps are ISO-8601 text. Add **Format Date** twice — or, simpler,
add **Date** actions:

- Add action → **Date** → tap the field → choose **StartText** → name it `StartDate`
- Add action → **Date** → tap the field → choose **EndText** → name it `EndDate`

> If Shortcuts refuses to parse them, the fallback is: **Text** action containing
> `StartText`, then **Get Dates from Input**. Either route gets you a real date.

### 5. Log the workout

Add action → search **workout** → choose **Log Workout** (it's a Health action).

Set:

- **Activity Type**: `Functional Strength Training`
- **Start**: `StartDate`
- **End**: `EndDate`

Leave calories and distance empty. Coach doesn't estimate them and it would be
inventing numbers if it did.

> On some iOS versions the parameters are *Duration* and *Start* rather than
> *Start* and *End*. If so, use **Start** = `StartDate` and **Duration** =
> `Minutes` minutes.

### 6. Say what happened

Add action → **Show Notification**:

- **Title**: `Coach`
- **Body**: `Saved DayName — Minutes min to Health` (insert the variables)

This is how you know it worked, since Coach can't see inside Shortcuts.

### 7. Run it once by hand

**Important.** Tap the ▶ play button in the Shortcuts editor once.

iOS asks for permission to write to Health on the **first** run. That prompt
cannot appear while the Shortcut is being launched from another app — so if you
skip this step, the first real save will silently do nothing.

Allow it, then check **Health → Browse → Activity → Workouts** for the entry.

---

## Then, in Coach

More → **Apple Health** → **Test the bridge**. It sends a 1-minute workout dated
now. Check Health for it, then delete that test entry.

After that, every finished session offers **Save to Apple Health** on the save
screen and on the session in History.

---

## If it doesn't work

| Symptom | Cause |
|---|---|
| Nothing happens at all when Coach opens it | The Shortcut name doesn't match. Check for a trailing space or different capitals. |
| Shortcuts opens but errors immediately | Step 2 isn't reading **Shortcut Input**, or Show in Share Sheet is off. |
| Runs, notification appears, nothing in Health | Health permission was never granted — run it by hand once (step 7), then check Health → Sharing → Apps → Shortcuts → Workouts is set to allow writing. |
| "Log Workout" isn't in the action list | Search `workout`. On older iOS it may be listed under the Health app's actions rather than by that exact name. |
| Dates come out wrong | Step 4 didn't parse the ISO text. Use the Text → Get Dates from Input fallback. |

In Coach, the **No — something went wrong** button on the confirmation sheet
also lets you copy the exact JSON, so you can paste it into the Shortcut by hand
and watch which step fails.

---

## What is NOT confirmed

Coach cannot see what Shortcuts did, so it never claims a save it didn't
observe — it asks, and only records what you confirm.

Whether these workouts count toward your **Activity rings**, or appear in
**Fitness** and on the **Watch**, has not been verified. It depends on how iOS
treats Shortcuts-logged workouts on your specific setup. Log one and look — then
we'll know, and the docs get updated with the answer rather than a guess.

## What this bridge does not do

- It does not read anything from Health. That's the separate read bridge, and
  it's a later stage — Coach's recovery features work entirely without it.
- It does not sync. It writes one workout per session, when you ask it to.
- It does not send your sets, weights, RIR, notes or body weight anywhere.
