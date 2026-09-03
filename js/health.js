/* Apple Health bridge — write path.

   A web app cannot talk to HealthKit. The only on-device route that needs no
   server, no account and no API key is a companion Shortcut: we hand it a
   small JSON summary over the documented `shortcuts://` URL scheme, and it
   calls Health's own "Log Workout" action.

   What crosses the bridge is a SUMMARY — type, start, end, duration, and a few
   numbers for the notification text. Per-set detail stays in this app, the
   same as every other strength app.

   Deliberately NOT used: x-callback-url. Coming back from Shortcuts can land
   in Safari rather than the installed app, which would look like data loss
   even though nothing was lost. Instead the app asks you what happened and
   only records a success you actually confirm. It never claims a result it
   cannot observe. */

window.App = window.App || {};
(function () {
  var M = App.model, U = App.util;

  var MIN_MINUTES = 5;
  var MAX_MINUTES = 240;

  function workingSetsOf(session) {
    var n = 0, volume = 0;
    (session.entries || []).forEach(function (en) {
      M.workingSets(en.sets).forEach(function (s) {
        n++; volume += (s.weightKg || 0) * (s.reps || 0);
      });
    });
    return { sets: n, volumeKg: Math.round(volume) };
  }

  // Minutes between the session's own timestamps, clamped to something a
  // gym session can plausibly be. A draft left open overnight shouldn't
  // write a 14-hour workout into Health.
  function suggestedMinutes(session) {
    if (!session.startedAt || !session.endedAt) return 60;
    var mins = Math.round((new Date(session.endedAt) - new Date(session.startedAt)) / 60000);
    if (!isFinite(mins) || mins < MIN_MINUTES) return MIN_MINUTES;
    if (mins > MAX_MINUTES) return MAX_MINUTES;
    return mins;
  }
  function wasClamped(session) {
    if (!session.startedAt || !session.endedAt) return false;
    var mins = Math.round((new Date(session.endedAt) - new Date(session.startedAt)) / 60000);
    return !isFinite(mins) || mins < MIN_MINUTES || mins > MAX_MINUTES;
  }

  /* The summary handed to the Shortcut. `end` is derived from the chosen
     duration rather than the raw timestamp, so what Health records matches
     what you confirmed on screen. */
  function payload(state, session, minutes) {
    var mins = minutes == null ? suggestedMinutes(session) : minutes;
    var counts = workingSetsOf(session);
    var start = session.startedAt || new Date().toISOString();
    var end = new Date(new Date(start).getTime() + mins * 60000).toISOString();
    return {
      v: 1,
      type: "Functional Strength Training",
      sessionId: session.id,
      day: session.dayName || "Training",
      date: session.date,
      start: start,
      end: end,
      durationMin: mins,
      exercises: (session.entries || []).filter(function (e) { return e.sets.length; }).length,
      sets: counts.sets,
      volumeKg: counts.volumeKg
    };
  }

  /* The same hand-off for an easy ride. Health has a real activity type for
     cycling, so a ride should not be logged as strength training -- it would
     land in the wrong place in Fitness and make the numbers meaningless.

     A ride carries no start timestamp (you log it after the fact, and the app
     does not ask when you set off), so the window is anchored to the END of the
     logged day and worked backwards by the duration. That keeps it on the right
     calendar day without inventing a departure time it never knew. Same rule as
     the strength payload: a summary only -- no note, no heart rate history. */
  function cardioPayload(ride) {
    var mins = Math.max(1, Math.min(600, Math.round(ride.minutes || 0)));
    // 18:00 local on the day it was logged, then back by the duration
    var end = new Date(ride.date + "T18:00:00");
    if (isNaN(end.getTime())) end = new Date();
    var start = new Date(end.getTime() - mins * 60000);
    return {
      v: 1,
      type: "Cycling",
      cardioId: ride.id,
      day: "Easy ride",
      date: ride.date,
      start: start.toISOString(),
      end: end.toISOString(),
      durationMin: mins
    };
  }

  function payloadText(p) { return JSON.stringify(p); }

  function shortcutURL(shortcutName, p) {
    return "shortcuts://run-shortcut" +
      "?name=" + encodeURIComponent(shortcutName || "Log Strength Workout") +
      "&input=text" +
      "&text=" + encodeURIComponent(payloadText(p));
  }

  // Shortcuts only exists on Apple platforms. Everywhere else the button
  // should explain rather than fail silently.
  function isSupported() {
    return App.env && App.env.isIOS ? App.env.isIOS() : false;
  }

  function open(url) {
    // location.href keeps the current page, so returning from Shortcuts comes
    // back to the app rather than a blank tab
    window.location.href = url;
  }

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;opacity:0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        resolve();
      } catch (e) { reject(e); }
    });
  }

  /* ---------------------------------------------------------------- read path
     Getting numbers OUT of Health is harder than putting a workout in: the
     Shortcut has to hand a result back to a web app, and iOS gives no reliable
     return channel into an installed PWA.

     So the exchange is deliberately dumb: the Shortcut copies a line of JSON to
     the clipboard, and you paste it in. One extra tap, no permissions, works
     identically in Safari and in the installed app. Auto-reading the clipboard
     is offered where the browser allows it, but is never required.

     Everything below assumes the input is garbage until proven otherwise. */

  var RANGES = {
    hrvMs: { min: 5, max: 300, label: "HRV", unit: "ms" },
    restingHrBpm: { min: 30, max: 120, label: "Resting HR", unit: "bpm" },
    sleepHours: { min: 0, max: 16, label: "Sleep", unit: "h" }
  };

  function looksLikeMinutes(key, v) {
    // 444 for sleep is minutes, not hours — a very easy Shortcut mistake
    return key === "sleepHours" && v > RANGES.sleepHours.max && v / 60 <= RANGES.sleepHours.max;
  }

  function readNumber(key, raw, warnings) {
    if (raw == null || raw === "") return null;
    var v = typeof raw === "number" ? raw : parseFloat(String(raw).replace(",", "."));
    if (!isFinite(v)) {
      warnings.push(RANGES[key].label + ": “" + raw + "” isn't a number — ignored.");
      return null;
    }
    if (looksLikeMinutes(key, v)) {
      warnings.push("Sleep came through as " + v + ", which looks like minutes. " +
        "Divide by 60 in the Shortcut so it sends hours. Ignored for now.");
      return null;
    }
    var r = RANGES[key];
    if (v < r.min || v > r.max) {
      warnings.push(r.label + " of " + v + " " + r.unit + " is outside anything plausible (" +
        r.min + "–" + r.max + ") — ignored.");
      return null;
    }
    return Math.round(v * 100) / 100;
  }

  function readDate(raw, warnings) {
    if (!raw) return null;
    var s = String(raw).trim();
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);          // ISO date or datetime
    if (m) return m[0].slice(0, 10);
    var d = new Date(s);
    if (!isNaN(d.getTime())) return U.perthDateISO(d);
    warnings.push("Couldn't read the date “" + raw + "” — the Shortcut should send it as YYYY-MM-DD.");
    return null;
  }

  function readOneDay(obj, warnings) {
    var date = readDate(obj.date, warnings) || U.perthDateISO();
    if (date > U.perthDateISO()) {
      warnings.push("A reading is dated in the future (" + date + ") — check the Shortcut's date step.");
      return null;
    }
    var row = {
      date: date,
      hrvMs: readNumber("hrvMs", obj.hrvMs != null ? obj.hrvMs : obj.hrv, warnings),
      restingHrBpm: readNumber("restingHrBpm", obj.restingHrBpm != null ? obj.restingHrBpm : obj.restingHr, warnings),
      sleepHours: readNumber("sleepHours", obj.sleepHours != null ? obj.sleepHours : obj.sleep, warnings)
    };
    if (row.hrvMs == null && row.restingHrBpm == null && row.sleepHours == null) return null;
    return row;
  }

  /* Parse whatever the Shortcut produced.
     Returns { ok, days:[...], warnings:[...], fatal } — partial data is a
     success, because three metrics with one missing is still worth having. */
  function parseReadPayload(text) {
    var warnings = [];
    if (!text || !String(text).trim()) {
      return { ok: false, fatal: "Nothing pasted.", days: [], warnings: warnings };
    }
    var raw = String(text).trim();
    // tolerate a Shortcut that wrapped the JSON in quotes or stray whitespace
    if (raw.charAt(0) === '"' && raw.charAt(raw.length - 1) === '"') {
      try { raw = JSON.parse(raw); } catch (e) { /* leave as-is */ }
    }
    var data;
    try { data = typeof raw === "string" ? JSON.parse(raw) : raw; }
    catch (e) {
      return {
        ok: false, days: [], warnings: warnings,
        fatal: "That isn't valid JSON. Copy the whole line the Shortcut produced, including the { and }."
      };
    }
    if (data && data.error) {
      return {
        ok: false, days: [], warnings: warnings,
        fatal: data.error === "denied"
          ? "The Shortcut says Health denied access. Open Health → Sharing → Apps → Shortcuts and allow it to read HRV, resting heart rate and sleep."
          : "The Shortcut reported: " + data.error
      };
    }

    var list = [];
    if (Array.isArray(data)) list = data;
    else if (data && Array.isArray(data.days)) list = data.days;
    else if (data && typeof data === "object") list = [data];
    else return { ok: false, days: [], warnings: warnings, fatal: "Didn't recognise that shape." };

    var days = [];
    list.forEach(function (o) {
      if (!o || typeof o !== "object") return;
      var row = readOneDay(o, warnings);
      if (row) days.push(row);
    });

    if (!days.length) {
      return {
        ok: false, days: [], warnings: warnings,
        fatal: warnings.length
          ? "Nothing usable came through — see the notes below."
          : "The Shortcut returned no HRV, resting heart rate or sleep. That usually means Health has no data for that day, or permission was never granted."
      };
    }
    // newest first, one row per date
    var seen = {};
    days = days.sort(function (a, b) { return a.date < b.date ? 1 : -1; })
      .filter(function (d) { if (seen[d.date]) return false; seen[d.date] = 1; return true; });
    return { ok: true, days: days, warnings: warnings, fatal: null };
  }

  // Merge parsed rows into state. Existing days are updated field-by-field, so
  // importing sleep-only doesn't wipe an HRV figure you already had.
  function applyReadings(state, days, source) {
    var added = 0, updated = 0;
    state.recoveryReadings = state.recoveryReadings || [];
    days.forEach(function (d) {
      var existing = null;
      for (var i = 0; i < state.recoveryReadings.length; i++) {
        if (state.recoveryReadings[i].date === d.date) { existing = state.recoveryReadings[i]; break; }
      }
      if (existing) {
        ["hrvMs", "restingHrBpm", "sleepHours"].forEach(function (k) {
          if (d[k] != null) existing[k] = d[k];
        });
        existing.source = source || "shortcut";
        existing.importedAt = U.nowISO();
        updated++;
      } else {
        state.recoveryReadings.push({
          date: d.date, hrvMs: d.hrvMs, restingHrBpm: d.restingHrBpm, sleepHours: d.sleepHours,
          source: source || "shortcut", importedAt: U.nowISO()
        });
        added++;
      }
    });
    state.recoveryReadings.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    return { added: added, updated: updated };
  }

  function readShortcutURL(shortcutName) {
    return "shortcuts://run-shortcut?name=" + encodeURIComponent(shortcutName || "Read Recovery");
  }

  function canReadClipboard() {
    return !!(navigator.clipboard && navigator.clipboard.readText);
  }
  function readClipboard() {
    if (!canReadClipboard()) return Promise.reject(new Error("unsupported"));
    return navigator.clipboard.readText();
  }

  App.health = {
    MIN_MINUTES: MIN_MINUTES,
    MAX_MINUTES: MAX_MINUTES,
    RANGES: RANGES,
    parseReadPayload: parseReadPayload,
    applyReadings: applyReadings,
    readShortcutURL: readShortcutURL,
    canReadClipboard: canReadClipboard,
    readClipboard: readClipboard,
    suggestedMinutes: suggestedMinutes,
    wasClamped: wasClamped,
    workingSetsOf: workingSetsOf,
    payload: payload,
    cardioPayload: cardioPayload,
    payloadText: payloadText,
    shortcutURL: shortcutURL,
    isSupported: isSupported,
    open: open,
    copy: copy
  };
})();
