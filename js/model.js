/* Pure logic — no DOM, no storage writes.
   Dates (Perth), Epley 1RM, the calendar clock (phase/week) and the rotation
   clock (next training day), last-time recall, PR detection, and the RIR-aware
   progression suggestion. */

window.App = window.App || {};
(function () {
  var U = App.util;

  function epley(weightKg, reps) { return weightKg * (1 + reps / 30); }
  function round2(n) { return Math.round(n * 100) / 100; }
  function e1rmOf(s) { return (s.e1rm != null) ? s.e1rm : epley(s.weightKg, s.reps); }

  function perthTodayISO() { return U.perthDateISO(); }
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
  function humanDate(d) {
    if (typeof d === "string") d = isoToDate(d);
    return DOW[d.getDay()] + " " + d.getDate() + " " + MONTHS[d.getMonth()];
  }
  function timeOfDay(iso) {
    try {
      return new Intl.DateTimeFormat("en-GB", { timeZone: "Australia/Perth", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
    } catch (e) { return ""; }
  }
  // A UTC timestamp rendered as its Perth calendar day + time ("2 Sep 05:53").
  function stampText(iso) {
    if (!iso) return "—";
    try { return shortDate(U.perthDateISO(new Date(iso))) + " " + timeOfDay(iso); }
    catch (e) { return "—"; }
  }

  // ---- calendar clock: phase / week from the phase start date -------------
  function phaseInfo(settings, refIso) {
    refIso = refIso || perthTodayISO();
    var len = settings.phaseLengthWeeks || 6;
    var d = daysBetween(settings.phaseStartDate, refIso);
    if (d < 0) d = 0;
    var weeksIn = Math.floor(d / 7);
    var phase = Math.floor(weeksIn / len) + 1;
    var week = (weeksIn % len) + 1;
    return { phase: phase, week: week, isDeloadWeek: week === len };
  }

  // ---- program version in force on a given date --------------------------
  function activeProgram(state, dateIso) {
    dateIso = dateIso || perthTodayISO();
    var vs = (state.programVersions || []).slice()
      .filter(function (v) { return (v.effectiveStartDate || "0000") <= dateIso; })
      .sort(function (a, b) { return a.effectiveStartDate < b.effectiveStartDate ? 1 : -1; });
    if (vs.length) return vs[0];
    // nothing effective yet — fall back to the flagged active one, else the first
    var byId = programById(state, state.activeProgramVersionId);
    return byId || state.programVersions[0];
  }
  function programById(state, id) {
    var list = state.programVersions || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function programShortName(pv) {
    if (!pv) return "";
    var m = String(pv.id || "").match(/(\d+)$/);
    return m ? ("v" + m[1]) : (pv.name || pv.id);
  }
  function dayById(pv, dayId) {
    for (var i = 0; i < pv.days.length; i++) if (pv.days[i].id === dayId) return pv.days[i];
    return null;
  }

  // ---- rotation clock: which day comes next ----------------------------
  function nextDay(state) {
    var pv = activeProgram(state);
    var order = pv.trainingDayOrder || pv.days.map(function (d) { return d.id; });
    var idx = ((state.rotationIndex % order.length) + order.length) % order.length;
    return { program: pv, dayIndex: idx, dayId: order[idx], day: dayById(pv, order[idx]) || pv.days[0] };
  }
  function rotationDayInfo(state, dayId) {
    var pv = activeProgram(state);
    var order = pv.trainingDayOrder || pv.days.map(function (d) { return d.id; });
    var idx = order.indexOf(dayId);
    return { program: pv, dayIndex: idx < 0 ? 0 : idx, dayId: dayId, day: dayById(pv, dayId) || pv.days[0] };
  }

  // Rotation rules (see the Stage 1.5 review, §4):
  // - a scheduled session, completed normally, advances automatically
  // - anything else (manual pick, partial, abandoned) asks first / never advances
  function rotationShouldAutoAdvance(startMode, status) {
    return startMode === "scheduled" && status === "completed";
  }
  function advanceRotationIndex(orderLen, curIdx) {
    return ((curIdx + 1) % orderLen + orderLen) % orderLen;
  }

  // ---- exercise catalog -----------------------------------------------
  function exerciseById(state, id) {
    for (var i = 0; i < state.exercises.length; i++) if (state.exercises[i].id === id) return state.exercises[i];
    return null;
  }
  function exerciseName(state, id) { var e = exerciseById(state, id); return e ? e.name : id; }
  function familyName(state, famId) {
    var f = (state.movementFamilies || []).filter(function (x) { return x.id === famId; })[0];
    return f ? f.name : famId;
  }

  // ---- sets ----------------------------------------------------------
  function workingSets(sets) { return (sets || []).filter(function (s) { return s.type === "working"; }); }
  function countsForHistory(session) { return session && (session.status === "completed" || session.status === "partial"); }

  // Most recent valid (completed/partial) performance of an EXACT exercise.
  // Returns { date, phase, week, sets } — sets is every set for display; the
  // engine filters to working sets itself.
  function lastPerformance(state, exerciseId, excludeSessionId) {
    var sessions = (state.sessions || []).slice()
      .filter(countsForHistory)
      .sort(function (a, b) { return a.startedAt < b.startedAt ? 1 : (a.startedAt > b.startedAt ? -1 : 0); });
    for (var i = 0; i < sessions.length; i++) {
      var s = sessions[i];
      if (excludeSessionId && s.id === excludeSessionId) continue;
      for (var j = 0; j < s.entries.length; j++) {
        var en = s.entries[j];
        if (en.exerciseId === exerciseId && workingSets(en.sets).length) {
          return { date: s.date, phase: s.phase, week: s.week, sets: en.sets };
        }
      }
    }
    return null;
  }

  function repRangeText(slot) {
    if (!slot) return "Freestyle";
    var r = slot.repLow === slot.repHigh ? String(slot.repLow) : (slot.repLow + "–" + slot.repHigh);
    return slot.sets + " × " + r + "  ·  RIR " + slot.rir;
  }
  function setsText(sets) {
    return (sets || []).map(function (s) { return s.weightKg + "×" + s.reps; }).join("   ");
  }

  function uid(prefix) { return U.uid(prefix); }

  // ---- PR detection -------------------------------------------------
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

  // Restamp prFlags for one session against all OTHER valid sessions +
  // everything earlier within it, in chronological set order.
  function recomputeSessionPRs(state, session) {
    var priorByEx = {};
    (state.sessions || []).forEach(function (s) {
      if (s.id === session.id || !countsForHistory(s)) return;
      s.entries.forEach(function (en) {
        (priorByEx[en.exerciseId] = priorByEx[en.exerciseId] || [])
          .push.apply(priorByEx[en.exerciseId], workingSets(en.sets));
      });
    });
    session.entries.forEach(function (en) {
      var acc = (priorByEx[en.exerciseId] = priorByEx[en.exerciseId] || []);
      en.sets.forEach(function (set) {
        if (set.type !== "working") { set.prFlags = []; return; }
        set.prFlags = prsForSet(acc.slice(), set);
        acc.push(set);
      });
    });
  }

  // Full deterministic restamp — after editing/deleting a past session.
  function recomputeAllPRs(state) {
    var ordered = (state.sessions || []).slice()
      .filter(countsForHistory)
      .sort(function (a, b) { return a.startedAt < b.startedAt ? -1 : (a.startedAt > b.startedAt ? 1 : 0); });
    var acc = {};
    ordered.forEach(function (s) {
      s.entries.forEach(function (en) {
        var a = (acc[en.exerciseId] = acc[en.exerciseId] || []);
        en.sets.forEach(function (set) {
          if (set.type !== "working") { set.prFlags = []; return; }
          set.prFlags = prsForSet(a.slice(), set);
          a.push(set);
        });
      });
    });
    // sessions not counted for history keep whatever flags they had; clear them
    (state.sessions || []).forEach(function (s) {
      if (countsForHistory(s)) return;
      s.entries.forEach(function (en) { en.sets.forEach(function (set) { set.prFlags = []; }); });
    });
  }

  function priorSetsLive(state, exerciseId, activeEntry, upToIndex) {
    var out = [];
    (state.sessions || []).forEach(function (s) {
      if (!countsForHistory(s)) return;
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
          prs.push({
            exerciseId: en.exerciseId, weightKg: set.weightKg, reps: set.reps,
            flags: set.prFlags.slice(), label: prLabel(set.prFlags, set.weightKg)
          });
        }
      });
    });
    return prs;
  }

  // ---- progression suggestion --------------------------------------
  function loadIncrement(ex, slot) {
    if (slot && slot.loadIncrementKg != null) return slot.loadIncrementKg;
    if (ex && ex.defaultLoadIncrementKg != null) return ex.defaultLoadIncrementKg;
    return (ex && ex.equipment === "dumbbell") ? 2 : 2.5;
  }

  // tone: "push" | "hold" | "back" | "none"; confidence: "ok" | "low" | "none"
  function overloadSuggestion(state, exerciseId, slot) {
    var ex = exerciseById(state, exerciseId);
    var lp = lastPerformance(state, exerciseId);
    var repLow = slot ? slot.repLow : 8;
    var repHigh = slot ? slot.repHigh : 12;
    var rirTarget = slot ? slot.rir : 2;
    var span = repLow === repHigh ? (repLow + " reps") : (repLow + "–" + repHigh + " reps");

    if (!lp) {
      return {
        tone: "none", confidence: "none",
        headline: "First recorded performance",
        detail: "Pick a weight you can hold for " + span + " with about " + rirTarget + " left in reserve, then log it — that's your baseline."
      };
    }

    var sets = workingSets(lp.sets);
    if (!sets.length) sets = lp.sets.slice();
    var missingRir = sets.some(function (s) { return s.rir == null; });
    var rirs = sets.map(function (s) { return (s.rir == null) ? rirTarget : s.rir; });
    var minRir = Math.min.apply(null, rirs);
    var top = sets.slice().sort(function (a, b) { return e1rmOf(b) - e1rmOf(a); })[0];
    var atTop = sets.filter(function (s) { return round2(s.weightKg) === round2(top.weightKg); });
    var repsAtTop = Math.max.apply(null, atTop.map(function (s) { return s.reps; }));
    var totalReps = sets.reduce(function (a, s) { return a + s.reps; }, 0);
    var enoughSets = sets.length >= (slot ? Math.max(1, slot.sets - 1) : 1);
    var confidence = (missingRir || !enoughSets) ? "low" : "ok";
    var inc = loadIncrement(ex, slot);
    var allAtTop = sets.every(function (s) { return s.reps >= repHigh; });
    var anyBelowFloor = sets.some(function (s) { return s.reps < repLow; });

    var res;
    if (!anyBelowFloor && allAtTop && minRir >= rirTarget && enoughSets) {
      res = {
        tone: "push",
        headline: "Add load — " + round2(top.weightKg + inc) + " kg × " + repLow + "+",
        detail: "All sets hit " + repHigh + " reps at RIR ≥ " + rirTarget + ". Add " + inc + " kg."
      };
    } else if (!anyBelowFloor && minRir >= rirTarget - 1) {
      res = {
        tone: "hold",
        headline: "Hold " + round2(top.weightKg) + " kg — beat " + repsAtTop + " reps",
        detail: "You did " + totalReps + " total reps in range last time. Keep the weight and aim for at least " + (totalReps + 1) + "."
      };
    } else {
      res = {
        tone: "back",
        headline: "Hold " + round2(top.weightKg) + " kg — consolidate",
        detail: anyBelowFloor
          ? "A set dropped below " + repLow + " reps. Repeat this weight cleanly before adding load."
          : "Effort ran well past the RIR " + rirTarget + " target. Repeat the weight and tighten it up first."
      };
    }
    res.confidence = confidence;
    if (confidence === "low") {
      res.detail += missingRir ? "  (lower confidence — RIR wasn't logged on every set.)"
        : "  (lower confidence — fewer working sets than prescribed last time.)";
    }
    return res;
  }

  App.model = {
    epley: epley, round2: round2,
    perthTodayISO: perthTodayISO, todayISO: perthTodayISO,
    isoToDate: isoToDate, daysBetween: daysBetween,
    shortDate: shortDate, humanDate: humanDate, timeOfDay: timeOfDay, stampText: stampText,
    phaseInfo: phaseInfo,
    activeProgram: activeProgram, programById: programById, programShortName: programShortName,
    dayById: dayById, nextDay: nextDay, rotationDayInfo: rotationDayInfo,
    rotationShouldAutoAdvance: rotationShouldAutoAdvance, advanceRotationIndex: advanceRotationIndex,
    exerciseById: exerciseById, exerciseName: exerciseName, familyName: familyName,
    workingSets: workingSets, countsForHistory: countsForHistory,
    lastPerformance: lastPerformance,
    repRangeText: repRangeText, setsText: setsText, uid: uid,
    prsForSet: prsForSet, prLabel: prLabel,
    priorSetsLive: priorSetsLive,
    recomputeSessionPRs: recomputeSessionPRs, recomputeAllPRs: recomputeAllPRs,
    collectSessionPRs: collectSessionPRs,
    overloadSuggestion: overloadSuggestion, loadIncrement: loadIncrement
  };
})();
