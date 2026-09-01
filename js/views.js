/* Screens. Each returns a .screen node; app.js swaps it in and appends the
   tab bar. Re-render happens on discrete actions (never mid-keystroke), so
   in-progress input for the current exercise is held in `draft`. */

window.App = window.App || {};
(function () {
  var el = App.ui.el, icon = App.ui.icon, M = App.model, S = App.store, U = App.util;

  function render() { return App.render(); }
  var draft = {};              // entryId -> { weight, reps, rir, type }
  var detailEdit = null;       // sessionId currently in edit mode, or null

  // ---- shell helpers --------------------------------------------------
  function navbar(opts) {
    opts = opts || {};
    return el("div", { class: "navbar" }, [
      opts.lead
        ? el("button", { class: "lead", type: "button", onclick: opts.lead.onClick }, [icon("chev", 18), opts.lead.label])
        : el("span", {}),
      el("span", { class: "navtitle", text: opts.title || "" }),
      opts.trail
        ? el("button", { class: "trail", type: "button", onclick: opts.trail.onClick, text: opts.trail.label })
        : el("span", {})
    ]);
  }
  function screen(navOpts, nodes, largeTitle, sub) {
    if (largeTitle) navOpts = { lead: navOpts && navOpts.lead, trail: navOpts && navOpts.trail };
    var content = el("div", { class: "content" });
    if (largeTitle) content.appendChild(el("h1", { class: "largetitle" },
      [largeTitle, sub ? el("span", { class: "sub", text: sub }) : null]));
    (nodes || []).forEach(function (n) { if (n) content.appendChild(n); });
    return el("div", { class: "screen" }, [navbar(navOpts), content]);
  }
  function savedLine(st) {
    var t = st.meta && st.meta.lastSuccessfulSaveAt;
    if (!t) return null;
    return el("div", { class: "savedline", text: "Saved " + M.timeOfDay(t) });
  }

  // ==================================================================
  // Today
  // ==================================================================
  function Today() {
    var st = S.get();
    var info = M.phaseInfo(st.settings);
    var pv = M.activeProgram(st);
    var nd = M.nextDay(st);
    var manual = !!st.manualDayId && st.manualDayId !== nd.dayId;
    var di = manual ? M.rotationDayInfo(st, st.manualDayId) : nd;
    var day = di.day;
    var active = st.activeSession;
    var nodes = [];

    nodes.push(el("div", { class: "muscle" }, [
      el("span", { class: "chip", text: "Phase " + info.phase + " · Wk " + info.week + (info.isDeloadWeek ? " · deload" : "") }),
      el("span", { class: "chip m", text: "Program " + M.programShortName(pv) })
    ]));

    // backup reminder
    var lb = st.meta && st.meta.lastBackupAt;
    var backupStale = st.sessions.length >= 3 && (!lb || (Date.now() - new Date(lb).getTime()) > 14 * 86400000);
    if (backupStale && !active) {
      nodes.push(el("div", { class: "notice" }, [
        icon("warn", 16),
        el("span", { text: "No backup in a while. Export a copy from More → Data & backup." })
      ]));
    }

    if (active) {
      var nSets = active.entries.reduce(function (a, e) { return a + M.workingSets(e.sets).length; }, 0);
      var nEx = active.entries.filter(function (e) { return e.sets.length; }).length;
      nodes.push(el("div", { class: "card" }, [
        el("span", { class: "eyebrow", text: "Draft session — not finished" }),
        el("div", { class: "rowb" }, [
          el("b", { text: active.dayName }),
          el("span", { class: "chip m", text: nEx + " ex · " + nSets + " sets" })
        ]),
        el("p", { class: "hint", text: "Started " + M.timeOfDay(active.startedAt) + " · " + M.shortDate(active.date) + ". It autosaves — pick up where you left off." }),
        el("button", { class: "btn primary", type: "button", onclick: function () { location.hash = "#/session"; } }, ["Resume draft"]),
        el("button", { class: "btn ghost sm", type: "button", onclick: function () { abandonActive(st); } }, ["Abandon this draft"])
      ]));
    }

    var slotRows = day.slots.map(function (slot, i) {
      var sug = M.overloadSuggestion(st, slot.defaultExerciseId, slot);
      return el("div", { class: "exrow" }, [
        el("div", { class: "exrow-name", text: (i + 1) + ".  " + M.exerciseName(st, slot.defaultExerciseId) }),
        el("div", { class: "exrow-target", text: M.repRangeText(slot) + (slot.note ? "  ·  " + slot.note : "") }),
        el("div", { class: "exrow-last" + (sug.tone === "none" ? " dim" : " sug-" + sug.tone) }, [
          sug.headline,
          sug.confidence === "low" ? el("span", { class: "conf-dot", title: "Lower confidence — tap into the session for why", text: " ●" }) : null
        ])
      ]);
    });

    nodes.push(el("div", { class: "card" }, [
      el("span", { class: "eyebrow", text: (manual ? "Manually picked · " : "Today · ") + day.name }),
      el("div", { class: "exlist" }, slotRows),
      active ? null : el("button", { class: "btn primary", type: "button",
        onclick: function () { startSession(manual ? "manual" : "scheduled"); } },
        [manual ? "Start " + shortDayName(day.name) : "Start session"])
    ]));

    if (!active) {
      nodes.push(el("div", { class: "card" }, [
        el("span", { class: "eyebrow", text: "Train a different day?" }),
        el("p", { class: "hint", text: "Picking a day here doesn't move your rotation. When you finish it, the app asks whether it should count." }),
        el("div", { class: "daypick" }, (pv.trainingDayOrder || []).map(function (dayId) {
          var d = M.dayById(pv, dayId);
          var isShown = dayId === di.dayId;
          var isScheduled = dayId === nd.dayId;
          return el("button", {
            class: "chip" + (isShown ? "" : " m"), type: "button",
            title: isScheduled ? "Next in your rotation" : "",
            onclick: function () { st.manualDayId = isScheduled ? null : dayId; S.save(); render(); }
          }, [
            isScheduled ? el("span", { class: "sched-dot", text: "●" }) : null,
            shortDayName(d ? d.name : dayId)
          ]);
        })),
        el("p", { class: "hint", text: "The green dot marks the next day in your rotation." })
      ]));
    }

    return screen({ title: "Today" }, nodes, "Today", M.humanDate(M.perthTodayISO()));
  }

  // ==================================================================
  // start / finish
  // ==================================================================
  function startSession(mode) {
    var st = S.get();
    if (st.activeSession) { location.hash = "#/session"; return; }
    var nd = M.nextDay(st);
    var dayId = (mode === "manual" && st.manualDayId) ? st.manualDayId : nd.dayId;
    var di = M.rotationDayInfo(st, dayId);
    var info = M.phaseInfo(st.settings);
    var pv = di.program;
    var now = U.nowISO();

    st.activeSession = {
      id: M.uid("s"),
      programVersionId: pv.id,
      dayId: dayId,
      dayName: di.day.name,
      startMode: (mode === "manual") ? "manual" : "scheduled",
      status: "draft",
      startedAt: now,
      endedAt: null,
      editedAt: null,
      date: U.perthDateISO(),
      phase: info.phase,
      week: info.week,
      rotationPositionSnapshot: di.dayIndex,
      advancesRotation: false,
      bodyweightAtSession: null,
      recoverySnapshot: null,
      notes: "",
      healthLogged: false,
      createdAt: now,
      updatedAt: now,
      entries: di.day.slots.map(function (slot, i) {
        var ex = M.exerciseById(st, slot.defaultExerciseId);
        return {
          id: M.uid("e"),
          planSlotId: slot.planSlotId,
          movementFamilyId: ex ? ex.movementFamilyId : null,
          prescribedExerciseId: slot.defaultExerciseId,
          exerciseId: slot.defaultExerciseId,
          altIds: (slot.allowedExerciseIds || []).filter(function (x) { return x !== slot.defaultExerciseId; }),
          slot: {
            sets: slot.sets, repLow: slot.repLow, repHigh: slot.repHigh, rir: slot.rir,
            loadIncrementKg: slot.loadIncrementKg, note: slot.note || ""
          },
          wasSwapped: false,
          substitutionReason: null,
          note: "",
          order: i,
          sets: []
        };
      })
    };
    S.save();
    location.hash = "#/session";
  }

  function abandonActive(st) {
    var as = st.activeSession;
    if (!as) return;
    var hasData = as.entries.some(function (e) { return e.sets.length; });
    if (!confirm(hasData
      ? "Abandon this draft? It's kept in History (marked abandoned) but doesn't count toward progress or your rotation."
      : "Discard this empty draft?")) return;
    App.restTimer.stop();
    if (hasData) {
      as.status = "abandoned";
      as.endedAt = U.nowISO();
      as.advancesRotation = false;
      st.sessions.push(as);
    }
    st.activeSession = null;
    draft = {};
    S.save();
    location.hash = "#/today";
    render();
  }

  function openFinishFlow(st, as) {
    var prescribed = as.entries.filter(function (e) { return e.planSlotId; });
    var withWork = function (e) { return M.workingSets(e.sets).length > 0; };
    var doneCount = prescribed.filter(withWork).length;
    var incomplete = prescribed.filter(function (e) { return !withWork(e); });
    var anySets = as.entries.some(function (e) { return e.sets.length; });

    var sh = App.ui.sheet("Finish — " + as.dayName);
    sh.body.appendChild(el("p", { class: "hint", text: doneCount + " of " + prescribed.length + " prescribed exercises logged." }));

    if (incomplete.length) {
      sh.body.appendChild(el("div", { class: "finish-missing" }, incomplete.map(function (e) {
        return el("div", { class: "finish-missing-row" }, [icon("x", 13), M.exerciseName(st, e.exerciseId)]);
      })));
    }

    if (!anySets) {
      sh.body.appendChild(el("p", { class: "hint", text: "Nothing logged yet — nothing to save." }));
      sh.body.appendChild(el("button", { class: "btn ghost", type: "button", onclick: sh.close }, ["Keep editing"]));
      sh.open(); return;
    }

    sh.body.appendChild(el("button", { class: "btn primary", type: "button", onclick: function () {
      sh.close(); finalize(st, as, "completed");
    } }, [incomplete.length ? "Complete anyway" : "Complete"]));

    if (incomplete.length) {
      sh.body.appendChild(el("button", { class: "btn ghost", type: "button", onclick: function () {
        sh.close(); finalize(st, as, "partial");
      } }, ["Finish as partial"]));
    }
    sh.body.appendChild(el("button", { class: "btn ghost sm", type: "button", onclick: sh.close }, ["Keep editing"]));
    sh.open();
  }

  function finalize(st, as, status) {
    var pv = M.activeProgram(st);
    var order = pv.trainingDayOrder || [];
    var curIdx = as.rotationPositionSnapshot;
    var nextName = (M.dayById(pv, order[(curIdx + 1) % order.length]) || {}).name || "next day";
    var curName = (M.dayById(pv, order[curIdx % order.length]) || {}).name || "this day";
    var autoAdvance = M.rotationShouldAutoAdvance(as.startMode, status);

    function commit(advance) {
      App.restTimer.stop();
      as.status = status;
      as.endedAt = U.nowISO();
      as.advancesRotation = advance;
      as.updatedAt = U.nowISO();
      as.entries = as.entries.filter(function (e) { return e.sets.length > 0 || e.planSlotId; });
      M.recomputeSessionPRs(st, as);
      var prs = M.collectSessionPRs(st, as);

      var prevRotationIndex = st.rotationIndex;
      var prevManualDayId = st.manualDayId;
      if (advance) st.rotationIndex = M.advanceRotationIndex(order.length, curIdx);
      st.manualDayId = null;
      st.sessions.push(as);
      st.activeSession = null;
      draft = {};
      App.lastFinished = { sessionId: as.id, prevRotationIndex: prevRotationIndex, prevManualDayId: prevManualDayId, ts: Date.now() };
      S.save();
      location.hash = "#/history";
      render();
      showFinishSummary(st, as, prs, advance, nextName);
    }

    if (autoAdvance) { commit(true); return; }

    var sh = App.ui.sheet("Rotation");
    sh.body.appendChild(el("p", { class: "hint", text:
      "You " + (as.startMode === "manual" ? "manually picked " : "") + curName +
      ". Count this as your rotation session so the next scheduled day becomes " + nextName + "?" }));
    sh.body.appendChild(el("button", { class: "btn primary", type: "button", onclick: function () { sh.close(); commit(true); } }, ["Yes, advance to " + nextName.replace(/^Upper · /, "")]));
    sh.body.appendChild(el("button", { class: "btn ghost", type: "button", onclick: function () { sh.close(); commit(false); } }, ["No, keep rotation where it is"]));
    sh.open();
  }

  function showFinishSummary(st, session, prs, advanced, nextName) {
    var sh = App.ui.sheet(prs.length ? (prs.length + (prs.length === 1 ? " new PR" : " new PRs")) : "Session saved");
    sh.body.appendChild(el("p", { class: "hint", text:
      session.dayName + " · " + M.shortDate(session.date) + " · " + capitalize(session.status) +
      (advanced ? " · rotation → " + nextName.replace(/^Upper · /, "") : " · rotation unchanged") }));
    prs.forEach(function (p) {
      var all = M.prAllLabels(p.flags, p.weightKg);
      sh.body.appendChild(el("div", { class: "pr-line" }, [
        icon("trophy", 18),
        el("div", {}, [
          el("div", { class: "pr-line-name", text: M.exerciseName(st, p.exerciseId) }),
          el("div", { class: "pr-line-detail", text: p.weightKg + " kg × " + p.reps + "  ·  " + all[0] }),
          all.length > 1 ? el("div", { class: "pr-line-extra", text: "also: " + all.slice(1).join(", ") }) : null
        ])
      ]));
    });
    sh.body.appendChild(el("button", { class: "btn primary", type: "button", onclick: function () { sh.close(); location.hash = "#/history"; } }, ["Done"]));
    sh.body.appendChild(el("button", { class: "btn ghost sm", type: "button", onclick: function () { sh.close(); undoLastFinish(); } }, ["Undo finish"]));
    sh.open();
  }

  function undoLastFinish() {
    var st = S.get();
    var lf = App.lastFinished;
    if (!lf) { App.ui.toast("Nothing to undo"); return; }
    var idx = -1;
    for (var i = 0; i < st.sessions.length; i++) if (st.sessions[i].id === lf.sessionId) idx = i;
    if (idx < 0) { App.ui.toast("That session isn't here anymore"); App.lastFinished = null; return; }
    if (st.activeSession) { App.ui.toast("Finish or abandon the current draft first"); return; }
    var s = st.sessions.splice(idx, 1)[0];
    s.status = "draft";
    s.endedAt = null;
    s.advancesRotation = false;
    s.updatedAt = U.nowISO();
    st.activeSession = s;
    st.rotationIndex = lf.prevRotationIndex;
    st.manualDayId = lf.prevManualDayId;
    M.recomputeAllPRs(st);
    App.lastFinished = null;
    S.save();
    location.hash = "#/session";
    render();
    App.ui.toast("Back to draft");
  }
  function undoAvailable() {
    return App.lastFinished && (Date.now() - App.lastFinished.ts) < 10 * 60000;
  }

  // ==================================================================
  // Session (active draft)
  // ==================================================================
  function Session() {
    var st = S.get();
    var as = st.activeSession;
    if (!as) {
      return screen({ title: "Session" }, [
        el("div", { class: "card empty" }, [
          el("p", { text: "No draft in progress." }),
          el("button", { class: "btn primary", type: "button", onclick: function () { location.hash = "#/today"; } }, ["Go to Today"])
        ])
      ], "Session");
    }

    var nodes = [];
    nodes.push(el("div", { class: "muscle" }, [
      el("span", { class: "chip", text: "Phase " + as.phase + " · Wk " + as.week }),
      el("span", { class: "chip m", text: "Program " + M.programShortName(M.activeProgram(st)) }),
      as.startMode === "manual" ? el("span", { class: "chip m", text: "manual pick" }) : null
    ]));
    var sl = savedLine(st); if (sl) nodes.push(sl);

    as.entries.forEach(function (entry) { nodes.push(exerciseCard(st, as, entry)); });

    nodes.push(el("button", { class: "btn ghost", type: "button", onclick: function () { addExercise(st, as); } },
      [icon("plus", 16), " Add exercise"]));

    nodes.push(el("div", { class: "finishbar" }, [
      el("button", { class: "btn primary", type: "button", onclick: function () { openFinishFlow(st, as); } }, ["Finish & save"]),
      el("button", { class: "btn ghost sm", type: "button", onclick: function () { abandonActive(st); } }, ["Abandon draft"]),
      el("p", { class: "hint", text: "Autosaves after every set. “Save to Apple Health” arrives in Stage 7." })
    ]));

    return screen({ title: as.dayName, lead: { label: "Today", onClick: function () { location.hash = "#/today"; } } }, nodes);
  }

  function getDraft(entry) {
    if (!draft[entry.id]) {
      var lastLogged = entry.sets[entry.sets.length - 1];
      var lp = M.lastPerformance(S.get(), entry.exerciseId, S.get().activeSession && S.get().activeSession.id);
      var firstLast = lp && (M.workingSets(lp.sets)[0] || lp.sets[0]);
      var base = lastLogged || firstLast || null;
      draft[entry.id] = {
        weight: base ? String(base.weightKg) : "",
        reps: base ? String(base.reps) : String(entry.slot ? entry.slot.repLow : 8),
        rir: base && base.rir != null ? base.rir : (entry.slot ? entry.slot.rir : 2),
        type: "working"
      };
    }
    return draft[entry.id];
  }

  function stepper(input, step) {
    function bump(delta) {
      var cur = parseFloat(input.value);
      if (isNaN(cur)) cur = 0;
      var next = Math.round((cur + delta) * 100) / 100;
      if (next < 0) next = 0;
      input.value = String(next);
      input.dispatchEvent(new Event("input"));
    }
    return el("div", { class: "stepper" }, [
      el("button", { type: "button", "aria-label": "decrease", onclick: function () { bump(-step); } }, [icon("minus", 18)]),
      input,
      el("button", { type: "button", "aria-label": "increase", onclick: function () { bump(step); } }, [icon("plus", 18)])
    ]);
  }

  function exerciseCard(st, as, entry) {
    var d = getDraft(entry);
    var ex = M.exerciseById(st, entry.exerciseId);
    // always include the prescribed exercise so a swap can be undone
    var opts = [entry.prescribedExerciseId, entry.exerciseId].concat(entry.altIds || [])
      .filter(function (v, i, a) { return v && a.indexOf(v) === i; });
    var swapBtn = opts.length > 1
      ? el("button", { class: "swapbtn", type: "button", "aria-label": "swap exercise", onclick: function () { swapExercise(st, entry, opts); } }, [icon("swap", 16)])
      : null;

    var last = M.lastPerformance(st, entry.exerciseId, as.id);
    var sug = M.overloadSuggestion(st, entry.exerciseId, entry.slot);

    var setList = entry.sets.length ? el("div", { class: "setlog" }, entry.sets.map(function (s, i) {
      var prl = M.prLabel(s.prFlags, s.weightKg);
      var tag = s.type === "warmup" ? "W" : (s.type === "drop" ? "D" : String(workingIndex(entry.sets, i)));
      return el("div", { class: "setlogrow" + (s.type !== "working" ? " aux" : "") }, [
        el("span", { class: "n", text: tag }),
        el("span", { class: "sv", text: s.weightKg + " kg × " + s.reps }),
        el("span", { class: "rir", text: s.rir == null ? "" : "RIR " + s.rir }),
        prl ? el("span", { class: "pr-tag", text: "▲ " + prl }) : null,
        el("button", { class: "del", type: "button", "aria-label": "delete set", onclick: function () {
          entry.sets.splice(i, 1); reindexSets(entry); as.updatedAt = U.nowISO(); S.save(); render();
        } }, [icon("x", 14)])
      ]);
    })) : null;

    var wInput = el("input", { class: "num", inputmode: "decimal", value: d.weight, "aria-label": "weight in kg",
      oninput: function (e) { d.weight = e.target.value; } });
    var rInput = el("input", { class: "num", inputmode: "numeric", value: d.reps, "aria-label": "reps",
      oninput: function (e) { d.reps = e.target.value; } });

    var typeSeg = el("div", { class: "seg tiny" }, [["working", "Working"], ["warmup", "Warm-up"], ["drop", "Drop set"]].map(function (t) {
      return el("button", { class: "segb" + (d.type === t[0] ? " on" : ""), type: "button", text: t[1],
        onclick: function () { d.type = t[0]; render(); } });
    }));

    var rirRow = d.type === "working"
      ? el("div", { class: "lf" }, [el("span", { class: "lflbl", text: "Reps in reserve" }),
          el("div", { class: "seg" }, [0, 1, 2, 3, 4].map(function (v) {
            return el("button", { class: "segb" + (v === d.rir ? " on" : ""), type: "button", text: String(v),
              onclick: function () { d.rir = v; render(); } });
          }))])
      : el("p", { class: "hint", text: (d.type === "warmup" ? "Warm-up" : "Drop") + " sets aren't counted for suggestions or PRs." });

    function commitSet(weightKg, reps, rir, type) {
      var set = {
        id: M.uid("set"), order: entry.sets.length, type: type,
        weightKg: weightKg, reps: reps, rir: type === "working" ? (rir == null ? null : rir) : null,
        loggedAt: U.nowISO(), note: null, e1rm: M.epley(weightKg, reps), prFlags: []
      };
      if (set.type === "working") {
        set.prFlags = M.prsForSet(M.priorSetsLive(st, entry.exerciseId, entry, entry.sets.length), set);
      }
      entry.sets.push(set);
      as.updatedAt = U.nowISO();
      S.save(); render();
      if (set.type === "working") App.restTimer.start(st.settings.restTimerDefaultSec || 150);
      if (set.prFlags.length) {
        var all = M.prAllLabels(set.prFlags, weightKg);
        App.ui.toast("New PR · " + all.join(" · "));
      }
    }

    var logBtn = el("button", { class: "btn primary sm", type: "button", onclick: function () {
      var w = parseFloat(d.weight), r = parseInt(d.reps, 10);
      if (isNaN(w) || w < 0) { App.ui.toast("Enter a weight"); return; }
      if (isNaN(r) || r < 1) { App.ui.toast("Enter reps"); return; }
      commitSet(w, r, d.rir, d.type);
    } }, ["Log " + (d.type === "working" ? "set" : d.type === "warmup" ? "warm-up" : "drop set")]);

    // one-tap repeat of the set you just logged — the most common action
    var lastLogged = entry.sets[entry.sets.length - 1];
    var repeatBtn = lastLogged ? el("button", { class: "btn ghost sm", type: "button", onclick: function () {
      commitSet(lastLogged.weightKg, lastLogged.reps, lastLogged.rir, lastLogged.type);
    } }, ["Repeat " + lastLogged.weightKg + " × " + lastLogged.reps]) : null;

    var conf = M.confidenceText(sug.confidence, sug.confidenceReasons);

    return el("div", { class: "card ex" }, [
      el("div", { class: "ex-head" }, [
        el("button", { class: "ex-name-btn", type: "button", onclick: function () { exerciseOptions(st, as, entry); } },
          [el("span", { class: "ex-name", text: ex ? ex.name : entry.exerciseId }), icon("chevdown", 14)]),
        swapBtn
      ]),
      el("div", { class: "ex-meta" }, [
        el("span", { class: "ex-target", text: M.repRangeText(entry.slot) }),
        entry.slot && entry.slot.note ? el("span", { class: "ex-note", text: entry.slot.note }) : null,
        entry.wasSwapped ? el("span", { class: "ex-note", text: "Swapped — showing this exercise's own history" }) : null,
        entry.note ? el("span", { class: "ex-usernote", text: entry.note }) : null
      ]),
      last
        ? el("div", { class: "recall" }, [
            el("div", { class: "recall-head" }, [
              el("span", { class: "eyebrow", text: "Last time · " + M.shortDate(last.date) }),
              el("span", { class: "eyebrow", text: "RIR" })
            ]),
            el("div", { class: "recall-sets" }, last.sets.map(function (s, i) {
              return el("div", { class: "recall-row" + (s.type !== "working" ? " aux" : "") }, [
                el("span", { class: "n", text: s.type === "warmup" ? "W" : (s.type === "drop" ? "D" : String(workingIndex(last.sets, i))) }),
                el("span", { class: "sv", text: s.weightKg + " kg × " + s.reps }),
                el("span", { class: "rir", text: s.rir == null ? "–" : String(s.rir) })
              ]);
            })),
            el("div", { class: "recall-sug sug-" + sug.tone }, [
              icon(sug.tone === "back" ? "warn" : sug.tone === "none" ? "info" : "up", 16),
              el("div", {}, [
                el("div", { class: "sug-head", text: sug.headline }),
                el("div", { class: "sug-detail", text: sug.detail }),
                sug.patternNote ? el("div", { class: "sug-pattern", text: sug.patternNote }) : null,
                conf ? el("div", { class: "conf conf-" + sug.confidence }, [icon("warn", 12), conf]) : null
              ])
            ])
          ])
        : el("div", { class: "recall firsttime" }, [
            el("div", { class: "sug-head", text: sug.headline }),
            el("div", { class: "sug-detail", text: sug.detail })
          ]),
      setList,
      el("div", { class: "logform" }, [
        el("div", { class: "logfields" }, [
          el("label", { class: "lf" }, [el("span", { class: "lflbl", text: "Weight (kg)" }), stepper(wInput, M.loadIncrement(ex, entry.slot))]),
          el("label", { class: "lf" }, [el("span", { class: "lflbl", text: "Reps" }), stepper(rInput, 1)])
        ]),
        rirRow,
        typeSeg,
        logBtn,
        repeatBtn
      ])
    ]);
  }

  // Per-exercise options: load increment, a note, and what the app knows.
  function exerciseOptions(st, as, entry) {
    var ex = M.exerciseById(st, entry.exerciseId);
    var sh = App.ui.sheet(ex ? ex.name : entry.exerciseId);
    var cur = M.loadIncrement(ex, entry.slot);

    sh.body.appendChild(el("p", { class: "hint", text:
      "Movement family: " + M.familyName(st, entry.movementFamilyId) +
      " · equipment: " + (ex ? ex.equipment : "—") }));

    sh.body.appendChild(el("span", { class: "lflbl", text: "Smallest load step (kg)" }));
    sh.body.appendChild(el("div", { class: "seg wide" }, [1, 1.25, 2, 2.5, 5].map(function (v) {
      return el("button", { class: "segb" + (v === cur ? " on" : ""), type: "button", text: String(v),
        onclick: function () {
          if (ex) ex.defaultLoadIncrementKg = v;
          if (entry.slot) entry.slot.loadIncrementKg = v;
          // persist to the live program slot too, so it sticks for next time
          var pv = M.activeProgram(st);
          pv.days.forEach(function (dy) { dy.slots.forEach(function (sl) {
            if (sl.planSlotId === entry.planSlotId) sl.loadIncrementKg = v;
          }); });
          S.save(); sh.close(); render();
          App.ui.toast("Load step set to " + v + " kg");
        } });
    })));
    sh.body.appendChild(el("p", { class: "hint", text: "Used by the weight stepper and by the “add load” suggestion." }));

    var noteInput = el("input", { class: "noteinput", type: "text", value: entry.note || "",
      placeholder: "Note for this exercise today (setup, cues, niggles)",
      oninput: function (e) { entry.note = e.target.value; } });
    sh.body.appendChild(noteInput);
    sh.body.appendChild(el("button", { class: "btn primary", type: "button", onclick: function () {
      as.updatedAt = U.nowISO(); S.save(); sh.close(); render();
    } }, ["Done"]));
    sh.open();
  }

  function workingIndex(sets, i) {
    var n = 0;
    for (var k = 0; k <= i; k++) if (sets[k].type === "working") n++;
    return n;
  }
  function reindexSets(entry) { entry.sets.forEach(function (s, i) { s.order = i; }); }

  function swapExercise(st, entry, opts) {
    var sh = App.ui.sheet("Swap exercise");
    var fam = M.familyName(st, entry.movementFamilyId);
    sh.body.appendChild(el("p", { class: "hint", text: "Alternatives in the same family (" + fam + "). Each keeps its own weights and PRs — nothing is compared across them." }));
    var remember = el("input", { type: "checkbox", id: "swap-remember" });
    opts.forEach(function (id) {
      var isCur = id === entry.exerciseId;
      var isPrescribed = id === entry.prescribedExerciseId;
      sh.body.appendChild(el("button", {
        class: "btn ghost" + (isCur ? " primary" : ""), type: "button",
        onclick: function () {
          var ex = M.exerciseById(st, id);
          entry.exerciseId = id;
          entry.movementFamilyId = ex ? ex.movementFamilyId : entry.movementFamilyId;
          entry.wasSwapped = id !== entry.prescribedExerciseId;
          if (entry.wasSwapped && remember.checked) rememberSwap(st, entry.planSlotId, id);
          delete draft[entry.id];
          S.save(); sh.close(); render();
        }
      }, [M.exerciseName(st, id) + (isPrescribed ? "  ·  prescribed" : "")]));
    });
    sh.body.appendChild(el("label", { class: "checkrow" }, [remember, el("span", { text: "Make this the default for this slot from now on" })]));
    sh.open();
  }
  function rememberSwap(st, planSlotId, exId) {
    if (!planSlotId) return;
    var pv = M.activeProgram(st);
    pv.days.forEach(function (d) {
      d.slots.forEach(function (slot) {
        if (slot.planSlotId === planSlotId) {
          if (slot.allowedExerciseIds.indexOf(exId) < 0) slot.allowedExerciseIds.push(exId);
          slot.defaultExerciseId = exId;
        }
      });
    });
  }

  function addExercise(st, as) {
    var sh = App.ui.sheet("Add exercise");
    var groups = {};
    st.exercises.filter(function (e) { return e.active !== false; })
      .forEach(function (e) { (groups[e.muscleGroup] = groups[e.muscleGroup] || []).push(e); });
    var sel = el("select", { class: "bigselect" });
    App.MUSCLES.forEach(function (mg) {
      if (!groups[mg]) return;
      var og = el("optgroup", { label: mg.charAt(0).toUpperCase() + mg.slice(1) });
      groups[mg].sort(function (a, b) { return a.name < b.name ? -1 : 1; })
        .forEach(function (e) { og.appendChild(el("option", { value: e.id, text: e.name })); });
      sel.appendChild(og);
    });
    sh.body.appendChild(sel);
    sh.body.appendChild(el("button", { class: "btn primary", type: "button", onclick: function () {
      var id = sel.value; if (!id) return;
      var ex = M.exerciseById(st, id);
      as.entries.push({
        id: M.uid("e"), planSlotId: null, movementFamilyId: ex ? ex.movementFamilyId : null,
        prescribedExerciseId: id, exerciseId: id, altIds: [],
        slot: null, wasSwapped: false, substitutionReason: null, note: "",
        order: as.entries.length, sets: []
      });
      as.updatedAt = U.nowISO();
      S.save(); sh.close(); render();
    } }, ["Add to session"]));
    sh.open();
  }

  // ==================================================================
  // History
  // ==================================================================
  var showAbandoned = false;

  function History() {
    var st = S.get();
    var all = st.sessions.slice().sort(function (a, b) { return a.startedAt < b.startedAt ? 1 : -1; });
    var sessions = all.filter(function (s) { return showAbandoned || s.status !== "abandoned"; });
    var nodes = [];

    if (undoAvailable()) {
      nodes.push(el("div", { class: "notice ok" }, [
        icon("up", 16),
        el("span", { text: "Just finished a session." }),
        el("button", { class: "linkbtn", type: "button", onclick: undoLastFinish }, ["Undo"])
      ]));
    }

    if (!all.length) {
      nodes.push(el("div", { class: "card empty" }, [
        icon("cal", 28),
        el("p", { text: "No sessions yet. Start one from Today — it shows up here and survives a reload." })
      ]));
      return screen({ title: "History" }, nodes, "History");
    }

    var abandonedCount = all.filter(function (s) { return s.status === "abandoned"; }).length;

    sessions.forEach(function (s) {
      var sets = s.entries.reduce(function (a, e) { return a + M.workingSets(e.sets).length; }, 0);
      var exCount = s.entries.filter(function (e) { return e.sets.length; }).length;
      var prCount = M.collectSessionPRs(st, s).length;
      nodes.push(el("a", { class: "card sess", href: "#/session/" + s.id }, [
        el("div", { class: "rowb" }, [
          el("b", { text: M.shortDate(s.date) + " · " + s.dayName }),
          el("span", { class: "chip m", text: exCount + " ex · " + sets + " sets" })
        ]),
        el("div", { class: "muscle" }, [
          el("span", { class: "chip m", text: "Phase " + s.phase + " · Wk " + s.week }),
          s.status !== "completed" ? el("span", { class: "chip status-" + s.status, text: s.status }) : null,
          s.startMode === "manual" ? el("span", { class: "chip m", text: "manual" }) : null,
          prCount ? el("span", { class: "chip pr", text: "▲ " + prCount + " PR" }) : null
        ])
      ]));
    });

    if (abandonedCount) {
      nodes.push(el("button", { class: "linkbtn center", type: "button", onclick: function () { showAbandoned = !showAbandoned; render(); } },
        [showAbandoned ? "Hide abandoned" : "Show " + abandonedCount + " abandoned"]));
    }

    return screen({ title: "History" }, nodes, "History");
  }

  // ==================================================================
  // Session detail (read + edit)
  // ==================================================================
  function SessionDetail(id) {
    var st = S.get();
    var s = null;
    for (var i = 0; i < st.sessions.length; i++) if (st.sessions[i].id === id) s = st.sessions[i];
    var back = { label: "History", onClick: function () { detailEdit = null; location.hash = "#/history"; } };
    if (!s) {
      return screen({ title: "Session", lead: back }, [el("div", { class: "card empty" }, [el("p", { text: "Session not found." })])]);
    }
    var editing = detailEdit === s.id;

    var nodes = [el("div", { class: "muscle" }, [
      el("span", { class: "chip m", text: "Phase " + s.phase + " · Wk " + s.week }),
      el("span", { class: "chip m", text: "Program " + (M.programById(st, s.programVersionId) ? M.programShortName(M.programById(st, s.programVersionId)) : s.programVersionId) }),
      s.status !== "completed" ? el("span", { class: "chip status-" + s.status, text: s.status }) : null,
      s.advancesRotation ? null : el("span", { class: "chip m", text: "off-rotation" })
    ])];
    if (s.editedAt) nodes.push(el("p", { class: "hint", text: "Edited " + M.stampText(s.editedAt) }));

    var shown = editing ? s.entries : s.entries.filter(function (e) { return e.sets.length; });
    if (!shown.length) nodes.push(el("div", { class: "card empty" }, [el("p", { text: "No sets were logged in this session." })]));

    shown.forEach(function (e) {
      var rows = e.sets.map(function (x, i) {
        var prl = M.prLabel(x.prFlags, x.weightKg);
        return el("div", { class: "setlogrow" + (x.type !== "working" ? " aux" : "") }, [
          el("span", { class: "n", text: x.type === "warmup" ? "W" : x.type === "drop" ? "D" : String(workingIndex(e.sets, i)) }),
          el("span", { class: "sv", text: x.weightKg + " kg × " + x.reps }),
          el("span", { class: "rir", text: x.rir == null ? "" : "RIR " + x.rir }),
          prl ? el("span", { class: "pr-tag", text: "▲ " + prl }) : null,
          editing ? el("button", { class: "del", type: "button", onclick: function () { editSetSheet(st, s, e, i); } }, [icon("edit", 14)]) : null
        ]);
      });
      var card = [
        el("div", { class: "ex-name", text: M.exerciseName(st, e.exerciseId) + (e.wasSwapped ? "  (swapped)" : "") }),
        rows.length ? el("div", { class: "setlog" }, rows) : el("p", { class: "hint", text: "No sets" })
      ];
      if (editing) {
        card.push(el("button", { class: "linkbtn", type: "button", onclick: function () { editSetSheet(st, s, e, -1); } }, [icon("plus", 14), " Add set"]));
        card.push(el("input", { class: "noteinput", type: "text", value: e.note || "", placeholder: "Exercise note",
          oninput: function (ev) { e.note = ev.target.value; }, onchange: function () { touchSession(st, s); } }));
      }
      nodes.push(el("div", { class: "card" }, card));
    });

    if (editing) {
      nodes.push(el("input", { class: "noteinput", type: "text", value: s.notes || "", placeholder: "Session note",
        oninput: function (ev) { s.notes = ev.target.value; }, onchange: function () { touchSession(st, s); } }));
      nodes.push(el("button", { class: "btn primary", type: "button", onclick: function () {
        touchSession(st, s); detailEdit = null; render(); App.ui.toast("Changes saved");
      } }, ["Done editing"]));
    } else if (s.notes) {
      nodes.push(el("div", { class: "card" }, [el("span", { class: "eyebrow", text: "Note" }), el("p", { text: s.notes })]));
    }

    return screen({
      title: M.shortDate(s.date), lead: back,
      trail: { label: editing ? "" : "Edit", onClick: function () { detailEdit = editing ? null : s.id; render(); } }
    }, nodes);
  }

  function touchSession(st, s) {
    s.updatedAt = U.nowISO();
    s.editedAt = U.nowISO();
    M.recomputeAllPRs(st);
    S.save();
  }

  function editSetSheet(st, s, entry, index) {
    var adding = index < 0;
    var base = adding ? (entry.sets[entry.sets.length - 1] || { weightKg: "", reps: entry.slot ? entry.slot.repLow : 8, rir: entry.slot ? entry.slot.rir : 2, type: "working" }) : entry.sets[index];
    var d = { weight: String(base.weightKg), reps: String(base.reps), rir: base.rir, type: base.type || "working" };
    var sh = App.ui.sheet(adding ? "Add set" : "Edit set");
    var w = el("input", { class: "num", inputmode: "decimal", value: d.weight, oninput: function (e) { d.weight = e.target.value; } });
    var r = el("input", { class: "num", inputmode: "numeric", value: d.reps, oninput: function (e) { d.reps = e.target.value; } });
    sh.body.appendChild(el("div", { class: "logfields" }, [
      el("label", { class: "lf" }, [el("span", { class: "lflbl", text: "Weight (kg)" }), stepper(w, 2.5)]),
      el("label", { class: "lf" }, [el("span", { class: "lflbl", text: "Reps" }), stepper(r, 1)])
    ]));
    var rirSeg = el("div", { class: "seg" }, [0, 1, 2, 3, 4].map(function (v) {
      return el("button", { class: "segb" + (v === d.rir ? " on" : ""), type: "button", text: String(v), onclick: function () { d.rir = v; [].forEach.call(rirSeg.children, function (c, i) { c.classList.toggle("on", i === v); }); } });
    }));
    var typeSeg = el("div", { class: "seg tiny" }, [["working", "Working"], ["warmup", "Warm-up"], ["drop", "Drop"]].map(function (t) {
      return el("button", { class: "segb" + (d.type === t[0] ? " on" : ""), type: "button", text: t[1], onclick: function () { d.type = t[0]; [].forEach.call(typeSeg.children, function (c) { c.classList.toggle("on", c.textContent === t[1]); }); } });
    }));
    sh.body.appendChild(el("div", { class: "lf" }, [el("span", { class: "lflbl", text: "RIR (working sets)" }), rirSeg]));
    sh.body.appendChild(typeSeg);
    sh.body.appendChild(el("button", { class: "btn primary", type: "button", onclick: function () {
      var wv = parseFloat(d.weight), rv = parseInt(d.reps, 10);
      if (isNaN(wv) || wv < 0 || isNaN(rv) || rv < 1) { App.ui.toast("Check weight and reps"); return; }
      var rec = { weightKg: wv, reps: rv, type: d.type, rir: d.type === "working" ? d.rir : null, e1rm: M.epley(wv, rv), prFlags: [] };
      if (adding) { rec.id = M.uid("set"); rec.loggedAt = U.nowISO(); rec.note = null; entry.sets.push(rec); }
      else { entry.sets[index] = Object.assign(entry.sets[index], rec); }
      reindexSets(entry);
      touchSession(st, s);
      sh.close(); render();
    } }, [adding ? "Add set" : "Save changes"]));
    if (!adding) {
      sh.body.appendChild(el("button", { class: "btn danger sm", type: "button", onclick: function () {
        entry.sets.splice(index, 1); reindexSets(entry); touchSession(st, s); sh.close(); render();
      } }, ["Delete this set"]));
    }
    sh.open();
  }

  // ==================================================================
  // More
  // ==================================================================
  function More() {
    var st = S.get();
    var set = st.settings, meta = st.meta;
    var pv = M.activeProgram(st);
    var nodes = [];

    nodes.push(el("div", { class: "card" }, [
      el("span", { class: "eyebrow", text: "Program" }),
      el("div", { class: "rowb" }, [el("span", { text: "Version" }), el("b", { text: pv.name })]),
      el("div", { class: "rowb" }, [el("span", { text: "Effective from" }), el("b", { text: pv.effectiveStartDate })]),
      el("div", { class: "rowb" }, [el("span", { text: "Phase length" }), el("b", { text: set.phaseLengthWeeks + " weeks" })]),
      el("div", { class: "rowb" }, [el("span", { text: "Phase start date" }), el("b", { text: set.phaseStartDate })]),
      el("button", { class: "btn ghost sm", type: "button", onclick: function () {
        var v = prompt("Phase start date (YYYY-MM-DD) — Perth calendar. Past sessions keep their recorded phase/week.", set.phaseStartDate);
        if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) { set.phaseStartDate = v; S.save(); render(); }
        else if (v != null) App.ui.toast("Use the format 2026-09-01");
      } }, ["Change phase start date"])
    ]));

    nodes.push(el("div", { class: "card" }, [
      el("span", { class: "eyebrow", text: "Appearance" }),
      el("div", { class: "seg wide" }, ["auto", "light", "dark"].map(function (t) {
        return el("button", { class: "segb" + (set.theme === t ? " on" : ""), type: "button", text: capitalize(t),
          onclick: function () { set.theme = t; S.save(); App.applyTheme(); render(); } });
      }))
    ]));

    nodes.push(el("div", { class: "card" }, [
      el("span", { class: "eyebrow", text: "Data & backup" }),
      el("div", { class: "rowb" }, [el("span", { text: "Last saved" }), el("b", { text: M.stampText(meta.lastSuccessfulSaveAt) })]),
      el("div", { class: "rowb" }, [el("span", { text: "Last backup" }), el("b", { text: meta.lastBackupAt ? M.stampText(meta.lastBackupAt) : "never" })]),
      el("p", { class: "hint", text: "Data lives in this browser only. Two devices = two separate datasets — export/import to move it." }),
      el("button", { class: "btn ghost sm", type: "button", onclick: exportData }, ["Export backup (JSON)"]),
      el("button", { class: "btn ghost sm", type: "button", onclick: importFlow }, ["Import backup…"]),
      el("button", { class: "btn ghost sm", type: "button", onclick: restoreFlow }, ["Restore from a local backup"]),
      el("button", { class: "btn danger sm", type: "button", onclick: function () {
        if (confirm("Erase everything and reload the seed program? A backup is taken first, but this replaces your current data.")) {
          S.resetAll(); App.applyTheme(); location.hash = "#/today"; render();
        }
      } }, ["Reset all data"])
    ]));

    nodes.push(el("div", { class: "card" }, [
      el("span", { class: "eyebrow", text: "Device" }),
      el("p", { class: "hint", text: "Mark which device is the real one for gym logging. The other is for development / reviewing backups." }),
      el("div", { class: "seg wide" }, [["mac", "Mac"], ["iphone", "iPhone"], ["unset", "Not set"]].map(function (t) {
        return el("button", { class: "segb" + (meta.sourceOfTruthDevice === t[0] ? " on" : ""), type: "button", text: t[1],
          onclick: function () { meta.sourceOfTruthDevice = t[0]; S.save(); render(); } });
      }))
    ]));

    nodes.push(el("p", { class: "hint center", text: "Coach · Stage 1.5 · schema v" + st.schemaVersion + " · " + S.appVersion }));
    return screen({ title: "More" }, nodes, "More");
  }

  function exportData() {
    var blob = new Blob([S.exportJSON()], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = el("a", { href: url, download: "coach-backup-" + M.perthTodayISO() + ".json" });
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
    S.markExported(); render();
    App.ui.toast("Backup downloaded");
  }

  function importFlow() {
    var inp = el("input", { type: "file", accept: "application/json,.json", style: "display:none" });
    inp.addEventListener("change", function () {
      var f = inp.files && inp.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        var res = S.inspectImport(String(reader.result));
        if (!res.ok) { App.ui.toast(res.fatal); return; }
        var sh = App.ui.sheet("Import backup");
        var sm = res.summary;
        sh.body.appendChild(el("div", { class: "kv" }, [
          kvRow("This file", sm.sessions + " sessions · " + sm.programVersions + " program version(s) · " + sm.exercises + " exercises"),
          kvRow("Last session", sm.lastSessionDate || "—"),
          kvRow("Your current data", S.get().sessions.length + " sessions")
        ]));
        if (res.duplicate) sh.body.appendChild(el("p", { class: "hint", text: "This looks identical to what's already on this device." }));
        (res.warnings || []).slice(0, 4).forEach(function (w) {
          sh.body.appendChild(el("p", { class: "hint warn-text", text: "⚠ " + w }));
        });
        sh.body.appendChild(el("p", { class: "hint", text: "Importing replaces everything currently in this browser. A backup of your current data is taken first." }));
        sh.body.appendChild(el("button", { class: "btn primary", type: "button", onclick: function () {
          S.applyImport(res.parsed, f.name); App.applyTheme(); detailEdit = null; sh.close();
          location.hash = "#/today"; render(); App.ui.toast("Backup imported");
        } }, ["Replace all data"]));
        sh.body.appendChild(el("button", { class: "btn ghost sm", type: "button", onclick: sh.close }, ["Cancel"]));
        sh.open();
      };
      reader.readAsText(f);
    });
    document.body.appendChild(inp); inp.click();
    setTimeout(function () { if (inp.parentNode) inp.parentNode.removeChild(inp); }, 1000);
  }

  function restoreFlow() {
    var list = S.listBackups();
    var sh = App.ui.sheet("Restore from a local backup");
    if (!list.length) { sh.body.appendChild(el("p", { class: "hint", text: "No local backups yet." })); sh.open(); return; }
    sh.body.appendChild(el("p", { class: "hint", text: "These are snapshots kept in this browser. Restoring replaces your current data (a backup is taken first)." }));
    list.forEach(function (b) {
      sh.body.appendChild(el("button", { class: "btn ghost sm", type: "button", onclick: function () {
        if (!confirm("Restore the snapshot from " + M.stampText(b.at) + "?")) return;
        var r = S.restoreBackup(b.id);
        if (!r.ok) { App.ui.toast(r.fatal); return; }
        App.applyTheme(); detailEdit = null; sh.close(); location.hash = "#/today"; render();
        App.ui.toast("Backup restored");
      } }, [M.stampText(b.at) + " · " + b.trigger + " · " + Math.round(b.sizeBytes / 1024) + " KB"]));
    });
    sh.open();
  }

  function kvRow(k, v) { return el("div", { class: "rowb" }, [el("span", { text: k }), el("b", { text: v })]); }

  // ==================================================================
  // misc
  // ==================================================================
  function Placeholder(title, msg) {
    return screen({ title: title }, [el("div", { class: "card empty" }, [el("p", { text: msg })])], title);
  }

  function MigrationRecovery() {
    var err = S.migrationError || {};
    return screen({ title: "Data recovery" }, [
      el("div", { class: "card" }, [
        el("span", { class: "eyebrow", text: "Update paused to protect your data" }),
        el("p", { text: "This build tried to upgrade your saved data and something didn't line up, so your original data has been left exactly as it was — nothing has been changed or deleted." }),
        el("p", { class: "hint", text: "Reason: " + (err.message || "unknown") }),
        el("button", { class: "btn primary", type: "button", onclick: function () {
          var blob = new Blob([S.exportMigrationOriginal() || "{}"], { type: "application/json" });
          var url = URL.createObjectURL(blob);
          var a = el("a", { href: url, download: "coach-original-" + M.perthTodayISO() + ".json" });
          document.body.appendChild(a); a.click();
          setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
        } }, ["Export my original data"]),
        el("button", { class: "btn ghost sm", type: "button", onclick: function () { location.reload(); } }, ["Reload and try again"])
      ])
    ], "Data recovery");
  }

  function capitalize(s) { return String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1); }
  function shortDayName(n) { return String(n || "").replace(/^Upper · /, ""); }

  App.views = {
    Today: Today, Session: Session, SessionDetail: SessionDetail,
    History: History, More: More, Placeholder: Placeholder,
    MigrationRecovery: MigrationRecovery
  };
})();
