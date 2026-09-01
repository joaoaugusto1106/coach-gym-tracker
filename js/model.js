/* Pure logic — no DOM, no storage writes. Dates, the Epley 1RM, and the
   phase / week / variant / next-day engine that drives the Today screen. */

window.App = window.App || {};
(function () {

  function epley(weightKg, reps) { return weightKg * (1 + reps / 30); }

  function todayISO() { return new Date().toISOString().slice(0, 10); }

  function isoToDate(iso) {
    var p = String(iso).split("-");
    return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1);
  }

  function daysBetween(aIso, bIso) {
    return Math.floor((isoToDate(bIso) - isoToDate(aIso)) / 86400000);
  }

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  function shortDate(iso) { var d = isoToDate(iso); return d.getDate() + " " + MONTHS[d.getMonth()]; }
  function humanDate(d) { return DOW[d.getDay()] + " " + d.getDate() + " " + MONTHS[d.getMonth()]; }

  var VARIANT_LABELS = ["A", "B", "C"];

  // Phase / week / variant, derived from the phase start date in settings.
  function phaseInfo(settings, refIso) {
    refIso = refIso || todayISO();
    var len = settings.phaseLengthWeeks || 6;
    var d = daysBetween(settings.phaseStartDate, refIso);
    if (d < 0) d = 0;
    var weeksIn = Math.floor(d / 7);
    var phase = Math.floor(weeksIn / len) + 1;
    var week = (weeksIn % len) + 1;
    var variantIndex = (phase - 1) % VARIANT_LABELS.length;
    return {
      phase: phase,
      week: week,
      variantIndex: variantIndex,
      variantLabel: VARIANT_LABELS[variantIndex],
      isDeloadWeek: week === len
    };
  }

  // The variant to train right now. Falls back to the first defined variant
  // until B and C are added at the rotation stage.
  function activeVariant(state) {
    var want = phaseInfo(state.settings).variantLabel;
    var vs = state.program.variants;
    for (var i = 0; i < vs.length; i++) if (vs[i].label === want) return vs[i];
    return vs[0];
  }

  function nextDay(state) {
    var v = activeVariant(state);
    var idx = ((state.rotationIndex % v.days.length) + v.days.length) % v.days.length;
    return { variant: v, dayIndex: idx, day: v.days[idx] };
  }

  function exerciseById(state, id) {
    for (var i = 0; i < state.exercises.length; i++) if (state.exercises[i].id === id) return state.exercises[i];
    return null;
  }

  function exerciseName(state, id) {
    var e = exerciseById(state, id);
    return e ? e.name : id;
  }

  // Most recent finished performance of an exercise (optionally ignoring one
  // session id, e.g. the one in progress). Returns { date, phase, week, sets }.
  function lastPerformance(state, exerciseId, excludeSessionId) {
    var sessions = state.sessions.slice().sort(function (a, b) {
      return a.startedAt < b.startedAt ? 1 : (a.startedAt > b.startedAt ? -1 : 0);
    });
    for (var i = 0; i < sessions.length; i++) {
      var s = sessions[i];
      if (excludeSessionId && s.id === excludeSessionId) continue;
      for (var j = 0; j < s.entries.length; j++) {
        var en = s.entries[j];
        if (en.exerciseId === exerciseId && en.sets && en.sets.length) {
          return { date: s.date, phase: s.phase, week: s.week, sets: en.sets };
        }
      }
    }
    return null;
  }

  function workingSets(sets) { return (sets || []).filter(function (s) { return !s.warmup; }); }

  function repRangeText(slot) {
    if (!slot) return "Freestyle";
    var r = slot.repLow === slot.repHigh ? String(slot.repLow) : (slot.repLow + "–" + slot.repHigh);
    return slot.sets + " × " + r + "  ·  RIR " + slot.rir;
  }

  function setsText(sets) {
    return (sets || []).map(function (s) { return s.weightKg + "×" + s.reps; }).join("   ");
  }

  function uid(prefix) {
    return (prefix || "id") + "-" +
      Date.now().toString(36) + "-" +
      Math.floor(Math.random() * 1e9).toString(36);
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  function e1rmOf(s) { return (s.e1rm != null) ? s.e1rm : epley(s.weightKg, s.reps); }

  // ---- PR detection --------------------------------------------------
  // Given every working set done for an exercise BEFORE this one (any order),
  // return which records `set` breaks: "weight" (heaviest ever),
  // "e1rm" (best Epley estimate ever), "repsAtWeight" (most reps at a weight
  // already lifted before). No history => nothing to beat => no flags.
  function prsForSet(priorWorkingSets, set) {
    var flags = [];
    if (!priorWorkingSets || !priorWorkingSets.length) return flags;
    var w = round2(set.weightKg), reps = set.reps, e = e1rmOf(set);
    var maxW = -Infinity, maxE = -Infinity, maxRepsAtW = -Infinity, sawWeight = false;
    priorWorkingSets.forEach(function (p) {
      var pw = round2(p.weightKg);
      if (pw > maxW) maxW = pw;
      var pe = e1rmOf(p);
      if (pe > maxE) maxE = pe;
      if (pw === w) { sawWeight = true; if (p.reps > maxRepsAtW) maxRepsAtW = p.reps; }
    });
    if (w > maxW) flags.push("weight");
    if (e > maxE + 1e-6) flags.push("e1rm");
    if (sawWeight && reps > maxRepsAtW) flags.push("repsAtWeight");
    return flags;
  }

  function prLabel(flags, weightKg) {
    if (!flags || !flags.length) return null;
    if (flags.indexOf("weight") > -1) return "Heaviest";
    if (flags.indexOf("repsAtWeight") > -1) return "Most reps @ " + weightKg + " kg";
    return "Best e1RM";
  }

  // Walk a finished session in chronological order and stamp set.prFlags on
  // every set, measured against all OTHER saved sessions plus everything
  // earlier in this one. Authoritative — run at save time.
  function recomputeSessionPRs(state, session) {
    var priorByEx = {};
    state.sessions.forEach(function (s) {
      if (s.id === session.id) return;
      s.entries.forEach(function (en) {
        (priorByEx[en.exerciseId] = priorByEx[en.exerciseId] || [])
          .push.apply(priorByEx[en.exerciseId], workingSets(en.sets));
      });
    });
    session.entries.forEach(function (en) {
      var acc = (priorByEx[en.exerciseId] = priorByEx[en.exerciseId] || []);
      en.sets.forEach(function (set) {
        if (set.warmup) { set.prFlags = []; return; }
        set.prFlags = prsForSet(acc.slice(), set);
        acc.push(set);
      });
    });
  }

  // Live PR check while logging: all working sets for this exercise from saved
  // history + everything already logged in the active session before `set`.
  function priorSetsLive(state, exerciseId, activeEntry, upToIndex) {
    var out = [];
    state.sessions.forEach(function (s) {
      s.entries.forEach(function (en) {
        if (en.exerciseId === exerciseId) out.push.apply(out, workingSets(en.sets));
      });
    });
    var as = state.activeSession;
    if (as) as.entries.forEach(function (en) {
      if (en.exerciseId !== exerciseId) return;
      var sets = (en === activeEntry) ? en.sets.slice(0, upToIndex) : en.sets;
      out.push.apply(out, workingSets(sets));
    });
    return out;
  }

  function collectSessionPRs(state, session) {
    var prs = [];
    session.entries.forEach(function (en) {
      en.sets.forEach(function (set) {
        if (set.prFlags && set.prFlags.length) {
          prs.push({ exerciseId: en.exerciseId, weightKg: set.weightKg, reps: set.reps,
            flags: set.prFlags.slice(), label: prLabel(set.prFlags, set.weightKg) });
        }
      });
    });
    return prs;
  }

  // ---- overload suggestion ----------------------------------------
  function loadIncrement(ex) {
    if (ex && ex.equipment === "dumbbell") return 2;
    return 2.5;
  }

  // What to do on this lift today, from last time's logged RIR.
  // tone: "push" | "hold" | "back" | "none"
  function overloadSuggestion(state, exerciseId, slot) {
    var ex = exerciseById(state, exerciseId);
    var lp = lastPerformance(state, exerciseId);
    var repLow = slot ? slot.repLow : 8;
    var repHigh = slot ? slot.repHigh : 12;
    var rirTarget = slot ? slot.rir : 2;
    var span = repLow === repHigh ? (repLow + " reps") : (repLow + "–" + repHigh + " reps");

    if (!lp) {
      return { tone: "none",
        headline: "First time on this lift",
        detail: "Pick a weight you can hold for " + span + " with about " + rirTarget + " left in reserve, then log it." };
    }

    var sets = workingSets(lp.sets);
    if (!sets.length) sets = lp.sets.slice();
    var rirs = sets.map(function (s) { return (s.rir == null) ? 2 : s.rir; });
    var minRir = Math.min.apply(null, rirs);
    var top = sets.slice().sort(function (a, b) { return e1rmOf(b) - e1rmOf(a); })[0];
    var repsAtTop = Math.max.apply(null, sets
      .filter(function (s) { return round2(s.weightKg) === round2(top.weightKg); })
      .map(function (s) { return s.reps; }));
    var inc = loadIncrement(ex);

    if (minRir >= 2) {
      return { tone: "push",
        headline: "Add load — " + round2(top.weightKg + inc) + " kg × " + repLow + "+",
        detail: "Every set left " + minRir + "+ in reserve. Clear " + repLow + "+ reps, then add load again next time." };
    }
    if (minRir === 1) {
      return { tone: "hold",
        headline: "Hold " + round2(top.weightKg) + " kg — beat " + repsAtTop + " reps",
        detail: "A set hit RIR 1 last time. Add reps at this weight before you add load." };
    }
    return { tone: "back",
      headline: "Hold " + round2(top.weightKg) + " kg — leave 1 in reserve",
      detail: "You hit failure last time. Match it cleanly, 1 in reserve, before pushing." };
  }

  App.model = {
    epley: epley,
    todayISO: todayISO,
    isoToDate: isoToDate,
    daysBetween: daysBetween,
    shortDate: shortDate,
    humanDate: humanDate,
    phaseInfo: phaseInfo,
    activeVariant: activeVariant,
    nextDay: nextDay,
    exerciseById: exerciseById,
    exerciseName: exerciseName,
    lastPerformance: lastPerformance,
    workingSets: workingSets,
    repRangeText: repRangeText,
    setsText: setsText,
    uid: uid,
    round2: round2,
    prsForSet: prsForSet,
    prLabel: prLabel,
    priorSetsLive: priorSetsLive,
    recomputeSessionPRs: recomputeSessionPRs,
    collectSessionPRs: collectSessionPRs,
    overloadSuggestion: overloadSuggestion,
    loadIncrement: loadIncrement
  };
})();
