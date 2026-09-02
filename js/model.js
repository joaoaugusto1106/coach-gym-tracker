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
    return { phase: phase, week: week, weeksIn: weeksIn, isDeloadWeek: week === len };
  }

  function addDays(iso, n) {
    var d = isoToDate(iso);
    d.setDate(d.getDate() + n);
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }

  // Absolute week index (0-based) since the phase start date — the key the
  // weekly review is built around.
  function weekIndexOf(settings, iso) {
    var d = daysBetween(settings.phaseStartDate, iso);
    return Math.floor(d / 7);                       // negative for dates before the start
  }
  function weekBounds(settings, weekIndex) {
    var start = addDays(settings.phaseStartDate, weekIndex * 7);
    return { start: start, end: addDays(start, 6) };
  }
  function weekLabel(settings, weekIndex) {
    var len = settings.phaseLengthWeeks || 6;
    if (weekIndex < 0) return "Before this block";
    return "Phase " + (Math.floor(weekIndex / len) + 1) + " · Week " + ((weekIndex % len) + 1);
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

  // Every valid (completed/partial) exposure of an EXACT exercise, newest first.
  // `sets` is every set for display; the engine filters to working sets itself.
  function exposures(state, exerciseId, excludeSessionId, limit) {
    var sessions = (state.sessions || []).slice()
      .filter(countsForHistory)
      .sort(function (a, b) { return a.startedAt < b.startedAt ? 1 : (a.startedAt > b.startedAt ? -1 : 0); });
    var out = [];
    for (var i = 0; i < sessions.length; i++) {
      var s = sessions[i];
      if (excludeSessionId && s.id === excludeSessionId) continue;
      for (var j = 0; j < s.entries.length; j++) {
        var en = s.entries[j];
        if (en.exerciseId === exerciseId && workingSets(en.sets).length) {
          out.push({
            sessionId: s.id, date: s.date, phase: s.phase, week: s.week,
            sets: en.sets, prescription: en.slot || null, planSlotId: en.planSlotId || null,
            wasSwapped: !!en.wasSwapped
          });
          break;                       // one exposure per session
        }
      }
      if (limit && out.length >= limit) break;
    }
    return out;
  }

  // Most recent valid exposure, or null.
  function lastPerformance(state, exerciseId, excludeSessionId) {
    return exposures(state, exerciseId, excludeSessionId, 1)[0] || null;
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
  // One badge is shown on the set row; the rest belong in the detail.
  function prAllLabels(flags, weightKg) {
    var out = [];
    (flags || []).forEach(function (f) {
      if (f === "weight") out.push("Heaviest ever");
      else if (f === "repsAtWeight") out.push("Most reps at " + weightKg + " kg");
      else if (f === "e1rm") out.push("Best estimated 1RM");
    });
    return out;
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

  // ---- progression engine -----------------------------------------
  function loadIncrement(ex, slot) {
    if (slot && slot.loadIncrementKg != null) return slot.loadIncrementKg;
    if (ex && ex.defaultLoadIncrementKg != null) return ex.defaultLoadIncrementKg;
    return (ex && ex.equipment === "dumbbell") ? 2 : 2.5;
  }

  function defaultSlot() { return { sets: 3, repLow: 8, repHigh: 12, rir: 2, loadIncrementKg: null }; }

  // A prescription change big enough that comparing to it would mislead.
  function prescriptionComparable(a, b) {
    if (!a || !b) return true;                       // nothing to compare against
    if (Math.abs((a.repLow || 0) - (b.repLow || 0)) > 4) return false;
    if (Math.abs((a.repHigh || 0) - (b.repHigh || 0)) > 4) return false;
    if (Math.abs((a.sets || 0) - (b.sets || 0)) > 1) return false;
    return true;
  }

  // How the load was arranged across working sets.
  // "straight" — one weight;  "top-set-backoff" — heaviest first, then lighter;
  // "varied" — anything else (e.g. ascending pyramids).
  function loadingPattern(sets) {
    var weights = sets.map(function (s) { return round2(s.weightKg); });
    var distinct = weights.filter(function (w, i, a) { return a.indexOf(w) === i; });
    if (distinct.length <= 1) return "straight";
    var maxW = Math.max.apply(null, weights);
    if (weights[0] === maxW && weights.slice(1).every(function (w) { return w <= maxW; })) return "top-set-backoff";
    return "varied";
  }

  // Summarise one exposure's working sets against a prescription.
  function analyseExposure(exposure, slot) {
    var sets = workingSets(exposure.sets);
    var weights = sets.map(function (s) { return round2(s.weightKg); });
    var topWeight = Math.max.apply(null, weights);
    var atTop = sets.filter(function (s) { return round2(s.weightKg) === topWeight; });
    var rirs = sets.map(function (s) { return (s.rir == null) ? slot.rir : s.rir; });
    return {
      sets: sets,
      count: sets.length,
      pattern: loadingPattern(sets),
      distinctWeights: weights.filter(function (w, i, a) { return a.indexOf(w) === i; }),
      topWeight: topWeight,
      backoffWeight: Math.min.apply(null, weights),
      repsAtTop: Math.max.apply(null, atTop.map(function (s) { return s.reps; })),
      totalReps: sets.reduce(function (a, s) { return a + s.reps; }, 0),
      minRir: Math.min.apply(null, rirs),
      missingRir: sets.some(function (s) { return s.rir == null; }),
      allAtTopOfRange: sets.every(function (s) { return s.reps >= slot.repHigh; }),
      anyBelowFloor: sets.some(function (s) { return s.reps < slot.repLow; }),
      enoughSets: sets.length >= Math.max(1, slot.sets - 1)
    };
  }

  function underperformed(a, slot) {
    return a.anyBelowFloor || a.minRir <= slot.rir - 2;
  }

  function kgList(ws) { return ws.map(function (w) { return round2(w) + " kg"; }).join(" / "); }

  // The full, explainable recommendation for one exercise.
  //   base       what your own training says to do next
  //   today      a temporary recovery-driven softening (Stage 6; null for now)
  //   confidence how much to trust it, and why
  function recommendation(state, exerciseId, slot, excludeSessionId) {
    slot = slot || defaultSlot();
    var ex = exerciseById(state, exerciseId);
    var inc = loadIncrement(ex, slot);
    var hist = exposures(state, exerciseId, excludeSessionId, 3);
    var last = hist[0] || null;
    var prev = hist[1] || null;
    var span = slot.repLow === slot.repHigh ? (slot.repLow + " reps") : (slot.repLow + "–" + slot.repHigh + " reps");
    var reasons = [];

    if (!last) {
      return {
        base: {
          action: "establish", tone: "none",
          headline: "First recorded performance",
          reason: "Pick a weight you can hold for " + span + " with about " + slot.rir + " left in reserve, then log it — that's your baseline.",
          targetWeightKg: null, incrementKg: inc, pattern: null, patternNote: null
        },
        confidence: { level: "none", reasons: ["No previous performance of this exact exercise."] },
        last: null, previous: null, history: hist, today: null
      };
    }

    if (!prescriptionComparable(last.prescription, slot)) {
      return {
        base: {
          action: "establish", tone: "none",
          headline: "Not enough comparable data",
          reason: "The prescription changed a lot since " + shortDate(last.date) +
            ", so last time's numbers aren't a fair target. Train to the new " + span + " at RIR " + slot.rir + " and re-baseline.",
          targetWeightKg: null, incrementKg: inc, pattern: null, patternNote: null
        },
        confidence: { level: "none", reasons: ["The prescription changed substantially since the last exposure."] },
        last: last, previous: prev, history: hist, today: null
      };
    }

    var a = analyseExposure(last, slot);
    if (a.missingRir) reasons.push("RIR wasn't logged on every working set.");
    if (!a.enoughSets) reasons.push("Only " + a.count + " of " + slot.sets + " working sets were logged.");
    var level = reasons.length ? "low" : "ok";

    // pattern note — never flatten a top-set/back-off session into one number
    var patternNote = null;
    if (a.pattern === "top-set-backoff") {
      patternNote = "Top set " + round2(a.topWeight) + " kg, back-offs at " + round2(a.backoffWeight) + " kg — keep the same shape.";
    } else if (a.pattern === "varied") {
      patternNote = "Weights varied last time (" + kgList(a.distinctWeights) + ") — the target below is for your heaviest set.";
    }

    var base;
    if (!a.anyBelowFloor && a.allAtTopOfRange && a.minRir >= slot.rir && a.enoughSets) {
      var newTop = round2(a.topWeight + inc);
      base = {
        action: "add-load", tone: "push",
        headline: "Add load — " + newTop + " kg × " + slot.repLow + "+",
        reason: "All " + a.count + " working sets reached " + slot.repHigh + " reps at RIR " + a.minRir +
          " or better. Add " + inc + " kg and clear " + slot.repLow + "+ reps.",
        targetWeightKg: newTop, targetRepsTotal: null, incrementKg: inc,
        pattern: a.pattern,
        patternNote: a.pattern === "top-set-backoff"
          ? "Add " + inc + " kg across the board: " + newTop + " kg top, " + round2(a.backoffWeight + inc) + " kg back-offs."
          : patternNote
      };
    } else if (!a.anyBelowFloor && a.minRir >= slot.rir - 1) {
      base = {
        action: "hold-add-reps", tone: "hold",
        headline: "Hold " + round2(a.topWeight) + " kg — beat " + a.repsAtTop + " reps",
        reason: "You stayed inside " + span + " but didn't reach " + slot.repHigh +
          " across the board. Keep " + round2(a.topWeight) + " kg and add reps — " + a.totalReps +
          " total working reps last time, so aim for " + (a.totalReps + 1) + "+.",
        targetWeightKg: round2(a.topWeight), targetRepsTotal: a.totalReps + 1, incrementKg: inc,
        pattern: a.pattern, patternNote: patternNote
      };
    } else if (prev && prescriptionComparable(prev.prescription, slot) &&
               underperformed(analyseExposure(prev, slot), slot) &&
               round2(analyseExposure(prev, slot).topWeight) === round2(a.topWeight)) {
      var reduced = round2(Math.max(0, a.topWeight - inc));
      base = {
        action: "reduce-load", tone: "back",
        headline: "Try " + reduced + " kg — or cut a set",
        reason: "Two sessions in a row under target at " + round2(a.topWeight) + " kg (" +
          shortDate(prev.date) + " and " + shortDate(last.date) + "). Either drop to " + reduced +
          " kg, or keep " + round2(a.topWeight) + " kg and cut to " + Math.max(1, slot.sets - 1) + " working sets.",
        targetWeightKg: reduced, targetRepsTotal: null, incrementKg: inc,
        pattern: a.pattern, patternNote: patternNote
      };
    } else {
      base = {
        action: "consolidate", tone: "back",
        headline: "Hold " + round2(a.topWeight) + " kg — consolidate",
        reason: a.anyBelowFloor
          ? "A working set dropped below " + slot.repLow + " reps. Repeat " + round2(a.topWeight) +
            " kg and get all sets back in range before adding load."
          : "Effort ran well past the RIR " + slot.rir + " target (down to RIR " + a.minRir +
            "). Repeat " + round2(a.topWeight) + " kg and tighten it up first.",
        targetWeightKg: round2(a.topWeight), targetRepsTotal: null, incrementKg: inc,
        pattern: a.pattern, patternNote: patternNote
      };
    }

    return {
      base: base,
      confidence: { level: level, reasons: reasons },
      last: last, previous: prev, history: hist, analysis: a, today: null
    };
  }

  // Compact view of the recommendation, for list rows and cards.
  // tone: "push" | "hold" | "back" | "none"; confidence: "ok" | "low" | "none"
  function overloadSuggestion(state, exerciseId, slot, excludeSessionId) {
    var r = recommendation(state, exerciseId, slot, excludeSessionId);
    return {
      tone: r.base.tone,
      action: r.base.action,
      headline: r.base.headline,
      detail: r.base.reason,
      patternNote: r.base.patternNote,
      confidence: r.confidence.level,
      confidenceReasons: r.confidence.reasons,
      recommendation: r
    };
  }

  // ---- Stage 3: volume, weekly review, per-exercise progress -------
  //
  // A "set" here is one logged WORKING set, counted once against the exercise's
  // primary muscle group. It's a tracking number, not a claim that every set
  // produces the same stimulus.
  function muscleVolume(state, sessions) {
    var out = {};
    App.MUSCLES.forEach(function (m) { out[m] = 0; });
    (sessions || []).forEach(function (s) {
      if (!countsForHistory(s)) return;
      s.entries.forEach(function (en) {
        var ex = exerciseById(state, en.exerciseId);
        var mg = (ex && ex.muscleGroup) || "core";
        out[mg] = (out[mg] || 0) + workingSets(en.sets).length;
      });
    });
    return out;
  }

  // Planned = the set counts the session's own prescription asked for.
  // Completed = working sets actually logged.
  function plannedVsCompleted(sessions) {
    var planned = 0, completed = 0;
    (sessions || []).forEach(function (s) {
      if (!countsForHistory(s)) return;
      s.entries.forEach(function (en) {
        if (en.planSlotId && en.slot && en.slot.sets) planned += en.slot.sets;
        completed += workingSets(en.sets).length;
      });
    });
    return { planned: planned, completed: completed };
  }

  function joinList(items, word) {
    if (items.length <= 1) return items.join("");
    return items.slice(0, -1).join(", ") + " " + word + " " + items[items.length - 1];
  }

  function sessionsInWeek(state, weekIndex) {
    var b = weekBounds(state.settings, weekIndex);
    return (state.sessions || []).filter(function (s) {
      return countsForHistory(s) && s.date >= b.start && s.date <= b.end;
    }).sort(function (a, b2) { return a.startedAt < b2.startedAt ? -1 : 1; });
  }

  // Everything the Week view needs, in one honest object.
  function weeklyReview(state, weekIndex) {
    var b = weekBounds(state.settings, weekIndex);
    var sessions = sessionsInWeek(state, weekIndex);
    var prev = sessionsInWeek(state, weekIndex - 1);
    var pvc = plannedVsCompleted(sessions);
    var vol = muscleVolume(state, sessions);
    var prevVol = muscleVolume(state, prev);

    var prs = [];
    sessions.forEach(function (s) {
      collectSessionPRs(state, s).forEach(function (p) {
        prs.push({ sessionId: s.id, date: s.date, exerciseId: p.exerciseId, weightKg: p.weightKg, reps: p.reps, flags: p.flags, label: p.label });
      });
    });

    // top movers: biggest estimated-1RM gain vs the previous time each was done
    var movers = [];
    var seen = {};
    sessions.forEach(function (s) {
      s.entries.forEach(function (en) {
        if (seen[en.exerciseId]) return;
        var ws = workingSets(en.sets);
        if (!ws.length) return;
        seen[en.exerciseId] = 1;
        var best = ws.reduce(function (a, x) { return Math.max(a, e1rmOf(x)); }, 0);
        var before = exposures(state, en.exerciseId, s.id).filter(function (e) { return e.date < s.date; })[0];
        if (!before) return;
        var bestBefore = workingSets(before.sets).reduce(function (a, x) { return Math.max(a, e1rmOf(x)); }, 0);
        if (!bestBefore) return;
        movers.push({ exerciseId: en.exerciseId, deltaE1rm: round2(best - bestBefore), from: round2(bestBefore), to: round2(best) });
      });
    });
    movers = movers.filter(function (m) { return Math.abs(m.deltaE1rm) >= 0.5; })
      .sort(function (a, b2) { return Math.abs(b2.deltaE1rm) - Math.abs(a.deltaE1rm); });

    // what the app couldn't see this week
    var missing = [];
    var totalWorking = 0, missingRir = 0;
    sessions.forEach(function (s) {
      s.entries.forEach(function (en) {
        workingSets(en.sets).forEach(function (x) { totalWorking++; if (x.rir == null) missingRir++; });
      });
    });
    if (missingRir) missing.push(missingRir + " of " + totalWorking + " working sets had no RIR logged.");
    var partials = sessions.filter(function (s) { return s.status === "partial"; }).length;
    if (partials) missing.push(partials + (partials === 1 ? " session was" : " sessions were") + " finished as partial.");
    missing.push("Body weight, nutrition and recovery aren't tracked yet (Stages 5 and 6).");

    // one or two practical, non-diagnostic observations
    var notes = [];
    if (!sessions.length) {
      notes.push("No sessions logged in this week.");
    } else {
      if (pvc.planned && pvc.completed / pvc.planned < 0.8) {
        notes.push("You logged " + pvc.completed + " of " + pvc.planned + " prescribed working sets — about " +
          Math.round(100 * pvc.completed / pvc.planned) + "%.");
      }
      if (missingRir > totalWorking * 0.25 && totalWorking) {
        notes.push("RIR is missing on a quarter of your sets, so several suggestions will show lower confidence.");
      }
      var dropped = App.MUSCLES.filter(function (m) { return prevVol[m] > 0 && vol[m] === 0; });
      if (dropped.length && prev.length) {
        notes.push("No " + joinList(dropped, "or") + " sets this week — you did " +
          joinList(dropped.map(function (m) { return prevVol[m] + " " + m; }), "and") + " last week.");
      }
      if (prs.length) notes.push(prs.length + (prs.length === 1 ? " personal record" : " personal records") + " this week.");
      if (!notes.length) notes.push("Nothing unusual — sets, spread and data all look normal for this week.");
    }

    return {
      weekIndex: weekIndex, label: weekLabel(state.settings, weekIndex), bounds: b,
      sessions: sessions, sessionCount: sessions.length,
      planned: pvc.planned, completed: pvc.completed,
      volume: vol, previousVolume: prevVol,
      prs: prs, movers: movers.slice(0, 3),
      missing: missing, notes: notes.slice(0, 3),
      totalWorkingSets: totalWorking, missingRirSets: missingRir
    };
  }

  // Per-exercise series for the progress view: one point per valid exposure.
  function exerciseProgress(state, exerciseId) {
    return exposures(state, exerciseId).slice().reverse().map(function (e) {
      var ws = workingSets(e.sets);
      var topWeight = ws.reduce(function (a, x) { return Math.max(a, x.weightKg); }, 0);
      var bestE1rm = ws.reduce(function (a, x) { return Math.max(a, e1rmOf(x)); }, 0);
      var atTop = ws.filter(function (x) { return round2(x.weightKg) === round2(topWeight); });
      return {
        date: e.date, sessionId: e.sessionId, phase: e.phase, week: e.week,
        topWeight: round2(topWeight), bestE1rm: round2(bestE1rm),
        repsAtTop: atTop.length ? Math.max.apply(null, atTop.map(function (x) { return x.reps; })) : 0,
        setCount: ws.length,
        totalReps: ws.reduce(function (a, x) { return a + x.reps; }, 0)
      };
    });
  }

  // Exercises that have any logged history, newest-used first.
  function exercisesWithHistory(state) {
    var seen = {}, out = [];
    (state.sessions || []).slice()
      .filter(countsForHistory)
      .sort(function (a, b) { return a.startedAt < b.startedAt ? 1 : -1; })
      .forEach(function (s) {
        s.entries.forEach(function (en) {
          if (seen[en.exerciseId] || !workingSets(en.sets).length) return;
          seen[en.exerciseId] = 1;
          out.push({ exerciseId: en.exerciseId, lastDate: s.date });
        });
      });
    return out;
  }

  // Best-ever records for one exercise, from valid sessions only.
  function exerciseRecords(state, exerciseId) {
    var all = [];
    (state.sessions || []).forEach(function (s) {
      if (!countsForHistory(s)) return;
      s.entries.forEach(function (en) {
        if (en.exerciseId !== exerciseId) return;
        workingSets(en.sets).forEach(function (x) { all.push({ set: x, date: s.date }); });
      });
    });
    if (!all.length) return null;
    var heaviest = all.reduce(function (a, x) { return x.set.weightKg > a.set.weightKg ? x : a; });
    var bestE1rm = all.reduce(function (a, x) { return e1rmOf(x.set) > e1rmOf(a.set) ? x : a; });
    var repsAtHeaviest = all.filter(function (x) { return round2(x.set.weightKg) === round2(heaviest.set.weightKg); })
      .reduce(function (a, x) { return x.set.reps > a.set.reps ? x : a; });
    return {
      heaviest: { weightKg: round2(heaviest.set.weightKg), reps: heaviest.set.reps, date: heaviest.date },
      bestE1rm: { value: round2(e1rmOf(bestE1rm.set)), weightKg: bestE1rm.set.weightKg, reps: bestE1rm.set.reps, date: bestE1rm.date },
      mostRepsAtHeaviest: { weightKg: round2(repsAtHeaviest.set.weightKg), reps: repsAtHeaviest.set.reps, date: repsAtHeaviest.date },
      totalWorkingSets: all.length
    };
  }

  function confidenceText(level, reasons) {
    if (level === "ok") return null;
    if (level === "none") return (reasons && reasons[0]) || "Not enough comparable data.";
    return "Lower confidence — " + ((reasons && reasons.join(" ")) || "incomplete data.");
  }

  App.model = {
    epley: epley, round2: round2,
    perthTodayISO: perthTodayISO, todayISO: perthTodayISO,
    isoToDate: isoToDate, daysBetween: daysBetween,
    shortDate: shortDate, humanDate: humanDate, timeOfDay: timeOfDay, stampText: stampText,
    phaseInfo: phaseInfo, addDays: addDays,
    weekIndexOf: weekIndexOf, weekBounds: weekBounds, weekLabel: weekLabel,
    muscleVolume: muscleVolume, plannedVsCompleted: plannedVsCompleted,
    sessionsInWeek: sessionsInWeek, weeklyReview: weeklyReview,
    exerciseProgress: exerciseProgress, exercisesWithHistory: exercisesWithHistory,
    exerciseRecords: exerciseRecords,
    activeProgram: activeProgram, programById: programById, programShortName: programShortName,
    dayById: dayById, nextDay: nextDay, rotationDayInfo: rotationDayInfo,
    rotationShouldAutoAdvance: rotationShouldAutoAdvance, advanceRotationIndex: advanceRotationIndex,
    exerciseById: exerciseById, exerciseName: exerciseName, familyName: familyName,
    workingSets: workingSets, countsForHistory: countsForHistory,
    lastPerformance: lastPerformance, exposures: exposures,
    repRangeText: repRangeText, setsText: setsText, uid: uid,
    prsForSet: prsForSet, prLabel: prLabel, prAllLabels: prAllLabels,
    priorSetsLive: priorSetsLive,
    recomputeSessionPRs: recomputeSessionPRs, recomputeAllPRs: recomputeAllPRs,
    collectSessionPRs: collectSessionPRs,
    recommendation: recommendation, overloadSuggestion: overloadSuggestion,
    confidenceText: confidenceText, loadIncrement: loadIncrement,
    loadingPattern: loadingPattern, analyseExposure: analyseExposure,
    prescriptionComparable: prescriptionComparable
  };
})();
