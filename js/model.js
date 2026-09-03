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

  // ---- variants: which of A/B/C this phase runs --------------------------
  // A program *version* records the program itself changing, and is pinned to a
  // date so history stays attributable. A *variant* is a different axis: the
  // same program's rotating exercise selection, chosen by the phase number.
  // Phase 1 -> A, 2 -> B, 3 -> C, 4 -> A again.
  function variantForPhase(pv, phase) {
    var vs = pv && pv.variants;
    if (!vs || !vs.length) return null;
    var n = vs.length;
    return vs[(((phase - 1) % n) + n) % n];
  }

  // Returns the version with `days` swapped to the phase's variant, so every
  // existing reader of pv.days gets the right block without knowing variants
  // exist. The stored version is never mutated.
  function applyVariant(state, pv, dateIso) {
    if (!pv || !pv.variants || !pv.variants.length) return pv;
    var phase = phaseInfo(state.settings || {}, dateIso).phase;
    var v = variantForPhase(pv, phase);
    if (!v || !v.days || !v.days.length) return pv;
    var out = {};
    for (var k in pv) if (Object.prototype.hasOwnProperty.call(pv, k)) out[k] = pv[k];
    out.days = v.days;
    out.variantId = v.id;
    out.variantName = v.name;
    out.variantBlurb = v.blurb || "";
    return out;
  }

  // ---- program version in force on a given date --------------------------
  function activeProgram(state, dateIso) {
    dateIso = dateIso || perthTodayISO();
    var vs = (state.programVersions || []).slice()
      .filter(function (v) { return (v.effectiveStartDate || "0000") <= dateIso; })
      .sort(function (a, b) { return a.effectiveStartDate < b.effectiveStartDate ? 1 : -1; });
    if (vs.length) return applyVariant(state, vs[0], dateIso);
    // nothing effective yet — fall back to the flagged active one, else the first
    var byId = programById(state, state.activeProgramVersionId);
    return applyVariant(state, byId || state.programVersions[0], dateIso);
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

  // "2:30" reads faster than "150 s" when you are looking at a clock anyway.
  function restText(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    var m = Math.floor(sec / 60), r = sec % 60;
    return m ? (m + ":" + (r < 10 ? "0" : "") + r) : (r + "s");
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
  //   today      a temporary recovery-driven softening; see todayAdjustment(),
  //              which the views layer under the base target rather than into it
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

  // ---- deload week --------------------------------------------------------
  // The last week of a phase. Unlike a recovery nudge, this is not a reaction
  // to how you feel -- it is the program, so it is allowed to set the target:
  // a block that told you to add load in its own deload week would be
  // incoherent programming, not respectful of your judgement.
  //
  // What it will NOT do is quietly rewrite the prescription. Sets and reps on
  // the plan stay exactly as written; cutting the last set is said out loud and
  // left to you, so what you log is still what you actually did.
  function deloadInfo(state, dateIso) {
    var info = phaseInfo((state && state.settings) || {}, dateIso);
    if (!info.isDeloadWeek) return null;
    return {
      phase: info.phase, week: info.week,
      headline: "Deload week — the last week of phase " + info.phase,
      detail: "Hold your loads where they are and drop the last set of each exercise. " +
        "This is planned, not a setback: it is what lets the next block start fresh."
    };
  }

  // Compact view of the recommendation, for list rows and cards.
  // tone: "push" | "hold" | "back" | "none"; confidence: "ok" | "low" | "none"
  function overloadSuggestion(state, exerciseId, slot, excludeSessionId, dateIso) {
    var r = recommendation(state, exerciseId, slot, excludeSessionId);
    var dl = deloadInfo(state, dateIso);

    var tone = r.base.tone, action = r.base.action;
    var headline = r.base.headline, detail = r.base.reason;

    // Only "add load" is overridden -- if the engine already wants you to hold,
    // consolidate or back off, the deload agrees with it and there is nothing
    // to say twice.
    if (dl && action === "add-load") {
      tone = "hold";
      action = "deload-hold";
      headline = "Hold — deload week";
      detail = "You earned the increase: " + lowerFirst(r.base.reason) +
        " It is waiting for you in week 1 of the next phase.";
    }

    return {
      tone: tone,
      action: action,
      headline: headline,
      detail: detail,
      patternNote: r.base.patternNote,
      confidence: r.confidence.level,
      confidenceReasons: r.confidence.reasons,
      deload: dl,
      deloadHeld: !!(dl && r.base.action === "add-load"),
      recommendation: r
    };
  }

  function lowerFirst(t) {
    t = String(t || "");
    return t ? t.charAt(0).toLowerCase() + t.slice(1) : t;
  }

  // ---- custom exercises ---------------------------------------------------
  // The seed catalog is 56 lifts. A real gym has a machine it does not cover,
  // and without this the honest options were to lie (log it as something else)
  // or not log it, both of which corrupt the history the whole app reasons
  // from. A custom exercise is a first-class one: it swaps, it recalls, it
  // holds PRs, and it survives export/import like any other.
  var EQUIPMENT = ["barbell", "dumbbell", "machine", "cable", "smith", "bodyweight"];

  function slugifyExerciseId(name, taken) {
    var base = String(name || "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "exercise";
    var id = base, n = 2;
    while (taken[id]) { id = base + "-" + n; n++; }
    return id;
  }

  function addCustomExercise(state, d) {
    var name = String((d && d.name) || "").trim().replace(/\s+/g, " ");
    if (!name) return { ok: false, error: "Give it a name." };
    if (name.length > 60) return { ok: false, error: "That name is too long — keep it under 60 characters." };

    var existing = (state.exercises || []);
    var clash = existing.filter(function (e) {
      return e.name.toLowerCase() === name.toLowerCase();
    })[0];
    if (clash) return { ok: false, error: "You already have an exercise called " + clash.name + ".", existingId: clash.id };

    var muscleGroup = (App.MUSCLES.indexOf(d.muscleGroup) >= 0) ? d.muscleGroup : "core";
    var equipment = (EQUIPMENT.indexOf(d.equipment) >= 0) ? d.equipment : "machine";
    var taken = {};
    existing.forEach(function (e) { taken[e.id] = true; });

    var ex = {
      id: slugifyExerciseId(name, taken),
      name: name,
      muscleGroup: muscleGroup,
      equipment: equipment,
      // Optional. Set it and the exercise joins that family's swap list, so a
      // gym-specific machine can stand in for the lift it actually replaces.
      movementFamilyId: d.movementFamilyId || null,
      movementPattern: null,
      secondaryMuscles: [],
      defaultLoadIncrementKg: (d.incrementKg != null && !isNaN(d.incrementKg))
        ? Number(d.incrementKg)
        : (equipment === "dumbbell" ? 2 : 2.5),
      referenceImage: null,
      active: true,
      userNote: "",
      custom: true                       // so the UI can say where it came from
    };
    state.exercises = existing.concat([ex]);
    return { ok: true, exercise: ex };
  }

  // ---- cardio: the easy Zone 2 rides the program asks for -----------------
  // Deliberately thin. This is not a training log for cycling: it exists so the
  // one or two easy rides a week the program calls for are visible next to the
  // lifting, and so a week with none of them says so.
  var CARDIO_WEEKLY_TARGET_LOW = 1, CARDIO_WEEKLY_TARGET_HIGH = 2;

  function cardioInWeek(state, weekIndex) {
    var b = weekBounds(state.settings || {}, weekIndex);
    return (state.cardioSessions || []).filter(function (c) {
      return c && c.date >= b.start && c.date <= b.end;
    }).sort(function (a, c) { return a.date < c.date ? -1 : 1; });
  }

  function cardioSummary(state, weekIndex) {
    var list = cardioInWeek(state, weekIndex);
    var minutes = list.reduce(function (a, c) { return a + (c.minutes || 0); }, 0);
    var withHr = list.filter(function (c) { return c.avgHrBpm != null; });
    var avgHr = withHr.length
      ? Math.round(withHr.reduce(function (a, c) { return a + c.avgHrBpm; }, 0) / withHr.length)
      : null;
    var note;
    if (!list.length) note = "No easy rides logged this week. The program asks for one or two — they are optional, and skipping them is a choice rather than a failure.";
    else if (list.length < CARDIO_WEEKLY_TARGET_LOW) note = "";
    else if (list.length > CARDIO_WEEKLY_TARGET_HIGH) note = list.length + " rides — more than the program asks for. Fine if they were genuinely easy; worth a look if they are eating into how you recover for lifting.";
    else note = "";
    return {
      rides: list.length, minutes: minutes, avgHrBpm: avgHr,
      targetLow: CARDIO_WEEKLY_TARGET_LOW, targetHigh: CARDIO_WEEKLY_TARGET_HIGH,
      onTarget: list.length >= CARDIO_WEEKLY_TARGET_LOW && list.length <= CARDIO_WEEKLY_TARGET_HIGH,
      note: note, sessions: list
    };
  }

  function addCardio(state, entry) {
    var c = {
      id: uid("c"),
      date: entry.date || perthTodayISO(),
      kind: entry.kind || "bike",
      minutes: Number(entry.minutes) || 0,
      avgHrBpm: (entry.avgHrBpm === "" || entry.avgHrBpm == null) ? null : Number(entry.avgHrBpm),
      effort: entry.effort || "easy",
      note: entry.note || "",
      createdAt: U.nowISO()
    };
    state.cardioSessions = state.cardioSessions || [];
    state.cardioSessions.push(c);
    state.cardioSessions.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    return c;
  }

  function removeCardio(state, id) {
    var before = (state.cardioSessions || []).length;
    state.cardioSessions = (state.cardioSessions || []).filter(function (c) { return c.id !== id; });
    return state.cardioSessions.length !== before;
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
    var sessions = sessionsInWeek(state, weekIndex);
    var prev = sessionsInWeek(state, weekIndex - 1);
    var b = weekBounds(state.settings, weekIndex);
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
    // nutrition + body weight for this week, so the review tells the whole story
    var nut = nutritionRange(state, b.start, b.end);
    if (nut.adherence == null) missing.push("No meal checkpoints logged this week.");
    else if (nut.unloggedDays) missing.push(nut.unloggedDays + " day" + (nut.unloggedDays === 1 ? "" : "s") + " had no meals logged.");
    var weighIns = (state.bodyweights || []).filter(function (w) { return w.date >= b.start && w.date <= b.end; }).length;
    if (!weighIns) missing.push("No weigh-ins this week.");
    else if (weighIns < 4) missing.push("Only " + weighIns + " weigh-ins this week — 4 or more makes the trend readable.");
    missing.push("Recovery isn't tracked yet (Stage 6).");

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
  // True when every working set ever logged for this exercise was at 0 kg.
  function isBodyweightHistory(state, exerciseId) {
    var any = false, allZero = true;
    (state.sessions || []).forEach(function (s) {
      if (!countsForHistory(s)) return;
      s.entries.forEach(function (en) {
        if (en.exerciseId !== exerciseId) return;
        workingSets(en.sets).forEach(function (x) {
          any = true;
          if (round2(x.weightKg) !== 0) allZero = false;
        });
      });
    });
    return any && allZero;
  }

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

    /* An exercise carried entirely at bodyweight -- hanging leg raise, Nordic
       curl, an unweighted pull-up -- has an Epley e1RM of exactly zero, because
       Epley multiplies by the load. Reporting "0 kg -- Best estimated 1RM" as a
       personal record is worse than reporting nothing: it looks broken, and it
       buries the number that did move. For those, reps ARE the progression, so
       they are what gets recorded. The moment any set carries added weight the
       exercise goes back to being measured in kilos. */
    var bodyweight = all.every(function (x) { return round2(x.set.weightKg) === 0; });
    if (bodyweight) {
      var bestSet = all.reduce(function (a, x) { return x.set.reps > a.set.reps ? x : a; });
      var byDate = {};
      all.forEach(function (x) { byDate[x.date] = (byDate[x.date] || 0) + x.set.reps; });
      var bestDate = Object.keys(byDate).reduce(function (a, d) { return byDate[d] > byDate[a] ? d : a; });
      return {
        bodyweight: true,
        bestSet: { reps: bestSet.set.reps, date: bestSet.date },
        bestSession: { reps: byDate[bestDate], date: bestDate },
        totalWorkingSets: all.length
      };
    }

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

  // ---- Stage 5: nutrition adherence -------------------------------
  //
  // Each checkpoint is done / partial / skipped / not-marked. A day scores
  // 1 per done, 0.5 per partial, 0 otherwise. It is a compliance number for
  // João's own six meals — not calories, and it never pretends to be.
  var STATE_WEIGHT = { done: 1, partial: 0.5, skipped: 0, none: 0 };

  function mealPlan(state) {
    var mp = state.settings && state.settings.mealPlan;
    return (mp && mp.checkpoints && mp.checkpoints.length) ? mp : App.NUTRITION_SEED;
  }
  function checkpointCount(state) { return mealPlan(state).checkpoints.length; }

  function nutritionDay(state, dateIso) {
    var list = state.nutritionDays || [];
    for (var i = 0; i < list.length; i++) if (list[i].date === dateIso) return list[i];
    return null;
  }
  function blankNutritionDay(state, dateIso) {
    return {
      date: dateIso,
      checkpoints: mealPlan(state).checkpoints.map(function (c, i) {
        return { index: i, id: c.id, state: "none", largerPortion: false, at: null };
      })
    };
  }
  // A record is "logged" once anything at all has been marked on it.
  function dayIsLogged(rec) {
    return !!rec && (rec.checkpoints || []).some(function (c) { return c.state && c.state !== "none"; });
  }
  function dayScore(state, rec) {
    if (!rec) return 0;
    var n = checkpointCount(state);
    if (!n) return 0;
    var sum = (rec.checkpoints || []).reduce(function (a, c) {
      return a + (STATE_WEIGHT[c.state] || 0);
    }, 0);
    return Math.min(1, sum / n);
  }
  function dayCounts(state, rec) {
    var out = { done: 0, partial: 0, skipped: 0, none: 0, larger: 0 };
    var n = checkpointCount(state);
    for (var i = 0; i < n; i++) {
      var c = (rec && rec.checkpoints && rec.checkpoints[i]) || { state: "none" };
      out[c.state || "none"]++;
      if (c.largerPortion) out.larger++;
    }
    return out;
  }

  // Adherence over an arbitrary date range. Unlogged days are reported
  // separately rather than silently counted as zero — missing data should
  // reduce confidence, not manufacture a bad score.
  function nutritionRange(state, startIso, endIso) {
    var days = [];
    var todayIso = perthTodayISO();
    var d = startIso;
    var guard = 0;
    while (d <= endIso && guard++ < 400) {
      if (d <= todayIso) {
        var rec = nutritionDay(state, d);
        days.push({
          date: d, record: rec, logged: dayIsLogged(rec),
          score: dayScore(state, rec), counts: dayCounts(state, rec),
          isToday: d === todayIso
        });
      }
      d = addDays(d, 1);
    }
    var logged = days.filter(function (x) { return x.logged; });
    // today is still in progress — don't let a half-finished day drag the mean
    var scored = logged.filter(function (x) { return !x.isToday; });
    var adherence = scored.length
      ? scored.reduce(function (a, x) { return a + x.score; }, 0) / scored.length
      : null;
    return {
      days: days, elapsedDays: days.length,
      loggedDays: logged.length, scoredDays: scored.length,
      unloggedDays: days.filter(function (x) { return !x.logged && !x.isToday; }).length,
      adherence: adherence,
      coverage: days.length ? logged.length / days.length : 0
    };
  }
  function nutritionWeek(state, weekIndex) {
    var b = weekBounds(state.settings, weekIndex);
    var r = nutritionRange(state, b.start, b.end);
    r.weekIndex = weekIndex;
    r.label = weekLabel(state.settings, weekIndex);
    r.bounds = b;
    return r;
  }

  // ---- Stage 5: body weight ---------------------------------------
  function bodyweightSeries(state) {
    return (state.bodyweights || []).slice()
      .filter(function (b) { return b && b.date && typeof b.kg === "number"; })
      .sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
  }
  function latestBodyweight(state) {
    var s = bodyweightSeries(state);
    return s.length ? s[s.length - 1] : null;
  }

  // Trailing 7-day mean at each reading, so a single heavy morning doesn't
  // look like progress. Needs 3 readings in the window to plot a point.
  function rollingAverage(series, windowDays) {
    windowDays = windowDays || 7;
    return series.map(function (p) {
      var from = addDays(p.date, -(windowDays - 1));
      var win = series.filter(function (q) { return q.date >= from && q.date <= p.date; });
      if (win.length < 3) return { date: p.date, avg: null, n: win.length };
      return {
        date: p.date, n: win.length,
        avg: round2(win.reduce(function (a, q) { return a + q.kg; }, 0) / win.length)
      };
    });
  }

  // Least-squares slope over the last `windowDays`, reported in kg/week.
  function weightTrend(state, windowDays) {
    windowDays = windowDays || 21;
    var series = bodyweightSeries(state);
    if (!series.length) {
      return { sufficient: false, reasons: ["No body-weight entries yet."], readings: 0,
        slopeKgPerWeek: null, series: series, rolling: [], spanDays: 0, perWeek: 0 };
    }
    var end = series[series.length - 1].date;
    var from = addDays(end, -(windowDays - 1));
    var win = series.filter(function (p) { return p.date >= from; });
    var spanDays = daysBetween(win[0].date, win[win.length - 1].date) + 1;
    var perWeek = spanDays > 0 ? (win.length / spanDays) * 7 : 0;

    var reasons = [];
    if (spanDays < 14) reasons.push("Only " + spanDays + " days of weigh-ins — needs at least 14.");
    if (win.length < 8) reasons.push("Only " + win.length + " weigh-ins in that window — needs at least 8.");
    if (perWeek < 3) reasons.push("About " + (Math.round(perWeek * 10) / 10) + " weigh-ins a week — aim for 4 or more.");

    var slope = null;
    if (win.length >= 2) {
      var x0 = isoToDate(win[0].date).getTime();
      var n = win.length, sx = 0, sy = 0, sxy = 0, sxx = 0;
      win.forEach(function (p) {
        var x = (isoToDate(p.date).getTime() - x0) / 86400000;
        sx += x; sy += p.kg; sxy += x * p.kg; sxx += x * x;
      });
      var denom = n * sxx - sx * sx;
      if (denom !== 0) slope = ((n * sxy - sx * sy) / denom) * 7;   // kg per week
    }

    return {
      sufficient: reasons.length === 0,
      reasons: reasons,
      readings: win.length,
      spanDays: spanDays,
      perWeek: Math.round(perWeek * 10) / 10,
      slopeKgPerWeek: slope == null ? null : round2(slope),
      windowStart: win[0].date,
      windowEnd: end,
      series: series,
      window: win,
      rolling: rollingAverage(series, 7)
    };
  }

  // ---- Stage 5: the portion nudge ---------------------------------
  //
  // Deliberately conservative and single-lever. Decision order:
  //   1. enough weight data?  2. enough nutrition adherence to judge the plan?
  //   3. is the trend outside the target band?  4. has it been long enough?
  function portionAdvice(state) {
    var s = state.settings;
    var lo = s.bwTargetKgPerWeekLow, hi = s.bwTargetKgPerWeekHigh;
    var band = lo + "–" + hi + " kg/week";
    var t = weightTrend(state, 21);

    if (!t.sufficient) {
      return { status: "insufficient", tone: "none",
        headline: "Not enough weigh-ins yet",
        reason: t.reasons.join(" ") + " Weigh in most mornings under the same conditions and this will start working.",
        trend: t };
    }

    // adherence over the same window the trend was measured on
    var nut = nutritionRange(state, t.windowStart, t.windowEnd);
    if (nut.scoredDays < 7 || nut.coverage < 0.6) {
      return { status: "unknown-adherence", tone: "none",
        headline: "Trend is " + fmtSlope(t.slopeKgPerWeek) + ", but meals aren't logged enough to act on it",
        reason: "Only " + nut.scoredDays + " of the last " + nut.elapsedDays +
          " days have meal checkpoints marked. Log the checklist for a couple of weeks before changing portions.",
        trend: t, nutrition: nut };
    }
    if (nut.adherence != null && nut.adherence < 0.8) {
      return { status: "low-adherence", tone: "hold",
        headline: "Follow the current plan more consistently first",
        reason: "Meal adherence is " + Math.round(nut.adherence * 100) + "% over the last " +
          nut.scoredDays + " logged days. Your weight trend is " + fmtSlope(t.slopeKgPerWeek) +
          ", but that's hard to read while meals are being missed. Changing portions now would be guessing.",
        trend: t, nutrition: nut };
    }

    // 4. how long has it been outside the band, and by enough to matter?
    var recent = weightTrend(state, 14);
    var slope = t.slopeKgPerWeek;
    var recentSlope = recent.slopeKgPerWeek;
    var verdict = bandVerdict(slope, recentSlope, lo, hi);
    var bothLow = verdict === "low", bothHigh = verdict === "high";

    if (verdict === "in-band") {
      var edge = (slope < lo || slope > hi);
      return { status: "on-target", tone: "push",
        headline: edge ? "Near enough — hold portions" : "On target — hold portions",
        reason: "Gaining " + fmtSlope(slope) + " over " + t.spanDays + " days against your " + band +
          " band, with " + Math.round(nut.adherence * 100) + "% meal adherence. " +
          (edge ? "That's close enough to the band to be noise — nothing to change yet."
                : "Nothing to change."),
        trend: t, nutrition: nut };
    }
    if (!bothLow && !bothHigh) {
      return { status: "watch", tone: "hold",
        headline: "Outside the band, but only just started",
        reason: "The 3-week trend is " + fmtSlope(slope) + " against a " + band +
          " target, but the last fortnight doesn't agree yet (" + fmtSlope(recentSlope) +
          "). Give it another week before changing anything — one unusual week isn't a signal.",
        trend: t, nutrition: nut };
    }
    if (bothLow) {
      return { status: "increase", tone: "hold",
        headline: "Add one portion — 2 more scoops of rice at dinner",
        reason: "Gaining " + fmtSlope(slope) + " against a " + band + " target, for two weeks running, " +
          "with meals at " + Math.round(nut.adherence * 100) + "%. Make one change only: about 50 g more " +
          "cooked rice at dinner. Re-check in two weeks before touching anything else.",
        trend: t, nutrition: nut };
    }
    return { status: "decrease", tone: "back",
      headline: "Ease one portion back — half a scoop of oats",
      reason: "Gaining " + fmtSlope(slope) + " against a " + band + " target, for two weeks running. " +
        "Take about half a scoop of oats out of one of the yoghurt meals. One change, then re-check in two weeks.",
      trend: t, nutrition: nut };
  }

  /* Should the trend move portions?  Two guards, both deliberate:
     - TOLERANCE: a 0.01 kg/week miss is measurement noise, not a signal.
     - AGREEMENT: the 3-week and 2-week windows must point the same way, so a
       single odd stretch can't trigger a change on its own.
     Returns "in-band" | "low" | "high" | "mixed". */
  var BAND_TOLERANCE = 0.05;
  function bandVerdict(slopeLong, slopeShort, lo, hi) {
    if (slopeLong == null) return "in-band";
    var floor = lo - BAND_TOLERANCE, ceil = hi + BAND_TOLERANCE;
    if (slopeLong >= floor && slopeLong <= ceil) return "in-band";
    if (slopeShort == null) return "mixed";
    if (slopeLong < floor && slopeShort < floor) return "low";
    if (slopeLong > ceil && slopeShort > ceil) return "high";
    return "mixed";
  }

  function fmtSlope(v) {
    if (v == null) return "unknown";
    var s = (v >= 0 ? "+" : "") + (Math.round(v * 100) / 100);
    return s + " kg/week";
  }

  // ---- Stage 6: recovery ------------------------------------------
  //
  // Design rules, all deliberate:
  // - Baselines are YOURS. Everything is compared to your own rolling median,
  //   never a population average. "Low" means low for João.
  // - Median + MAD (median absolute deviation), not mean + SD, so one terrible
  //   night doesn't move the baseline it's being judged against.
  // - Red is reserved for a pain or illness flag YOU raised. No wearable
  //   number, however bad, produces red on its own.
  // - Nothing here cancels a session, edits history, or names a condition.
  //   It softens a suggestion and says why. You decide.
  var ENERGY = { low: -1, normal: 0, high: 0.5 };
  var SORENESS = { low: 0, moderate: -0.5, high: -1 };
  var WORKDAY = { light: 0.25, normal: 0, "very-physical": -0.5 };
  var RECOVERY_WINDOW_DAYS = 30;
  var MIN_BASELINE_OBSERVATIONS = 5;

  function median(nums) {
    if (!nums.length) return null;
    var a = nums.slice().sort(function (x, y) { return x - y; });
    var m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  // Median absolute deviation — a robust stand-in for standard deviation.
  function mad(nums, med) {
    if (!nums.length) return null;
    if (med == null) med = median(nums);
    return median(nums.map(function (x) { return Math.abs(x - med); }));
  }

  function subjectiveScore(c) {
    if (!c) return null;
    return (ENERGY[c.energy] == null ? 0 : ENERGY[c.energy]) +
      (SORENESS[c.soreness] == null ? 0 : SORENESS[c.soreness]) +
      (WORKDAY[c.workdayLoad] == null ? 0 : WORKDAY[c.workdayLoad]);
  }

  function checkinFor(state, dateIso) {
    var list = state.readinessCheckins || [];
    for (var i = list.length - 1; i >= 0; i--) if (list[i].date === dateIso) return list[i];
    return null;
  }
  function recoveryReadingFor(state, dateIso) {
    var list = state.recoveryReadings || [];
    for (var i = list.length - 1; i >= 0; i--) if (list[i].date === dateIso) return list[i];
    return null;
  }

  // Your own normal for one metric, from the days BEFORE the one being judged.
  function baselineFor(values) {
    var med = median(values);
    var spread = mad(values, med);
    // a flat history gives MAD 0; fall back to a small floor so a single
    // point below the median doesn't instantly read as "unusually low"
    return { median: med, mad: spread, n: values.length };
  }
  function recoveryBaselines(state, beforeDateIso) {
    var from = addDays(beforeDateIso, -RECOVERY_WINDOW_DAYS);
    var checkins = (state.readinessCheckins || []).filter(function (c) {
      return c.date < beforeDateIso && c.date >= from;
    });
    var readings = (state.recoveryReadings || []).filter(function (r) {
      return r.date < beforeDateIso && r.date >= from;
    });
    function nums(list, key) {
      return list.map(function (x) { return x[key]; })
        .filter(function (v) { return typeof v === "number" && isFinite(v); });
    }
    return {
      windowDays: RECOVERY_WINDOW_DAYS,
      subjective: baselineFor(checkins.map(subjectiveScore).filter(function (v) { return v != null; })),
      hrvMs: baselineFor(nums(readings, "hrvMs")),
      restingHrBpm: baselineFor(nums(readings, "restingHrBpm")),
      sleepHours: baselineFor(nums(readings, "sleepHours"))
    };
  }

  // Is today's value meaningfully off your own normal?
  // betterWhenHigher: +1 for HRV and sleep (more is better), -1 for resting
  // heart rate (more is worse). `delta` always comes out negative when the
  // reading is worse than your usual, whichever way the metric runs.
  function compareToBaseline(value, base, betterWhenHigher) {
    if (value == null || !base || base.median == null || base.n < MIN_BASELINE_OBSERVATIONS) return null;
    var spread = base.mad || 0;
    var floor = Math.max(spread, Math.abs(base.median) * 0.04);   // never trip on noise
    var delta = (value - base.median) * betterWhenHigher;         // negative = worse
    return {
      value: value, median: round2(base.median), n: base.n,
      delta: round2(delta),
      low: delta < -floor,                                        // "low for you"
      pct: base.median ? Math.round(Math.abs(value - base.median) / Math.abs(base.median) * 100) : null
    };
  }

  var SORENESS_LABEL = { low: "low", moderate: "moderate", high: "high" };
  var WORKDAY_LABEL = { light: "light", normal: "normal", "very-physical": "very physical" };

  /* Readiness for one day.
     status: "green" | "amber" | "red" | "unknown"
     confidence: "ok" | "learning" | "none"  */
  function readiness(state, dateIso) {
    dateIso = dateIso || perthTodayISO();
    var c = checkinFor(state, dateIso);
    var r = recoveryReadingFor(state, dateIso);

    if (!c && !r) {
      return {
        status: "unknown", confidence: "none", date: dateIso,
        headline: "No check-in today",
        detail: "Ten seconds of energy, soreness and how physical work was, and the app can tell you whether today's targets still make sense.",
        signals: [], checkin: null, reading: null, flags: []
      };
    }

    var base = recoveryBaselines(state, dateIso);
    var signals = [], flags = [];

    if (c) {
      var score = subjectiveScore(c);
      var cmp = compareToBaseline(score, base.subjective, 1);
      signals.push({
        key: "subjective", label: "How you feel",
        text: "energy " + c.energy + ", soreness " + (SORENESS_LABEL[c.soreness] || c.soreness) +
          ", work " + (WORKDAY_LABEL[c.workdayLoad] || c.workdayLoad),
        low: cmp ? cmp.low : (c.energy === "low" && c.soreness === "high"),
        comparison: cmp,
        absolute: (c.energy === "low" && c.soreness === "high")
      });
      if (c.painOrIllness) flags.push("pain-or-illness");
    }

    if (r) {
      [["hrvMs", "HRV", 1, " ms"], ["restingHrBpm", "Resting HR", -1, " bpm"], ["sleepHours", "Sleep", 1, " h"]]
        .forEach(function (m) {
          var v = r[m[0]];
          if (v == null) return;
          var cmp2 = compareToBaseline(v, base[m[0]], m[2]);
          signals.push({
            key: m[0], label: m[1], text: v + m[3],
            low: cmp2 ? cmp2.low : false, comparison: cmp2, absolute: false
          });
        });
    }

    var comparable = signals.filter(function (s) { return s.comparison; });
    var lowCount = signals.filter(function (s) { return s.low; }).length;
    var confidence = comparable.length ? "ok" : "learning";

    // 1. red is only ever something you flagged yourself
    if (flags.indexOf("pain-or-illness") > -1) {
      return {
        status: "red", confidence: confidence, date: dateIso,
        headline: "You flagged pain or illness",
        detail: "That's your call to make, not the app's. Nothing has been cancelled and your targets are unchanged — but if something actually hurts, training around it or taking the day is the sensible move. If it persists, see someone qualified.",
        signals: signals, checkin: c, reading: r, flags: flags
      };
    }

    // 2. amber needs either two signals off, or a clearly rough subjective day
    var subjective = signals.filter(function (s) { return s.key === "subjective"; })[0];
    var subjectiveRough = subjective && (subjective.low || subjective.absolute);
    if (lowCount >= 2 || subjectiveRough) {
      var why = signals.filter(function (s) { return s.low; }).map(function (s) {
        // the subjective score is an internal number — describe it, don't show it
        if (s.key === "subjective") return s.text;
        // keep the label as written — lowercasing turns "HRV" into "hrv"
        if (s.comparison) return s.label + " " + s.text + " against your usual " + round2(s.comparison.median);
        return s.label + " " + s.text;
      });
      if (!why.length && subjective) why = [subjective.text];
      return {
        status: "amber", confidence: confidence, date: dateIso,
        headline: "Below your normal",
        detail: (confidence === "ok"
          ? "Compared to your own last " + base.windowDays + " days: "
          : "Still learning your normal, so this is read on today's answers alone: ") +
          why.join("; ") + ". Worth easing off — but it's a nudge, not a rule.",
        signals: signals, checkin: c, reading: r, flags: flags
      };
    }

    return {
      status: "green", confidence: confidence, date: dateIso,
      headline: "Nothing unusual",
      detail: confidence === "ok"
        ? "Today reads normal against your own last " + base.windowDays + " days. Train to your targets."
        : "Today reads fine. After about " + MIN_BASELINE_OBSERVATIONS + " check-ins the app can compare against your own normal rather than just today's answers.",
      signals: signals, checkin: c, reading: r, flags: flags
    };
  }

  /* The "today" line that sits UNDER a base recommendation.
     Returns null when there is nothing to say — the base target stands alone.
     This never edits, replaces or recalculates the base recommendation. */
  function todayAdjustment(state, rec, dateIso) {
    var rd = readiness(state, dateIso);
    if (rd.status === "green" || rd.status === "unknown") return null;
    if (!rec || !rec.base) return null;

    var base = rec.base;
    if (rd.status === "red") {
      return {
        status: "red", tone: "back",
        headline: "You flagged pain or illness",
        detail: "Your target above is unchanged. Whether to train it, train around it, or skip today is yours to decide."
      };
    }

    // amber — soften, in the language of the base action
    var soft;
    if (base.action === "add-load") {
      soft = "Consider repeating " + (base.targetWeightKg != null
        ? round2(base.targetWeightKg - (base.incrementKg || 0)) + " kg" : "last session's load") +
        " instead of adding today, and stopping a rep short.";
    } else if (base.action === "hold-add-reps") {
      soft = "Consider matching last session rather than chasing the extra reps, and stopping a rep short.";
    } else if (base.action === "reduce-load" || base.action === "consolidate") {
      soft = "Today is a reasonable day to take the lighter option and keep a rep or two in reserve.";
    } else {
      soft = "Go easier than you planned and keep a rep or two in reserve.";
    }
    return {
      status: "amber", tone: "hold",
      headline: "Recovery is below your normal",
      detail: soft + " The target above is unchanged — this is a suggestion, not a change to your plan."
    };
  }

  // A compact copy to freeze into a saved session, so a later baseline shift
  // never rewrites what the app was told on the day.
  function recoverySnapshotFor(state, dateIso) {
    var rd = readiness(state, dateIso);
    if (rd.status === "unknown") return null;
    return {
      date: rd.date, status: rd.status, confidence: rd.confidence,
      checkin: rd.checkin ? {
        energy: rd.checkin.energy, soreness: rd.checkin.soreness,
        workdayLoad: rd.checkin.workdayLoad, painOrIllness: !!rd.checkin.painOrIllness
      } : null,
      reading: rd.reading ? {
        hrvMs: rd.reading.hrvMs, restingHrBpm: rd.reading.restingHrBpm, sleepHours: rd.reading.sleepHours
      } : null
    };
  }

  function recoveryCoverage(state, startIso, endIso) {
    var days = 0, checked = 0;
    var d = startIso, today = perthTodayISO(), guard = 0;
    while (d <= endIso && guard++ < 400) {
      if (d <= today) { days++; if (checkinFor(state, d) || recoveryReadingFor(state, d)) checked++; }
      d = addDays(d, 1);
    }
    return { days: days, checked: checked };
  }

  // ---- Stage 9: plate maths ---------------------------------------
  //
  // What to hang on each side of the bar. Greedy from the heaviest plate down,
  // which is what anyone actually does at the rack.
  var DEFAULT_BAR_KG = 20;
  var DEFAULT_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

  function platesFor(totalKg, barKg, availablePlates) {
    barKg = barKg == null ? DEFAULT_BAR_KG : barKg;
    var plates = (availablePlates && availablePlates.length ? availablePlates : DEFAULT_PLATES)
      .slice().sort(function (a, b) { return b - a; });

    if (totalKg == null || !isFinite(totalKg)) return { ok: false, reason: "no-target" };
    if (totalKg < barKg) {
      return { ok: false, reason: "below-bar", barKg: barKg,
        message: "That's less than the bar on its own (" + round2(barKg) + " kg)." };
    }
    var perSide = (totalKg - barKg) / 2;
    if (perSide === 0) return { ok: true, barKg: barKg, perSide: [], totalKg: totalKg, exact: true, leftoverKg: 0 };

    var remaining = perSide, out = [];
    plates.forEach(function (p) {
      while (remaining >= p - 1e-9) { out.push(p); remaining = round2(remaining - p); }
    });
    var leftover = round2(remaining);
    return {
      ok: true, barKg: barKg, perSide: out, totalKg: totalKg,
      loadedKg: round2(barKg + (perSide - leftover) * 2),
      leftoverKg: leftover,
      exact: leftover < 1e-9
    };
  }

  // "2 × 20, 1 × 5, 1 × 2.5"
  function plateText(perSide) {
    if (!perSide || !perSide.length) return "just the bar";
    var counts = [], seen = {};
    perSide.forEach(function (p) { if (!seen[p]) { seen[p] = 0; counts.push(p); } seen[p]++; });
    return counts.map(function (p) { return seen[p] + " × " + p; }).join(", ");
  }

  // ---- Stage 9: reference photos ----------------------------------
  function photoFor(exerciseId) {
    var map = App.EXERCISE_PHOTOS || {};
    var rec = map[exerciseId];
    if (!rec || !rec.images || !rec.images.length) return null;
    var src = App.EXERCISE_PHOTO_SOURCE || {};
    return {
      match: rec.match, sourceName: rec.name,
      urls: rec.images.map(function (p) { return (src.base || "") + p; }),
      licence: src.licence, source: src.name, sourceUrl: src.url
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
    mealPlan: mealPlan, checkpointCount: checkpointCount,
    nutritionDay: nutritionDay, blankNutritionDay: blankNutritionDay,
    dayIsLogged: dayIsLogged, dayScore: dayScore, dayCounts: dayCounts,
    nutritionRange: nutritionRange, nutritionWeek: nutritionWeek,
    bodyweightSeries: bodyweightSeries, latestBodyweight: latestBodyweight,
    rollingAverage: rollingAverage, weightTrend: weightTrend,
    portionAdvice: portionAdvice, fmtSlope: fmtSlope, bandVerdict: bandVerdict,
    DEFAULT_BAR_KG: DEFAULT_BAR_KG, DEFAULT_PLATES: DEFAULT_PLATES,
    platesFor: platesFor, plateText: plateText, photoFor: photoFor,
    median: median, mad: mad, subjectiveScore: subjectiveScore,
    checkinFor: checkinFor, recoveryReadingFor: recoveryReadingFor,
    recoveryBaselines: recoveryBaselines, compareToBaseline: compareToBaseline,
    readiness: readiness, todayAdjustment: todayAdjustment, deloadInfo: deloadInfo,
    addCustomExercise: addCustomExercise, EQUIPMENT: EQUIPMENT,
    cardioInWeek: cardioInWeek, cardioSummary: cardioSummary,
    addCardio: addCardio, removeCardio: removeCardio,
    recoverySnapshotFor: recoverySnapshotFor, recoveryCoverage: recoveryCoverage,
    activeProgram: activeProgram, programById: programById, programShortName: programShortName,
    variantForPhase: variantForPhase, applyVariant: applyVariant,
    dayById: dayById, nextDay: nextDay, rotationDayInfo: rotationDayInfo,
    rotationShouldAutoAdvance: rotationShouldAutoAdvance, advanceRotationIndex: advanceRotationIndex,
    exerciseById: exerciseById, exerciseName: exerciseName, familyName: familyName,
    workingSets: workingSets, countsForHistory: countsForHistory,
    lastPerformance: lastPerformance, exposures: exposures,
    repRangeText: repRangeText, setsText: setsText, uid: uid, restText: restText,
    isBodyweightHistory: isBodyweightHistory,
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
