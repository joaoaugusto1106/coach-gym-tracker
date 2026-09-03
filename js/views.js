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
    ].concat(pv.variantId ? [
      el("span", { class: "chip m", text: pv.variantId + " · " + pv.variantName })
    ] : [])));

    // Name the block on the first week of a phase — the exercises have just
    // changed, and the honest thing is to say why rather than let it look like
    // a bug. Once you're into the phase it's just the chip above.
    if (pv.variantId && info.week === 1) {
      nodes.push(el("div", { class: "card" }, [
        el("span", { class: "eyebrow", text: "New block" }),
        el("p", { class: "hint", text:
          "Phase " + info.phase + " runs variant " + pv.variantId + " — " + pv.variantName + ". " +
          (pv.variantBlurb || "") + " Same four days and the same slots; the exercises and rep " +
          "ranges are what changed. Each exercise keeps its own history, so nothing is compared " +
          "across blocks that shouldn't be." })
      ]));
    }

    var dl = M.deloadInfo(st);
    if (dl) {
      nodes.push(el("div", { class: "card" }, [
        el("span", { class: "eyebrow", text: "Deload week" }),
        el("p", { class: "hint", text: dl.detail +
          " Where the app would have told you to add load, it will say hold instead — the " +
          "increase you earned is waiting in week 1 of the next phase." })
      ]));
    }

    // this device isn't the one you log on — say so before anything is typed
    var sot = st.meta && st.meta.sourceOfTruthDevice;
    if (sot && sot !== "unset" && !deviceMatchesSourceOfTruth(sot)) {
      nodes.push(el("div", { class: "notice" }, [
        icon("warn", 16),
        el("span", { text: "Your " + (sot === "iphone" ? "iPhone" : "Mac") +
          " is the source of truth. Anything you log here stays on this device — it won't reach it." })
      ]));
    }

    // compact readiness — before anything else on the screen
    var rd = M.readiness(st, M.perthTodayISO());
    nodes.push(el("button", { class: "readystrip r-" + rd.status, type: "button",
      onclick: function () { bodyTab = "recovery"; location.hash = "#/body"; } }, [
      el("span", { class: "rs-dot" }),
      el("span", { class: "rs-text" }, [
        el("b", { text: rd.status === "unknown" ? "Check in" : rd.headline }),
        el("span", { class: "rs-sub", text:
          rd.status === "unknown" ? "10 seconds — energy, soreness, how physical work was"
          : rd.status === "green" ? "Train to your targets"
          : rd.status === "red" ? "Targets unchanged — today is your call"
          : "Today's suggestions are softened" })
      ]),
      icon("chevright", 16)
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
      var wkIdx = M.weekIndexOf(st.settings, U.perthDateISO());
      var cs = M.cardioSummary(st, wkIdx);
      nodes.push(el("div", { class: "card" }, [
        el("span", { class: "eyebrow", text: "Easy rides this week" }),
        el("div", { class: "rowb" }, [
          el("span", { text: cs.rides
            ? cs.rides + (cs.rides === 1 ? " ride · " : " rides · ") + cs.minutes + " min"
            : "None yet" }),
          el("b", { class: cs.onTarget ? "up" : "", text: cs.rides + " / " + cs.targetLow + "–" + cs.targetHigh })
        ]),
        cs.sessions.length ? el("div", { class: "exlist" }, cs.sessions.map(function (c) {
          return el("button", { class: "exrow linkrow", type: "button",
            onclick: function () { cardioSheet(st, c); } }, [
            el("div", { class: "exrow-name", text: M.humanDate(c.date) + (c.note ? " · " + c.note : "") }),
            el("div", { class: "exrow-target", text: c.minutes + " min" + (c.avgHrBpm ? " · " + c.avgHrBpm + " bpm" : "") })
          ]);
        })) : null,
        el("button", { class: "btn ghost sm", type: "button",
          onclick: function () { cardioSheet(st); } }, ["Log an easy ride"]),
        el("p", { class: "hint", text: "Optional. Zone 2 means you could hold a conversation — if a ride leaves you tired for the next lifting day, it was too hard." })
      ]));

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
      // which of A/B/C this was trained under, frozen like phase/week — the
      // variant is derived from the phase, so without this a later change to
      // the phase start date would silently relabel finished sessions
      variantId: pv.variantId || null,
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
      // frozen on the day, so a later baseline shift never rewrites what the
      // app was told at the time
      recoverySnapshot: M.recoverySnapshotFor(st, U.perthDateISO()),
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
    if (M.workingSets((session.entries || []).reduce(function (a, e) { return a.concat(e.sets); }, [])).length) {
      sh.body.appendChild(el("button", { class: "btn ghost", type: "button", onclick: function () {
        sh.close(); healthSheet(st, session);
      } }, [icon("heart", 16), " Save to Apple Health"]));
    }
    sh.body.appendChild(el("button", { class: "btn primary", type: "button", onclick: function () { sh.close(); location.hash = "#/history"; } }, ["Done"]));
    sh.body.appendChild(el("button", { class: "btn ghost sm", type: "button", onclick: function () { sh.close(); undoLastFinish(); } }, ["Undo finish"]));
    sh.open();
  }

  // ==================================================================
  // Apple Health — write bridge
  // ==================================================================
  function healthSheet(st, session) {
    var H = App.health;
    var name = st.settings.healthWriteShortcutName || "Log Strength Workout";
    var mins = session.healthDurationMin || H.suggestedMinutes(session);
    var counts = H.workingSetsOf(session);
    var sh = App.ui.sheet("Save to Apple Health");

    sh.body.appendChild(el("p", { class: "hint", text:
      "This hands a summary — type, start, duration — to your “" + name + "” Shortcut, which writes it into Health. " +
      "Your sets and weights stay here, the same as every other strength app." }));

    sh.body.appendChild(el("div", { class: "kv" }, [
      kvRow("Workout", "Functional Strength Training"),
      kvRow("Date", M.humanDate(session.date) + " · " + M.timeOfDay(session.startedAt)),
      kvRow("Logged", counts.sets + " working sets · " + Math.round(counts.volumeKg).toLocaleString() + " kg total")
    ]));

    var durInput = el("input", { class: "num", inputmode: "numeric", value: String(mins),
      "aria-label": "duration in minutes", oninput: function (e) { mins = parseInt(e.target.value, 10); } });
    sh.body.appendChild(el("div", { class: "lf" }, [
      el("span", { class: "lflbl", text: "Duration (minutes)" }), stepper(durInput, 5)
    ]));
    sh.body.appendChild(el("p", { class: "hint", text: H.wasClamped(session)
      ? "The app couldn't work out a sensible length from the session's timestamps, so this is a starting guess — set it to what you actually trained."
      : "Worked out from when you started and finished. Adjust it if you left the app open, or want the sauna counted." }));

    if (!H.isSupported()) {
      sh.body.appendChild(el("div", { class: "notice" }, [
        icon("warn", 16),
        el("span", { text: "Shortcuts only exists on iPhone, iPad and Mac. On this device you can copy the summary, but nothing will reach Health." })
      ]));
    }

    sh.body.appendChild(el("button", { class: "btn primary", type: "button", onclick: function () {
      var m = parseInt(mins, 10);
      if (isNaN(m) || m < H.MIN_MINUTES || m > H.MAX_MINUTES) {
        App.ui.toast("Duration must be between " + H.MIN_MINUTES + " and " + H.MAX_MINUTES + " minutes");
        return;
      }
      session.healthDurationMin = m;
      S.save();
      var p = App.health.payload(st, session, m);
      sh.close();
      // ask AFTER the hand-off — the app can't see what Shortcuts did
      setTimeout(function () { healthConfirmSheet(st, session, p, name); }, 700);
      App.health.open(App.health.shortcutURL(name, p));
    } }, [icon("heart", 16), " Open the Shortcut"]));

    sh.body.appendChild(el("button", { class: "btn ghost sm", type: "button", onclick: function () {
      var p = App.health.payload(st, session, parseInt(mins, 10) || H.suggestedMinutes(session));
      App.health.copy(App.health.payloadText(p))
        .then(function () { App.ui.toast("Summary copied"); })
        ["catch"](function () { App.ui.toast("Couldn't copy — select it in More instead"); });
    } }, ["Copy the summary instead"]));
    sh.body.appendChild(el("button", { class: "btn ghost sm", type: "button", onclick: sh.close }, ["Not now"]));
    sh.open();
  }

  // The app cannot observe what Shortcuts did, so it asks rather than assuming.
  function healthConfirmSheet(st, session, p, name) {
    var sh = App.ui.sheet("Did it save?");
    sh.body.appendChild(el("p", { class: "hint", text:
      "The app hands the summary to Shortcuts and can't see what happened next — so this is the honest way to record it. " +
      "Check Health → Browse → Activity → Workouts if you're not sure." }));

    sh.body.appendChild(el("button", { class: "btn primary", type: "button", onclick: function () {
      session.healthLogged = true;
      session.healthLoggedAt = U.nowISO();
      session.updatedAt = U.nowISO();
      S.save(); sh.close(); render();
      App.ui.toast("Marked as saved to Health");
    } }, [icon("check", 16), " Yes, it saved"]));

    sh.body.appendChild(el("button", { class: "btn ghost", type: "button", onclick: function () {
      sh.close(); healthTroubleshootSheet(st, session, p, name);
    } }, ["No — something went wrong"]));

    sh.body.appendChild(el("button", { class: "btn ghost sm", type: "button", onclick: sh.close }, ["Ask me later"]));
    sh.open();
  }

  function healthTroubleshootSheet(st, session, p, name) {
    var sh = App.ui.sheet("Health bridge — what to check");
    sh.body.appendChild(el("ol", { class: "steps" }, [
      el("li", { text: "Is there a Shortcut called exactly “" + name + "”? The name must match, including capitals. Change it in More → Apple Health if yours is called something else." }),
      el("li", { text: "Open the Shortcut and run it once by hand. The first run is where iOS asks for permission to write to Health — that prompt can't appear while it's being launched from another app." }),
      el("li", { text: "In Health → Sharing → Apps → Shortcuts, make sure Workouts is allowed to write." }),
      el("li", { text: "If the Shortcut opened but errored, tap Copy the summary below and paste it into the Shortcut by hand to see which step fails." })
    ]));
    sh.body.appendChild(el("button", { class: "btn ghost sm", type: "button", onclick: function () {
      App.health.copy(App.health.payloadText(p))
        .then(function () { App.ui.toast("Summary copied"); })
        ["catch"](function () { App.ui.toast("Couldn't copy on this device"); });
    } }, ["Copy the summary"]));
    sh.body.appendChild(el("button", { class: "btn ghost sm", type: "button", onclick: function () {
      sh.close(); healthSheet(st, session);
    } }, ["Try again"]));
    sh.body.appendChild(el("button", { class: "btn ghost sm", type: "button", onclick: sh.close }, ["Close"]));
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
      el("p", { class: "hint", text: "Autosaves after every set. You can send the finished session to Apple Health when you save it." })
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
    // recovery sits UNDER the base target and never replaces it
    var adj = M.todayAdjustment(st, sug.recommendation, as.date);

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
            ]),
            sug.deload ? deloadBlock(sug.deload) : null,
            adj ? adjustmentBlock(adj) : null
          ])
        : el("div", { class: "recall firsttime" }, [
            el("div", { class: "sug-head", text: sug.headline }),
            el("div", { class: "sug-detail", text: sug.detail }),
            sug.deload ? deloadBlock(sug.deload) : null,
            adj ? adjustmentBlock(adj) : null
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

  /* Reference photo. Lazy-loaded from free-exercise-db, never blocking: if
     there's no signal it just doesn't appear. A "close" match says so rather
     than pretending it's the same lift. */
  function photoBlock(photo) {
    var wrap = el("div", { class: "photoblock" });
    var img = el("img", {
      class: "exphoto", src: photo.urls[0], alt: "Reference photo: " + photo.sourceName,
      loading: "lazy", decoding: "async"
    });
    img.addEventListener("error", function () { wrap.remove(); });
    wrap.appendChild(img);
    wrap.appendChild(el("div", { class: "photocap" }, [
      photo.match === "close"
        ? el("span", { class: "photomatch close", text: "Closest match: " + photo.sourceName })
        : el("span", { class: "photomatch", text: photo.sourceName }),
      el("span", { class: "photolic", text: photo.source + " · " + photo.licence })
    ]));
    return wrap;
  }

  /* Plate maths. Shown only for barbell and Smith work, where it's the thing
     you actually have to do arithmetic for at the rack. */
  function plateBlock(st, entry) {
    var barKg = (st.settings.barWeightKg == null) ? M.DEFAULT_BAR_KG : st.settings.barWeightKg;
    var lp = M.lastPerformance(st, entry.exerciseId);
    var sug = M.overloadSuggestion(st, entry.exerciseId, entry.slot);
    var start = (sug.recommendation && sug.recommendation.base.targetWeightKg) ||
      (lp && M.workingSets(lp.sets).length ? M.workingSets(lp.sets)[0].weightKg : barKg + 20);

    var wrap = el("div", { class: "plateblock" });
    var out = el("div", { class: "plateout" });
    var input = el("input", { class: "num", inputmode: "decimal", value: String(M.round2(start)),
      "aria-label": "target weight for plate maths" });

    function draw() {
      var target = parseFloat(input.value);
      var r = M.platesFor(target, barKg, st.settings.availablePlatesKg);
      out.innerHTML = "";
      if (!r.ok) {
        out.appendChild(el("p", { class: "hint", text: r.message || "Enter a target weight." }));
        return;
      }
      out.appendChild(el("div", { class: "platepills" },
        r.perSide.length
          ? r.perSide.map(function (p) { return el("span", { class: "platepill", text: String(p) }); })
          : [el("span", { class: "hint", text: "Just the bar." })]));
      out.appendChild(el("p", { class: "hint", text:
        r.perSide.length ? "Per side: " + M.plateText(r.perSide) + "  ·  bar " + M.round2(barKg) + " kg" : "" }));
      if (!r.exact) {
        out.appendChild(el("p", { class: "hint warn-text", text:
          "Can't make " + M.round2(r.totalKg) + " kg exactly with these plates — " +
          M.round2(r.loadedKg) + " kg is the closest under it." }));
      }
    }
    input.addEventListener("input", draw);

    wrap.appendChild(el("span", { class: "lflbl", text: "Plates per side" }));
    wrap.appendChild(stepper(input, M.loadIncrement(M.exerciseById(st, entry.exerciseId), entry.slot)));
    wrap.appendChild(out);
    draw();
    return wrap;
  }

  // Per-exercise options: load increment, a note, and what the app knows.
  function exerciseOptions(st, as, entry) {
    var ex = M.exerciseById(st, entry.exerciseId);
    var sh = App.ui.sheet(ex ? ex.name : entry.exerciseId);
    var cur = M.loadIncrement(ex, entry.slot);

    sh.body.appendChild(el("p", { class: "hint", text:
      "Movement family: " + M.familyName(st, entry.movementFamilyId) +
      " · equipment: " + (ex ? ex.equipment : "—") }));

    var photo = M.photoFor(entry.exerciseId);
    if (photo) sh.body.appendChild(photoBlock(photo));

    if (ex && (ex.equipment === "barbell" || ex.equipment === "smith")) {
      sh.body.appendChild(plateBlock(st, entry));
    }

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

  // The "today" line. Visually separate from the base target on purpose —
  // one is what your training says, the other is what today says.
  // Same shape as the recovery note, different tag. The deload comes from the
  // calendar, the recovery note from how you feel; both sit UNDER the target
  // rather than replacing the line above them.
  function deloadBlock(dl) {
    return el("div", { class: "todayadj adj-amber" }, [
      icon("info", 15),
      el("div", {}, [
        el("div", { class: "adj-head" }, [el("span", { class: "adj-tag", text: "Deload" }), dl.headline]),
        el("div", { class: "adj-detail", text: dl.detail })
      ])
    ]);
  }

  /* Logging a ride. Four fields, three of them optional — the program asks for
     "one or two easy rides", not a training plan for cycling, and a form that
     asked for more would just stop it being logged at all. */
  function cardioSheet(st, existing) {
    var sh = App.ui.sheet(existing ? "Edit ride" : "Log an easy ride");

    var mins = el("input", { type: "number", inputmode: "numeric", min: "1", max: "600",
      value: existing ? String(existing.minutes) : "45", "aria-label": "Minutes" });
    var hr = el("input", { type: "number", inputmode: "numeric", min: "40", max: "220",
      value: (existing && existing.avgHrBpm != null) ? String(existing.avgHrBpm) : "",
      placeholder: "optional", "aria-label": "Average heart rate" });
    var note = el("input", { type: "text", value: (existing && existing.note) || "",
      placeholder: "optional", "aria-label": "Note" });

    sh.body.appendChild(el("div", { class: "kv" }, [
      el("label", { class: "rowb" }, [el("span", { text: "Minutes" }), mins]),
      el("label", { class: "rowb" }, [el("span", { text: "Average HR" }), hr]),
      el("label", { class: "rowb" }, [el("span", { text: "Note" }), note])
    ]));
    var err = el("p", { class: "hint", text: "" });
    sh.body.appendChild(err);

    sh.body.appendChild(el("button", { class: "btn primary", type: "button", onclick: function () {
      var m = parseInt(mins.value, 10);
      if (!(m > 0 && m <= 600)) { err.textContent = "Minutes has to be a number between 1 and 600."; return; }
      var h = hr.value === "" ? null : parseInt(hr.value, 10);
      if (h != null && !(h >= 40 && h <= 220)) {
        err.textContent = "That heart rate looks wrong (" + hr.value + "). Leave it blank if you did not record one.";
        return;
      }
      if (existing) {
        existing.minutes = m; existing.avgHrBpm = h; existing.note = note.value.trim();
      } else {
        M.addCardio(st, { minutes: m, avgHrBpm: h, note: note.value.trim(), kind: "bike", effort: "easy" });
      }
      S.save();
      sh.close();
      App.ui.toast(existing ? "Ride updated" : "Ride logged");
      render();
    } }, [existing ? "Save" : "Save ride"]));

    // A mistyped 480 instead of 48 would otherwise be stuck in your data for
    // good, and quietly wrong in every weekly total from here on.
    // Same hand-off as a lifting session, and the same honesty about it: the
    // app cannot see what Shortcuts did, so it asks rather than claiming.
    if (existing && App.health.isSupported()) {
      sh.body.appendChild(el("button", { class: "btn ghost sm", type: "button", onclick: function () {
        var p2 = App.health.cardioPayload(existing);
        var name = st.settings.healthWriteShortcutName;
        sh.close();
        setTimeout(function () {
          var s2 = App.ui.sheet("Did it save?");
          s2.body.appendChild(el("p", { class: "hint", text:
            "Check Health → Browse → Activity → Workouts for a " + p2.durationMin +
            "-minute cycling entry on " + M.humanDate(existing.date) + "." }));
          s2.body.appendChild(el("button", { class: "btn primary", type: "button", onclick: function () {
            existing.healthLogged = true; S.save(); s2.close();
            App.ui.toast("Marked as saved to Health"); render();
          } }, ["Yes, it's there"]));
          s2.body.appendChild(el("button", { class: "btn ghost", type: "button", onclick: function () {
            s2.close();
            App.ui.toast("Left unmarked — the Shortcut name must match exactly");
          } }, ["No"]));
          s2.open();
        }, 700);
        App.health.open(App.health.shortcutURL(name, p2));
      } }, [icon("heart", 16), existing.healthLogged ? " Send to Apple Health again" : " Save to Apple Health"]));
    }

    if (existing) {
      sh.body.appendChild(el("button", { class: "btn danger sm", type: "button", onclick: function () {
        if (!confirm("Delete the " + existing.minutes + "-minute ride on " + M.humanDate(existing.date) + "?")) return;
        M.removeCardio(st, existing.id);
        S.save(); sh.close(); App.ui.toast("Ride deleted"); render();
      } }, ["Delete this ride"]));
    }
    sh.body.appendChild(el("button", { class: "btn ghost sm", type: "button", onclick: sh.close }, ["Cancel"]));
    sh.open();
  }

  function adjustmentBlock(adj) {
    return el("div", { class: "todayadj adj-" + adj.status }, [
      icon(adj.status === "red" ? "warn" : "info", 15),
      el("div", {}, [
        el("div", { class: "adj-head" }, [el("span", { class: "adj-tag", text: "Today" }), adj.headline]),
        el("div", { class: "adj-detail", text: adj.detail })
      ])
    ]);
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
  // History — Sessions / Week / Exercises
  // ==================================================================
  var showAbandoned = false;
  var historyTab = "sessions";
  var filters = { dayId: "", exerciseId: "", phase: "", programVersionId: "", variantId: "" };
  var reviewWeek = null;          // null = current week
  var chartMetric = "e1rm";       // e1rm | weight

  function History() {
    var st = S.get();
    var nodes = [];

    if (undoAvailable()) {
      nodes.push(el("div", { class: "notice ok" }, [
        icon("up", 16),
        el("span", { text: "Just finished a session." }),
        el("button", { class: "linkbtn", type: "button", onclick: undoLastFinish }, ["Undo"])
      ]));
    }

    nodes.push(el("div", { class: "seg wide" }, [["sessions", "Sessions"], ["week", "Week"], ["exercises", "Exercises"]].map(function (t) {
      return el("button", { class: "segb" + (historyTab === t[0] ? " on" : ""), type: "button", text: t[1],
        onclick: function () { historyTab = t[0]; render(); } });
    })));

    if (historyTab === "week") historySectionWeek(st, nodes);
    else if (historyTab === "exercises") historySectionExercises(st, nodes);
    else historySectionSessions(st, nodes);

    return screen({ title: "History" }, nodes, "History");
  }

  // ---- Sessions (filterable, with phase boundaries) ------------------
  function historySectionSessions(st, nodes) {
    var all = st.sessions.slice().sort(function (a, b) { return a.startedAt < b.startedAt ? 1 : -1; });
    if (!all.length) {
      nodes.push(el("div", { class: "card empty" }, [
        icon("cal", 28),
        el("p", { text: "No sessions yet. Start one from Today — it shows up here and survives a reload." })
      ]));
      return;
    }

    var sessions = all.filter(function (s) {
      if (!showAbandoned && s.status === "abandoned") return false;
      if (filters.dayId && s.dayId !== filters.dayId) return false;
      if (filters.phase && String(s.phase) !== filters.phase) return false;
      if (filters.programVersionId && s.programVersionId !== filters.programVersionId) return false;
      if (filters.variantId && s.variantId !== filters.variantId) return false;
      if (filters.exerciseId && !s.entries.some(function (e) { return e.exerciseId === filters.exerciseId && e.sets.length; })) return false;
      return true;
    });

    // filter controls
    var dayIds = {}, phases = {}, pvIds = {}, exIds = {}, varIds = {};
    all.forEach(function (s) {
      dayIds[s.dayId] = s.dayName; phases[s.phase] = 1; pvIds[s.programVersionId] = 1;
      if (s.variantId) varIds[s.variantId] = 1;
      s.entries.forEach(function (e) { if (e.sets.length) exIds[e.exerciseId] = 1; });
    });
    function sel(key, label, options) {
      var s = el("select", { class: "filtersel", "aria-label": label, onchange: function (e) { filters[key] = e.target.value; render(); } },
        [el("option", { value: "", text: label })].concat(options.map(function (o) {
          var n = el("option", { value: o[0], text: o[1] });
          if (filters[key] === o[0]) n.selected = true;
          return n;
        })));
      return s;
    }
    nodes.push(el("div", { class: "filterbar" }, [
      sel("dayId", "Any day", Object.keys(dayIds).map(function (k) { return [k, shortDayName(dayIds[k])]; })),
      sel("phase", "Any phase", Object.keys(phases).sort().map(function (k) { return [k, "Phase " + k]; })),
      sel("programVersionId", "Any program", Object.keys(pvIds).map(function (k) {
        var pv = M.programById(st, k); return [k, pv ? M.programShortName(pv) : k];
      })),
      Object.keys(varIds).length > 1
        ? sel("variantId", "Any block", Object.keys(varIds).sort().map(function (k) { return [k, "Block " + k]; }))
        : null,
      sel("exerciseId", "Any exercise", Object.keys(exIds)
        .map(function (k) { return [k, M.exerciseName(st, k)]; })
        .sort(function (a, b) { return a[1] < b[1] ? -1 : 1; }))
    ]));

    var anyFilter = filters.dayId || filters.phase || filters.programVersionId || filters.exerciseId || filters.variantId;
    if (anyFilter) {
      nodes.push(el("div", { class: "rowb filterinfo" }, [
        el("span", { class: "hint", text: sessions.length + " of " + all.length + " sessions" }),
        el("button", { class: "linkbtn", type: "button", onclick: function () {
          filters = { dayId: "", exerciseId: "", phase: "", programVersionId: "", variantId: "" }; render();
        } }, ["Clear filters"])
      ]));
    }

    if (!sessions.length) {
      nodes.push(el("div", { class: "card empty" }, [el("p", { text: "No sessions match these filters." })]));
      return;
    }

    var lastPhase = null, lastPv = null;
    sessions.forEach(function (s) {
      // newest-first, so a change here means the OLDER session sits below a boundary
      if (lastPhase !== null && s.phase !== lastPhase) {
        nodes.push(el("div", { class: "phasediv", text: "Phase " + lastPhase + " begins" }));
      }
      if (lastPv !== null && s.programVersionId !== lastPv) {
        var pv = M.programById(st, lastPv);
        nodes.push(el("div", { class: "phasediv alt", text: "Program " + (pv ? M.programShortName(pv) : lastPv) + " begins" }));
      }
      lastPhase = s.phase; lastPv = s.programVersionId;

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
          prCount ? el("span", { class: "chip pr", text: "▲ " + prCount + " PR" }) : null,
          s.healthLogged ? el("span", { class: "chip health", text: "♥ Health" }) : null
        ])
      ]));
    });

    var abandonedCount = all.filter(function (s) { return s.status === "abandoned"; }).length;
    if (abandonedCount) {
      nodes.push(el("button", { class: "linkbtn center", type: "button", onclick: function () { showAbandoned = !showAbandoned; render(); } },
        [showAbandoned ? "Hide abandoned" : "Show " + abandonedCount + " abandoned"]));
    }
  }

  // ---- Week review ---------------------------------------------------
  function historySectionWeek(st, nodes) {
    var current = M.weekIndexOf(st.settings, M.perthTodayISO());
    var wi = (reviewWeek == null) ? current : reviewWeek;
    var r = M.weeklyReview(st, wi);

    nodes.push(el("div", { class: "weeknav" }, [
      el("button", { class: "wn-btn", type: "button", "aria-label": "previous week",
        onclick: function () { reviewWeek = wi - 1; render(); } }, [icon("chev", 18)]),
      el("div", { class: "wn-label" }, [
        el("div", { class: "wn-title", text: r.label + (wi === current ? " · this week" : "") }),
        el("div", { class: "wn-dates", text: M.shortDate(r.bounds.start) + " – " + M.shortDate(r.bounds.end) })
      ]),
      el("button", { class: "wn-btn" + (wi >= current ? " off" : ""), type: "button", "aria-label": "next week",
        onclick: function () { if (wi < current) { reviewWeek = wi + 1; render(); } } }, [icon("chevright", 18)])
    ]));

    if (!r.sessionCount) {
      nodes.push(el("div", { class: "card empty" }, [
        icon("cal", 26),
        el("p", { text: "No sessions logged in " + r.label.toLowerCase() + "." })
      ]));
      return;
    }

    // headline numbers
    var pct = r.planned ? Math.round(100 * r.completed / r.planned) : null;
    nodes.push(el("div", { class: "card" }, [
      el("span", { class: "eyebrow", text: "This week" }),
      el("div", { class: "statrow" }, [
        stat(String(r.sessionCount), r.sessionCount === 1 ? "session" : "sessions"),
        stat(String(r.completed), "working sets"),
        stat(pct == null ? "—" : pct + "%", "of planned")
      ]),
      r.planned ? el("div", { class: "vbar" }, [
        el("span", { text: "Planned" }),
        el("span", { class: "track" }, [el("span", { class: "fill" + (pct < 80 ? " warn" : ""), style: "width:" + Math.min(100, pct) + "%" })]),
        el("b", { text: r.completed + "/" + r.planned })
      ]) : null
    ]));

    // muscle-group volume
    var maxVol = Math.max.apply(null, App.MUSCLES.map(function (m) { return Math.max(r.volume[m], r.previousVolume[m]); }).concat([1]));
    nodes.push(el("div", { class: "card" }, [
      el("span", { class: "eyebrow", text: "Working sets per muscle group" }),
      el("div", { class: "vol" }, App.MUSCLES.map(function (m) {
        var v = r.volume[m], pv2 = r.previousVolume[m];
        var delta = v - pv2;
        return el("div", { class: "vbar" }, [
          el("span", { text: m === "shoulders" ? "Shldrs" : capitalize(m) }),
          el("span", { class: "track" }, [el("span", { class: "fill", style: "width:" + Math.round(100 * v / maxVol) + "%" })]),
          el("b", {}, [String(v), delta !== 0 && pv2 > 0
            ? el("span", { class: "vdelta " + (delta > 0 ? "up" : "down"), text: (delta > 0 ? " +" : " ") + delta })
            : null])
        ]);
      })),
      el("p", { class: "hint", text: "Counted once per working set against the exercise's main muscle group, versus last week. A tracking number, not a claim that every set does the same thing." })
    ]));

    if (r.prs.length) {
      nodes.push(el("div", { class: "card tintP" }, [
        el("span", { class: "eyebrow", text: r.prs.length === 1 ? "Personal record" : r.prs.length + " personal records" }),
        el("div", {}, r.prs.slice(0, 6).map(function (p) {
          return el("div", { class: "pr-line" }, [
            icon("trophy", 16),
            el("div", {}, [
              el("div", { class: "pr-line-name", text: M.exerciseName(st, p.exerciseId) }),
              el("div", { class: "pr-line-detail", text: p.weightKg + " kg × " + p.reps + "  ·  " + p.label + "  ·  " + M.shortDate(p.date) })
            ])
          ]);
        }))
      ]));
    }

    if (r.movers.length) {
      nodes.push(el("div", { class: "card" }, [
        el("span", { class: "eyebrow", text: "Biggest changes vs last time" }),
        el("div", { class: "vol" }, r.movers.map(function (mv) {
          return el("div", { class: "rowb moverrow" }, [
            el("span", { text: M.exerciseName(st, mv.exerciseId) }),
            el("b", { class: mv.deltaE1rm >= 0 ? "up" : "down",
              text: (mv.deltaE1rm >= 0 ? "+" : "") + mv.deltaE1rm + " est. 1RM" })
          ]);
        })),
        el("p", { class: "hint", text: "Change in your best estimated 1RM for that exercise since the previous time you did it." })
      ]));
    }

    var cw = M.cardioSummary(st, weekIndex);
    nodes.push(el("div", { class: "card" }, [
      el("span", { class: "eyebrow", text: "Easy rides" }),
      el("div", { class: "rowb" }, [
        el("span", { text: cw.rides ? cw.rides + (cw.rides === 1 ? " ride" : " rides") : "None" }),
        el("b", { class: cw.onTarget ? "up" : "", text: cw.minutes + " min" })
      ]),
      cw.avgHrBpm ? el("div", { class: "rowb" }, [
        el("span", { text: "Average HR" }), el("b", { text: cw.avgHrBpm + " bpm" })
      ]) : null,
      cw.note ? el("p", { class: "hint", text: cw.note }) : null,
      cw.sessions.length ? el("div", { class: "exlist" }, cw.sessions.map(function (c) {
        return el("button", { class: "exrow linkrow", type: "button",
          onclick: function () { cardioSheet(st, c); } }, [
          el("div", { class: "exrow-name", text: M.humanDate(c.date) + (c.note ? " · " + c.note : "") }),
          el("div", { class: "exrow-target", text: c.minutes + " min" + (c.avgHrBpm ? " · " + c.avgHrBpm + " bpm" : "") })
        ]);
      })) : null
    ]));

    nodes.push(el("div", { class: "card" }, [
      el("span", { class: "eyebrow", text: "Worth knowing" }),
      el("div", { class: "notelist" }, r.notes.map(function (n) { return el("div", { class: "noteitem", text: n }); }))
    ]));

    nodes.push(el("div", { class: "card" }, [
      el("span", { class: "eyebrow", text: "What the app couldn't see" }),
      el("div", { class: "notelist" }, r.missing.map(function (n) { return el("div", { class: "noteitem dim", text: n }); }))
    ]));

    nodes.push(el("div", { class: "card" }, [
      el("span", { class: "eyebrow", text: "Sessions this week" }),
      el("div", { class: "exlist" }, r.sessions.map(function (s) {
        var sets = s.entries.reduce(function (a, e) { return a + M.workingSets(e.sets).length; }, 0);
        return el("a", { class: "exrow linkrow", href: "#/session/" + s.id }, [
          el("div", { class: "exrow-name", text: M.humanDate(s.date) + " · " + s.dayName }),
          el("div", { class: "exrow-target", text: sets + " working sets" + (s.status !== "completed" ? " · " + s.status : "") })
        ]);
      }))
    ]));
  }

  function stat(value, label) {
    return el("div", { class: "stat" }, [
      el("div", { class: "stat-v", text: value }),
      el("div", { class: "stat-l", text: label })
    ]);
  }

  // ---- Exercises list + progress -------------------------------------
  function historySectionExercises(st, nodes) {
    var list = M.exercisesWithHistory(st);
    if (!list.length) {
      nodes.push(el("div", { class: "card empty" }, [el("p", { text: "Nothing logged yet. Exercise progress appears here once you've trained something twice." })]));
      return;
    }
    nodes.push(el("div", { class: "card" }, [
      el("span", { class: "eyebrow", text: list.length + " exercises with history" }),
      el("div", { class: "exlist" }, list.map(function (item) {
        var prog = M.exerciseProgress(st, item.exerciseId);
        var latest = prog[prog.length - 1];
        return el("a", { class: "exrow linkrow", href: "#/exercise/" + item.exerciseId }, [
          el("div", { class: "exrow-name", text: M.exerciseName(st, item.exerciseId) }),
          el("div", { class: "exrow-target", text: prog.length + (prog.length === 1 ? " session" : " sessions") +
            " · last " + M.shortDate(item.lastDate) + " · top " + latest.topWeight + " kg × " + latest.repsAtTop })
        ]);
      }))
    ]));
  }

  function ExerciseDetail(exerciseId) {
    var st = S.get();
    var ex = M.exerciseById(st, exerciseId);
    var back = { label: "History", onClick: function () { historyTab = "exercises"; location.hash = "#/history"; } };
    if (!ex) {
      return screen({ title: "Exercise", lead: back }, [el("div", { class: "card empty" }, [el("p", { text: "Exercise not found." })])]);
    }
    var prog = M.exerciseProgress(st, exerciseId);
    var rec = M.exerciseRecords(st, exerciseId);
    var nodes = [];

    nodes.push(el("div", { class: "muscle" }, [
      el("span", { class: "chip m", text: capitalize(ex.muscleGroup) }),
      el("span", { class: "chip m", text: M.familyName(st, ex.movementFamilyId) }),
      el("span", { class: "chip m", text: ex.equipment })
    ]));

    var photo = M.photoFor(exerciseId);
    if (photo) nodes.push(el("div", { class: "card" }, [photoBlock(photo)]));

    if (!prog.length) {
      nodes.push(el("div", { class: "card empty" }, [el("p", { text: "No working sets logged for this exercise yet." })]));
      return screen({ title: ex.name, lead: back }, nodes, ex.name);
    }

    if (rec) {
      nodes.push(el("div", { class: "card tintP" }, [
        el("span", { class: "eyebrow", text: "Personal records" }),
        prLine("Heaviest", rec.heaviest.weightKg + " kg × " + rec.heaviest.reps, rec.heaviest.date),
        prLine("Best estimated 1RM", rec.bestE1rm.value + " kg (" + rec.bestE1rm.weightKg + " × " + rec.bestE1rm.reps + ")", rec.bestE1rm.date),
        // only worth a line of its own when it isn't just the heaviest set again
        rec.mostRepsAtHeaviest.reps > rec.heaviest.reps
          ? prLine("Most reps at " + rec.mostRepsAtHeaviest.weightKg + " kg", rec.mostRepsAtHeaviest.reps + " reps", rec.mostRepsAtHeaviest.date)
          : null
      ]));
    }

    nodes.push(el("div", { class: "card" }, [
      el("div", { class: "rowb" }, [
        el("span", { class: "eyebrow", text: prog.length === 1 ? "One session" : prog.length + " sessions" }),
        el("div", { class: "seg tiny" }, [["e1rm", "1RM"], ["weight", "Top set"]].map(function (t) {
          return el("button", { class: "segb" + (chartMetric === t[0] ? " on" : ""), type: "button", text: t[1],
            onclick: function () { chartMetric = t[0]; render(); } });
        }))
      ]),
      progressChart(prog, chartMetric),
      el("p", { class: "hint", text: chartMetric === "e1rm"
        ? "Best estimated 1RM per session (Epley: weight × (1 + reps ÷ 30))."
        : "Heaviest working set per session." })
    ]));

    nodes.push(el("div", { class: "card" }, [
      el("span", { class: "eyebrow", text: "Every session" }),
      el("div", { class: "exlist" }, prog.slice().reverse().map(function (p) {
        return el("a", { class: "exrow linkrow", href: "#/session/" + p.sessionId }, [
          el("div", { class: "exrow-name", text: M.shortDate(p.date) + " · " + p.topWeight + " kg × " + p.repsAtTop }),
          el("div", { class: "exrow-target", text: "Phase " + p.phase + " Wk " + p.week + " · " + p.setCount +
            " working sets · " + p.totalReps + " total reps · est. 1RM " + p.bestE1rm })
        ]);
      }))
    ]));

    return screen({ title: ex.name, lead: back }, nodes, ex.name);
  }

  function prLine(label, value, date) {
    return el("div", { class: "pr-line" }, [
      icon("trophy", 16),
      el("div", {}, [
        el("div", { class: "pr-line-name", text: value }),
        el("div", { class: "pr-line-detail", text: label + "  ·  " + M.shortDate(date) })
      ])
    ]);
  }

  // Small inline SVG line chart. One point per session; endpoint emphasised.
  function progressChart(prog, metric) {
    var W = 300, H = 120, PAD_L = 6, PAD_R = 6, PAD_T = 12, PAD_B = 18;
    var vals = prog.map(function (p) { return metric === "e1rm" ? p.bestE1rm : p.topWeight; });
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    if (max === min) { max = min + 1; min = min - 1; }
    var pad = (max - min) * 0.15;
    min -= pad; max += pad;
    var n = vals.length;
    function x(i) { return n === 1 ? W / 2 : PAD_L + (i / (n - 1)) * (W - PAD_L - PAD_R); }
    function y(v) { return PAD_T + (1 - (v - min) / (max - min)) * (H - PAD_T - PAD_B); }

    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "spark");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Progress chart: " + vals.join(", "));

    function add(tag, attrs) {
      var n2 = document.createElementNS(NS, tag);
      Object.keys(attrs).forEach(function (k) { n2.setAttribute(k, attrs[k]); });
      svg.appendChild(n2); return n2;
    }
    [0, 0.5, 1].forEach(function (f) {
      add("line", { class: "gridln", x1: PAD_L, x2: W - PAD_R, y1: PAD_T + f * (H - PAD_T - PAD_B), y2: PAD_T + f * (H - PAD_T - PAD_B) });
    });
    if (n > 1) {
      var pts = vals.map(function (v, i) { return x(i) + "," + y(v); }).join(" ");
      add("polyline", { class: "area", points: PAD_L + "," + (H - PAD_B) + " " + pts + " " + (W - PAD_R) + "," + (H - PAD_B) });
      add("polyline", { class: "trend", points: pts });
    }
    vals.forEach(function (v, i) {
      add("circle", { class: i === n - 1 ? "dot" : "scatter", cx: x(i), cy: y(v), r: i === n - 1 ? 4 : 2.6 });
    });
    var wrap = el("div", { class: "chartwrap" }, [svg]);
    wrap.appendChild(el("div", { class: "chartaxis" }, [
      el("span", { text: M.shortDate(prog[0].date) }),
      el("span", { class: "chartmax", text: Math.round(Math.max.apply(null, vals) * 10) / 10 + " kg peak" }),
      el("span", { text: M.shortDate(prog[n - 1].date) })
    ]));
    return wrap;
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
      s.variantId ? el("span", { class: "chip m", text: "Block " + s.variantId }) : null,
      s.status !== "completed" ? el("span", { class: "chip status-" + s.status, text: s.status }) : null,
      s.advancesRotation ? null : el("span", { class: "chip m", text: "off-rotation" })
    ])];
    if (s.editedAt) nodes.push(el("p", { class: "hint", text: "Edited " + M.stampText(s.editedAt) }));

    if (M.countsForHistory(s)) {
      var logged = M.workingSets(s.entries.reduce(function (a, e) { return a.concat(e.sets); }, [])).length;
      if (logged) {
        nodes.push(s.healthLogged
          ? el("div", { class: "notice ok" }, [
              icon("check", 16),
              el("span", { text: "Saved to Apple Health" + (s.healthLoggedAt ? " · " + M.stampText(s.healthLoggedAt) : "") }),
              el("button", { class: "linkbtn", type: "button", onclick: function () {
                s.healthLogged = false; s.healthLoggedAt = null; S.save(); render();
              } }, ["Undo"])
            ])
          : el("button", { class: "btn ghost sm", type: "button",
              onclick: function () { healthSheet(st, s); } },
              [icon("heart", 16), " Save to Apple Health"]));
      }
    }

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
      el("span", { class: "eyebrow", text: "Barbell" }),
      el("div", { class: "rowb" }, [
        el("span", { text: "Bar weight" }),
        el("b", { text: (set.barWeightKg == null ? M.DEFAULT_BAR_KG : set.barWeightKg) + " kg" })
      ]),
      el("div", { class: "rowb" }, [
        el("span", { text: "Plates available" }),
        el("b", { text: (set.availablePlatesKg || M.DEFAULT_PLATES).join(", ") })
      ]),
      el("button", { class: "btn ghost sm", type: "button", onclick: function () {
        var v = prompt("Bar weight in kg", String(set.barWeightKg == null ? M.DEFAULT_BAR_KG : set.barWeightKg));
        if (v == null) return;
        var n = parseFloat(v);
        if (isNaN(n) || n < 0 || n > 60) { App.ui.toast("Enter a bar weight between 0 and 60 kg"); return; }
        set.barWeightKg = n; S.save(); render();
      } }, ["Change bar weight"]),
      el("button", { class: "btn ghost sm", type: "button", onclick: function () {
        var cur = (set.availablePlatesKg || M.DEFAULT_PLATES).join(", ");
        var v = prompt("Plate sizes your gym has, in kg, separated by commas", cur);
        if (v == null) return;
        var list = v.split(",").map(function (x) { return parseFloat(x.trim()); })
          .filter(function (x) { return !isNaN(x) && x > 0; })
          .sort(function (a, b) { return b - a; });
        if (!list.length) { App.ui.toast("Couldn't read any plate sizes"); return; }
        set.availablePlatesKg = list; S.save(); render();
      } }, ["Change plates"]),
      el("p", { class: "hint", text: "Used by the plate maths — tap a barbell exercise's name during a session." })
    ]));

    // ---- Rest timer -------------------------------------------------
    // The value was seeded and read but had no control, so it was really a
    // hardcoded 2:30 wearing a setting's clothes. 2:30 suits accessories and is
    // short for a heavy top set, which is exactly when you want it longer.
    var restSec = set.restTimerDefaultSec || 150;
    nodes.push(el("div", { class: "card" }, [
      el("span", { class: "eyebrow", text: "Rest timer" }),
      el("div", { class: "rowb" }, [
        el("span", { text: "After a working set" }),
        el("b", { text: M.restText(restSec) })
      ]),
      el("div", { class: "seg wide" }, [60, 90, 120, 150, 180, 240, 300].map(function (n) {
        var b = el("button", { class: "segbtn" + (n === restSec ? " on" : ""), type: "button",
          "aria-pressed": n === restSec ? "true" : "false",
          onclick: function () { set.restTimerDefaultSec = n; S.save(); render(); } }, [M.restText(n)]);
        return b;
      })),
      el("p", { class: "hint", text: "Starts on its own after a working set — never after a warm-up or a drop set. It is a prompt, not a rule: the next set is yours to start whenever you want." })
    ]));

    // ---- Apple Health ----------------------------------------------
    var loggedCount = st.sessions.filter(function (x) { return x.healthLogged; }).length;
    nodes.push(el("div", { class: "card" }, [
      el("span", { class: "eyebrow", text: "Apple Health" }),
      el("div", { class: "rowb" }, [
        el("span", { text: "Write Shortcut" }),
        el("b", { text: set.healthWriteShortcutName })
      ]),
      el("div", { class: "rowb" }, [
        el("span", { text: "Sessions marked saved" }),
        el("b", { text: String(loggedCount) })
      ]),
      el("button", { class: "btn ghost sm", type: "button", onclick: function () {
        var v = prompt("Name of the Shortcut that writes workouts to Health. It must match exactly, including capitals.", set.healthWriteShortcutName);
        if (v != null && v.trim()) { set.healthWriteShortcutName = v.trim(); S.save(); render(); }
      } }, ["Change the Shortcut name"]),
      el("div", { class: "rowb" }, [
        el("span", { text: "Read Shortcut" }),
        el("b", { text: set.healthReadShortcutName })
      ]),
      el("button", { class: "btn ghost sm", type: "button", onclick: function () {
        var v = prompt("Name of the Shortcut that reads HRV, resting heart rate and sleep from Health.", set.healthReadShortcutName);
        if (v != null && v.trim()) { set.healthReadShortcutName = v.trim(); S.save(); render(); }
      } }, ["Change the read Shortcut name"]),
      el("button", { class: "btn ghost sm", type: "button", onclick: function () { healthTestSheet(st); } }, ["Test the write bridge"]),
      el("p", { class: "hint", text: "Writing: Health gets a summary — type, start, duration. Your sets and weights stay in this app. Reading: import HRV, resting heart rate and sleep from Body → Recovery. Both Shortcuts are one-off builds — see the shortcuts folder in the project." })
    ]));

    // ---- install / offline -----------------------------------------
    var env = App.env;
    var installed = env.isStandalone();
    var swOn = env.swState.controlling || env.swState.registered;
    var swText = swOn ? "Ready"
      : !env.swSupported() ? "Not supported by this browser"
      : env.swState.failed ? "Unavailable here"
      : "Setting up…";
    nodes.push(el("div", { class: "card" }, [
      el("span", { class: "eyebrow", text: "On this device" }),
      el("div", { class: "rowb" }, [
        el("span", { text: "Installed to home screen" }),
        el("b", { class: installed ? "up" : "", text: installed ? "Yes" : "No" })
      ]),
      el("div", { class: "rowb" }, [
        el("span", { text: "Works offline" }),
        el("b", { class: swOn ? "up" : "", text: swText })
      ]),
      el("div", { class: "rowb" }, [
        el("span", { text: "Network" }),
        el("b", { text: env.online() ? "Online" : "Offline" })
      ]),
      !installed ? el("button", { class: "btn ghost sm", type: "button", onclick: installGuide }, ["How to install it"]) : null,
      !swOn && env.swSupported() && location.protocol === "file:"
        ? el("p", { class: "hint", text: "Offline support needs the app served over http — open it from a server or GitHub Pages, not straight from a file." })
        : null,
      env.swState.failed && location.protocol !== "file:"
        ? el("p", { class: "hint", text: "This browser blocked the offline worker. Everything else works and your data is safe — offline launch just isn't available here." })
        : null
    ]));

    nodes.push(el("div", { class: "card" }, [
      el("span", { class: "eyebrow", text: "Device" }),
      el("p", { class: "hint", text: "Two devices means two separate datasets. Mark which one you actually log on; the other will warn you before you type into it." }),
      el("div", { class: "seg wide" }, [["mac", "Mac"], ["iphone", "iPhone"], ["unset", "Not set"]].map(function (t) {
        return el("button", { class: "segb" + (meta.sourceOfTruthDevice === t[0] ? " on" : ""), type: "button", text: t[1],
          onclick: function () { meta.sourceOfTruthDevice = t[0]; S.save(); render(); } });
      })),
      el("button", { class: "btn ghost sm", type: "button", onclick: moveToPhoneGuide }, ["Move my data to another device"])
    ]));

    nodes.push(el("p", { class: "hint center", text: "Coach · Stage 9 · schema v" + st.schemaVersion +
      " · app " + S.appVersion + (env.swState.version ? " · offline " + env.swState.version : "") }));
    return screen({ title: "More" }, nodes, "More");
  }

  // Sends a clearly-marked 1-minute test workout, so the bridge can be proved
  // without polluting the log with a fake session.
  function healthTestSheet(st) {
    var H = App.health;
    var name = st.settings.healthWriteShortcutName || "Log Strength Workout";
    var now = new Date();
    var fake = {
      id: "health-test", dayName: "Coach bridge test", date: U.perthDateISO(),
      startedAt: new Date(now.getTime() - 60000).toISOString(), endedAt: now.toISOString(),
      entries: []
    };
    var p = H.payload(st, fake, 1);
    var sh = App.ui.sheet("Test the Health bridge");
    sh.body.appendChild(el("p", { class: "hint", text:
      "This sends a 1-minute workout dated now, so you can prove the Shortcut works end to end. " +
      "It will appear in Health as a 1-minute Functional Strength Training entry — delete it there afterwards." }));
    sh.body.appendChild(el("div", { class: "kv" }, [
      kvRow("Shortcut", name),
      kvRow("Sends", "1 minute, Functional Strength Training")
    ]));
    if (!H.isSupported()) {
      sh.body.appendChild(el("div", { class: "notice" }, [
        icon("warn", 16),
        el("span", { text: "Shortcuts only exists on Apple devices — this will do nothing here. Run it on your iPhone." })
      ]));
    }
    sh.body.appendChild(el("button", { class: "btn primary", type: "button", onclick: function () {
      sh.close();
      setTimeout(function () {
        var s2 = App.ui.sheet("Did the test work?");
        s2.body.appendChild(el("p", { class: "hint", text: "Check Health → Browse → Activity → Workouts for a 1-minute entry dated just now." }));
        s2.body.appendChild(el("button", { class: "btn primary", type: "button", onclick: function () {
          s2.close(); App.ui.toast("Bridge works — remember to delete the test entry in Health");
        } }, ["Yes, it's there"]));
        s2.body.appendChild(el("button", { class: "btn ghost", type: "button", onclick: function () {
          s2.close(); healthTroubleshootSheet(st, fake, p, name);
        } }, ["No — show me what to check"]));
        s2.open();
      }, 700);
      H.open(H.shortcutURL(name, p));
    } }, [icon("heart", 16), " Send a test workout"]));
    sh.body.appendChild(el("button", { class: "btn ghost sm", type: "button", onclick: sh.close }, ["Cancel"]));
    sh.open();
  }

  function installGuide() {
    var p = App.env.platform();
    var sh = App.ui.sheet("Install Coach");
    var steps;
    if (p === "iphone" || p === "ipad") {
      steps = [
        "Open this page in Safari (not Chrome — only Safari can install it on iOS).",
        "Tap the Share button in the toolbar.",
        "Scroll down and tap “Add to Home Screen”.",
        "Name it Coach and tap Add.",
        "Open it from the home screen — it runs full-screen and works with no signal."
      ];
    } else if (p === "mac") {
      steps = [
        "In Safari: File → Add to Dock.",
        "In Chrome: the install icon in the address bar, or ⋮ → Cast, Save and Share → Install page as app.",
        "It opens in its own window and works offline once installed."
      ];
    } else {
      steps = [
        "Open the browser menu.",
        "Choose “Install app” or “Add to Home screen”.",
        "It then works offline like any installed app."
      ];
    }
    sh.body.appendChild(el("p", { class: "hint", text: "Installing gives you the app icon, full-screen layout, and offline use in the gym. Your data stays in this browser either way." }));
    sh.body.appendChild(el("ol", { class: "steps" }, steps.map(function (s) { return el("li", { text: s }); })));
    sh.body.appendChild(el("button", { class: "btn primary", type: "button", onclick: sh.close }, ["Got it"]));
    sh.open();
  }

  function moveToPhoneGuide() {
    var st = S.get();
    var sh = App.ui.sheet("Move your data");
    sh.body.appendChild(el("p", { class: "hint", text:
      "Installing on a second device does not sync it. Each browser keeps its own copy. To move your training history, carry a backup file across — then log on one device only." }));
    sh.body.appendChild(el("ol", { class: "steps" }, [
      el("li", { text: "On this device, export a backup (button below). It lands in your Downloads or Files." }),
      el("li", { text: "Put the file somewhere both devices can see it — iCloud Drive, AirDrop, or email it to yourself." }),
      el("li", { text: "On the other device, open Coach → More → Import backup, and pick that file." }),
      el("li", { text: "Check the preview counts match, then confirm. Your current data there is snapshotted first." }),
      el("li", { text: "Set Device to the one you'll actually log on. The other one will warn you before you type into it." })
    ]));
    sh.body.appendChild(el("div", { class: "kv" }, [
      el("div", { class: "rowb" }, [el("span", { text: "This copy holds" }),
        el("b", { text: st.sessions.length + " sessions" })]),
      el("div", { class: "rowb" }, [el("span", { text: "Last backup" }),
        el("b", { text: st.meta.lastBackupAt ? M.stampText(st.meta.lastBackupAt) : "never" })])
    ]));
    sh.body.appendChild(el("button", { class: "btn primary", type: "button", onclick: function () {
      exportData(); sh.close();
    } }, ["Export a backup now"]));
    sh.body.appendChild(el("button", { class: "btn ghost sm", type: "button", onclick: sh.close }, ["Close"]));
    sh.open();
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
  // Food — the six checkpoints
  // ==================================================================
  var foodDate = null;   // null = today

  function ensureNutritionDay(st, dateIso) {
    var rec = M.nutritionDay(st, dateIso);
    if (!rec) {
      rec = M.blankNutritionDay(st, dateIso);
      st.nutritionDays.push(rec);
      st.nutritionDays.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    }
    // keep the record in step with the plan if a checkpoint was ever added
    var plan = M.mealPlan(st).checkpoints;
    while (rec.checkpoints.length < plan.length) {
      var i = rec.checkpoints.length;
      rec.checkpoints.push({ index: i, id: plan[i].id, state: "none", largerPortion: false, at: null });
    }
    return rec;
  }

  function Food() {
    var st = S.get();
    var today = M.perthTodayISO();
    var date = foodDate || today;
    var plan = M.mealPlan(st);
    var rec = M.nutritionDay(st, date) || M.blankNutritionDay(st, date);
    var counts = M.dayCounts(st, rec);
    var score = M.dayScore(st, rec);
    var n = plan.checkpoints.length;
    var nodes = [];

    // date stepper
    nodes.push(el("div", { class: "weeknav" }, [
      el("button", { class: "wn-btn", type: "button", "aria-label": "previous day",
        onclick: function () { foodDate = M.addDays(date, -1); render(); } }, [icon("chev", 18)]),
      el("div", { class: "wn-label" }, [
        el("div", { class: "wn-title", text: date === today ? "Today" : M.humanDate(date) }),
        el("div", { class: "wn-dates", text: M.humanDate(date) })
      ]),
      el("button", { class: "wn-btn" + (date >= today ? " off" : ""), type: "button", "aria-label": "next day",
        onclick: function () { if (date < today) { foodDate = M.addDays(date, 1); render(); } } }, [icon("chevright", 18)])
    ]));

    nodes.push(el("div", { class: "card" }, [
      el("div", { class: "rowb" }, [
        el("span", { class: "eyebrow", text: counts.done + " of " + n + " eaten" }),
        el("span", { class: "chip" + (score >= 1 ? "" : " m"), text: Math.round(score * 100) + "%" })
      ]),
      el("div", { class: "meallist" }, plan.checkpoints.map(function (cp, i) {
        var c = rec.checkpoints[i] || { state: "none" };
        return mealRow(st, date, cp, c, i);
      })),
      el("p", { class: "hint", text: "Tap the circle to mark it eaten. Tap the meal for partial, skipped, or a bigger portion." })
    ]));

    nodes.push(el("div", { class: "card" }, [
      el("span", { class: "eyebrow", text: "Daily target" }),
      el("div", { class: "statrow" }, [
        stat(plan.kcalTargetLow + "–" + plan.kcalTargetHigh, "kcal"),
        stat("~" + plan.proteinTarget + " g", "protein")
      ]),
      el("p", { class: "hint", text: "A starting estimate from your stats and a physically active job — corrected by what the scale actually does, not treated as a fixed number. The app tracks whether the six meals happened, not grams." })
    ]));

    // this week
    var wi = M.weekIndexOf(st.settings, date);
    var wk = M.nutritionWeek(st, wi);
    nodes.push(el("div", { class: "card" }, [
      el("div", { class: "rowb" }, [
        el("span", { class: "eyebrow", text: wk.label }),
        el("b", { text: wk.adherence == null ? "—" : Math.round(wk.adherence * 100) + "%" })
      ]),
      el("div", { class: "weekstrip" }, wk.days.map(function (d) {
        var h = Math.max(6, Math.round(d.score * 100));
        return el("div", { class: "wsday" + (d.date === date ? " sel" : "") }, [
          el("div", { class: "wstrack" }, [
            el("div", { class: "wsfill" + (d.logged ? "" : " none"), style: "height:" + (d.logged ? h : 100) + "%" })
          ]),
          el("div", { class: "wslab", text: M.humanDate(d.date).slice(0, 1) })
        ]);
      })),
      el("p", { class: "hint", text: wk.adherence == null
        ? "Nothing logged in this week yet."
        : "Averaged over " + wk.scoredDays + " logged " + (wk.scoredDays === 1 ? "day" : "days") +
          (wk.unloggedDays ? " · " + wk.unloggedDays + " not logged" : "") +
          (date === today ? " · today still in progress" : "") })
    ]));

    return screen({ title: "Food" }, nodes, "Food");
  }

  function mealRow(st, date, cp, c, i) {
    var state = c.state || "none";
    var box = el("button", {
      class: "mealbox " + state, type: "button",
      "aria-label": (state === "done" ? "Mark not eaten: " : "Mark eaten: ") + cp.label,
      onclick: function (e) {
        e.stopPropagation();
        var rec = ensureNutritionDay(st, date);
        var cur = rec.checkpoints[i];
        cur.state = (cur.state === "done") ? "none" : "done";
        cur.at = cur.state === "none" ? null : U.nowISO();
        S.save(); render();
      }
    }, [state === "done" ? icon("check", 14) : state === "partial" ? el("span", { class: "half" })
      : state === "skipped" ? icon("x", 12) : null]);

    return el("div", { class: "meal " + state }, [
      box,
      el("button", { class: "mealbody", type: "button",
        onclick: function () { mealOptions(st, date, cp, i); } }, [
        el("div", { class: "mealtime" }, [
          cp.time === cp.label ? cp.label : cp.time + " · " + cp.label,
          c.largerPortion ? el("span", { class: "portion-tag", text: "bigger" }) : null,
          state === "partial" ? el("span", { class: "state-tag", text: "partial" }) : null,
          state === "skipped" ? el("span", { class: "state-tag skip", text: "skipped" }) : null
        ]),
        el("div", { class: "mealdetail", text: cp.detail })
      ])
    ]);
  }

  function mealOptions(st, date, cp, i) {
    var sh = App.ui.sheet(cp.time === cp.label ? cp.label : cp.time + " · " + cp.label);
    sh.body.appendChild(el("p", { class: "hint", text: cp.detail }));
    var rec = ensureNutritionDay(st, date);
    var cur = rec.checkpoints[i];

    [["done", "Ate it"], ["partial", "Ate some of it"], ["skipped", "Skipped it"], ["none", "Not marked"]]
      .forEach(function (opt) {
        sh.body.appendChild(el("button", {
          class: "btn " + (cur.state === opt[0] ? "primary" : "ghost"), type: "button",
          onclick: function () {
            cur.state = opt[0];
            cur.at = opt[0] === "none" ? null : U.nowISO();
            S.save(); sh.close(); render();
          }
        }, [opt[1]]));
      });

    var bigger = el("input", { type: "checkbox" });
    bigger.checked = !!cur.largerPortion;
    bigger.addEventListener("change", function () {
      cur.largerPortion = bigger.checked; S.save(); render();
    });
    sh.body.appendChild(el("label", { class: "checkrow" }, [bigger,
      el("span", { text: "Bigger portion than usual" })]));
    sh.body.appendChild(el("button", { class: "btn ghost sm", type: "button", onclick: sh.close }, ["Close"]));
    sh.open();
  }

  // ==================================================================
  // Body — weight log + trend, and the recovery check-in
  // ==================================================================
  var bodyTab = "weight";

  function Body() {
    var nodes = [];
    nodes.push(el("div", { class: "seg wide" }, [["weight", "Weight"], ["recovery", "Recovery"]].map(function (t) {
      return el("button", { class: "segb" + (bodyTab === t[0] ? " on" : ""), type: "button", text: t[1],
        onclick: function () { bodyTab = t[0]; render(); } });
    })));
    if (bodyTab === "recovery") bodySectionRecovery(S.get(), nodes);
    else bodySectionWeight(S.get(), nodes);
    return screen({ title: "Body" }, nodes, "Body");
  }

  function bodySectionWeight(st, nodes) {
    var today = M.perthTodayISO();
    var series = M.bodyweightSeries(st);
    var latest = M.latestBodyweight(st);
    var advice = M.portionAdvice(st);
    var t = advice.trend;

    if (!series.length) {
      nodes.push(el("div", { class: "card empty" }, [
        icon("scale", 28),
        el("p", { text: "No weigh-ins yet. Weigh yourself most mornings, under the same conditions — after the toilet, before eating or drinking." })
      ]));
      nodes.push(el("button", { class: "btn primary", type: "button", onclick: function () { weighInSheet(st, today); } },
        [icon("plus", 16), " Log today's weight"]));
      return;
    }

    var todayEntry = series.filter(function (b) { return b.date === today; })[0];
    nodes.push(el("div", { class: "card" }, [
      el("div", { class: "rowb", style: "align-items:flex-end" }, [
        el("div", {}, [
          el("div", { class: "bignum" }, [String(latest.kg), el("span", { class: "unit", text: " kg" })]),
          el("div", { class: "wn-dates", text: latest.date === today ? "this morning" : M.humanDate(latest.date) })
        ]),
        t.slopeKgPerWeek != null
          ? el("div", { class: "delta " + trendTone(st, t.slopeKgPerWeek) }, [
              icon(t.slopeKgPerWeek >= 0 ? "up" : "down", 14),
              M.fmtSlope(t.slopeKgPerWeek)
            ])
          : null
      ]),
      weightChart(t),
      el("p", { class: "hint", text: t.slopeKgPerWeek == null
        ? "The line is your 7-day rolling average once there are enough weigh-ins."
        : "Trend over " + t.spanDays + " days from " + t.readings + " weigh-ins (" + t.perWeek +
          " a week). The line is the 7-day rolling average — single mornings bounce around too much to read." })
    ]));

    nodes.push(el("button", { class: "btn " + (todayEntry ? "ghost" : "primary"), type: "button",
      onclick: function () { weighInSheet(st, today); } },
      [icon(todayEntry ? "edit" : "plus", 16), todayEntry ? " Edit today (" + todayEntry.kg + " kg)" : " Log today's weight"]));

    // the nudge
    nodes.push(el("div", { class: "card advice tone-" + advice.tone }, [
      el("div", { class: "advice-head" }, [
        icon(advice.tone === "push" ? "check" : advice.tone === "back" ? "warn" : "info", 17),
        el("div", { class: "sug-head", text: advice.headline })
      ]),
      el("p", { class: "sug-detail", text: advice.reason }),
      el("p", { class: "hint", text: "Target: " + st.settings.bwTargetKgPerWeekLow + "–" +
        st.settings.bwTargetKgPerWeekHigh + " kg/week. One change at a time, then two weeks before the next." })
    ]));

    nodes.push(el("div", { class: "card" }, [
      el("span", { class: "eyebrow", text: "Recent weigh-ins" }),
      el("div", { class: "exlist" }, series.slice().reverse().slice(0, 14).map(function (b) {
        return el("button", { class: "exrow linkrow", type: "button",
          onclick: function () { weighInSheet(st, b.date); } }, [
          el("div", { class: "exrow-name", text: b.kg + " kg" }),
          el("div", { class: "exrow-target", text: M.humanDate(b.date) + (b.note ? " · " + b.note : "") })
        ]);
      }))
    ]));

  }

  // ---- Recovery ------------------------------------------------------
  function bodySectionRecovery(st, nodes) {
    var today = M.perthTodayISO();
    var rd = M.readiness(st, today);
    var base = M.recoveryBaselines(st, today);

    nodes.push(readinessCard(rd, true));

    nodes.push(el("button", { class: "btn " + (rd.checkin ? "ghost" : "primary"), type: "button",
      onclick: function () { checkinSheet(st, today); } },
      [icon(rd.checkin ? "edit" : "plus", 16), rd.checkin ? " Edit today's check-in" : " Check in — 10 seconds"]));

    // what "normal" currently means
    var n = base.subjective.n;
    nodes.push(el("div", { class: "card" }, [
      el("span", { class: "eyebrow", text: "Your baseline" }),
      el("p", { class: "hint", text: n >= 5
        ? "Built from your own last " + base.windowDays + " days — " + n + " check-ins. “Low” means low for you, never a population average. The app uses the middle value and your usual spread, so one rough night doesn't move the bar it's judged against."
        : n + " of 5 check-ins so far. Until there are 5, the app reads today's answers on their own rather than claiming to know your normal." }),
      base.hrvMs.n || base.restingHrBpm.n || base.sleepHours.n
        ? el("div", { class: "vol" }, [
            base.hrvMs.n ? baselineRow("HRV", base.hrvMs, " ms") : null,
            base.restingHrBpm.n ? baselineRow("Resting HR", base.restingHrBpm, " bpm") : null,
            base.sleepHours.n ? baselineRow("Sleep", base.sleepHours, " h") : null
          ])
        : el("p", { class: "hint", text: "No HRV, resting heart rate or sleep yet. Add them below if you want them — the check-in works fine on its own." })
    ]));

    // ---- HRV / resting HR / sleep ----
    var todayReading = M.recoveryReadingFor(st, today);
    var readingCount = (st.recoveryReadings || []).length;
    nodes.push(el("div", { class: "card" }, [
      el("span", { class: "eyebrow", text: "HRV, resting heart rate & sleep" }),
      todayReading
        ? el("div", { class: "siglist" }, [
            metricRow("HRV", todayReading.hrvMs, " ms"),
            metricRow("Resting HR", todayReading.restingHrBpm, " bpm"),
            metricRow("Sleep", todayReading.sleepHours, " h")
          ])
        : el("p", { class: "hint", text: "Nothing for today yet." }),
      el("p", { class: "hint", text: readingCount
        ? readingCount + " day" + (readingCount === 1 ? "" : "s") + " recorded. These feed the same personal baselines as the check-in."
        : "Optional. Type them from the Health app, or use a Shortcut to fetch them." }),
      el("button", { class: "btn ghost sm", type: "button", onclick: function () { readingSheet(st, today); } },
        [icon(todayReading ? "edit" : "plus", 16), todayReading ? " Edit today's numbers" : " Enter today's numbers"]),
      el("button", { class: "btn ghost sm", type: "button", onclick: function () { healthImportSheet(st); } },
        [icon("heart", 16), " Import from Health"])
    ]));

    // recent check-ins
    var recent = (st.readinessCheckins || []).slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 14);
    if (recent.length) {
      nodes.push(el("div", { class: "card" }, [
        el("span", { class: "eyebrow", text: "Recent check-ins" }),
        el("div", { class: "exlist" }, recent.map(function (c) {
          var day = M.readiness(st, c.date);
          return el("button", { class: "exrow linkrow", type: "button",
            onclick: function () { checkinSheet(st, c.date); } }, [
            el("div", { class: "exrow-name" }, [
              el("span", { class: "dot-" + day.status }),
              M.humanDate(c.date)
            ]),
            el("div", { class: "exrow-target", text: "energy " + c.energy + " · soreness " + c.soreness +
              " · work " + c.workdayLoad.replace("-", " ") + (c.painOrIllness ? " · pain/illness flagged" : "") +
              (c.note ? " · " + c.note : "") })
          ]);
        }))
      ]));
    }

    nodes.push(el("p", { class: "hint", text: "Recovery never cancels a session, changes your program, or names a condition. It softens today's suggestion and tells you why. You decide." }));
  }

  function metricRow(label, value, unit) {
    return el("div", { class: "sigrow" }, [
      el("span", { class: "siglabel", text: label }),
      el("span", { class: "sigval", text: value == null ? "—" : value + unit })
    ]);
  }

  // Typed by hand from the Health app. Works with no Shortcut at all.
  /* The read bridge. The Shortcut copies a line of JSON to the clipboard and
     you paste it here. Deliberately not automatic: iOS gives no reliable way
     to hand data back into an installed PWA, and a paste box that always works
     beats a return trip that sometimes lands in the wrong browser. */
  function healthImportSheet(st) {
    var H = App.health;
    var name = st.settings.healthReadShortcutName || "Read Recovery";
    var sh = App.ui.sheet("Import from Health");

    sh.body.appendChild(el("p", { class: "hint", text:
      "Run your “" + name + "” Shortcut — it reads HRV, resting heart rate and sleep from Health and copies one line of JSON. Come back here and paste it." }));

    var box = el("textarea", { class: "pastebox", rows: "3", placeholder: '{"v":1,"date":"…","hrvMs":48,"restingHrBpm":52,"sleepHours":7.4}' });
    var result = el("div", { class: "importresult" });

    function preview(text) {
      result.innerHTML = "";
      var res = H.parseReadPayload(text);
      if (!res.ok) {
        result.appendChild(el("div", { class: "notice" }, [icon("warn", 16), el("span", { text: res.fatal })]));
        res.warnings.forEach(function (w) { result.appendChild(el("p", { class: "hint warn-text", text: "⚠ " + w })); });
        return null;
      }
      result.appendChild(el("div", { class: "kv" }, res.days.slice(0, 5).map(function (d) {
        var bits = [];
        if (d.hrvMs != null) bits.push("HRV " + d.hrvMs + " ms");
        if (d.restingHrBpm != null) bits.push("RHR " + d.restingHrBpm + " bpm");
        if (d.sleepHours != null) bits.push("sleep " + d.sleepHours + " h");
        return el("div", { class: "rowb" }, [
          el("span", { text: M.humanDate(d.date) }),
          el("b", { text: bits.join(" · ") })
        ]);
      })));
      res.warnings.forEach(function (w) { result.appendChild(el("p", { class: "hint warn-text", text: "⚠ " + w })); });
      return res;
    }

    box.addEventListener("input", function () { preview(box.value); });

    if (H.isSupported()) {
      sh.body.appendChild(el("button", { class: "btn ghost sm", type: "button", onclick: function () {
        H.open(H.readShortcutURL(name));
      } }, [icon("heart", 16), " Run the “" + name + "” Shortcut"]));
    } else {
      sh.body.appendChild(el("div", { class: "notice" }, [
        icon("warn", 16),
        el("span", { text: "Shortcuts only exists on Apple devices — on this one, paste the JSON in by hand." })
      ]));
    }

    sh.body.appendChild(box);
    if (H.canReadClipboard()) {
      sh.body.appendChild(el("button", { class: "btn ghost sm", type: "button", onclick: function () {
        H.readClipboard().then(function (t) { box.value = t; preview(t); })
          ["catch"](function () { App.ui.toast("Couldn't read the clipboard — paste it in instead"); });
      } }, ["Paste from clipboard"]));
    }
    sh.body.appendChild(result);

    sh.body.appendChild(el("button", { class: "btn primary", type: "button", onclick: function () {
      var res = preview(box.value);
      if (!res) return;
      var counts = H.applyReadings(st, res.days, "shortcut");
      S.save(); sh.close(); render();
      App.ui.toast(counts.added + " day" + (counts.added === 1 ? "" : "s") + " added" +
        (counts.updated ? ", " + counts.updated + " updated" : ""));
    } }, ["Import"]));
    sh.body.appendChild(el("button", { class: "btn ghost sm", type: "button", onclick: sh.close }, ["Cancel"]));
    sh.open();
  }

  function readingSheet(st, dateIso) {
    var existing = M.recoveryReadingFor(st, dateIso);
    var d = {
      hrvMs: existing && existing.hrvMs != null ? String(existing.hrvMs) : "",
      restingHrBpm: existing && existing.restingHrBpm != null ? String(existing.restingHrBpm) : "",
      sleepHours: existing && existing.sleepHours != null ? String(existing.sleepHours) : ""
    };
    var sh = App.ui.sheet(M.humanDate(dateIso));
    sh.body.appendChild(el("p", { class: "hint", text: "From Health → Browse. Leave anything you don't have blank — partial is fine, and it says so rather than guessing." }));

    function field(key, label, unit, step) {
      var input = el("input", { class: "num", inputmode: "decimal", value: d[key],
        "aria-label": label, oninput: function (e) { d[key] = e.target.value; } });
      sh.body.appendChild(el("div", { class: "lf" }, [
        el("span", { class: "lflbl", text: label + " (" + unit + ")" }), stepper(input, step)
      ]));
    }
    field("hrvMs", "HRV", "ms", 1);
    field("restingHrBpm", "Resting heart rate", "bpm", 1);
    field("sleepHours", "Sleep", "hours", 0.25);

    sh.body.appendChild(el("button", { class: "btn primary", type: "button", onclick: function () {
      var res = App.health.parseReadPayload(JSON.stringify({
        date: dateIso, hrvMs: d.hrvMs || null, restingHrBpm: d.restingHrBpm || null, sleepHours: d.sleepHours || null
      }));
      if (!res.ok) {
        App.ui.toast(res.warnings.length ? res.warnings[0] : res.fatal);
        return;
      }
      App.health.applyReadings(st, res.days, "manual");
      S.save(); sh.close(); render();
      App.ui.toast("Saved");
    } }, ["Save"]));
    if (existing) {
      sh.body.appendChild(el("button", { class: "btn danger sm", type: "button", onclick: function () {
        if (!confirm("Delete the numbers for " + M.humanDate(dateIso) + "?")) return;
        st.recoveryReadings = st.recoveryReadings.filter(function (r) { return r.date !== dateIso; });
        S.save(); sh.close(); render();
      } }, ["Delete"]));
    }
    sh.open();
  }

  function baselineRow(label, b, unit) {
    return el("div", { class: "rowb", style: "font-size:13px" }, [
      el("span", { text: label }),
      el("b", { text: "usually " + M.round2(b.median) + unit + (b.mad ? "  ±" + M.round2(b.mad) : "") })
    ]);
  }

  function readinessCard(rd, full) {
    var kids = [
      el("div", { class: "advice-head" }, [
        icon(rd.status === "red" ? "warn" : rd.status === "amber" ? "info" : rd.status === "green" ? "check" : "info", 17),
        el("div", { class: "sug-head", text: rd.headline })
      ]),
      el("p", { class: "sug-detail", text: rd.detail })
    ];
    if (full && rd.signals.length) {
      kids.push(el("div", { class: "siglist" }, rd.signals.map(function (s) {
        return el("div", { class: "sigrow" + (s.low ? " low" : "") }, [
          el("span", { class: "siglabel", text: s.label }),
          el("span", { class: "sigval", text: s.text }),
          // the subjective composite is an internal score — never show it
          (s.comparison && s.key !== "subjective")
            ? el("span", { class: "sigbase", text: "usual " + M.round2(s.comparison.median) }) : null
        ]);
      })));
    }
    return el("div", { class: "card advice readiness-" + rd.status }, kids);
  }

  function checkinSheet(st, dateIso) {
    var existing = M.checkinFor(st, dateIso);
    var d = existing
      ? { energy: existing.energy, soreness: existing.soreness, workdayLoad: existing.workdayLoad,
          painOrIllness: !!existing.painOrIllness, note: existing.note || "" }
      : { energy: "normal", soreness: "low", workdayLoad: "normal", painOrIllness: false, note: "" };
    var sh = App.ui.sheet(dateIso === M.perthTodayISO() ? "How are you today?" : M.humanDate(dateIso));

    function group(key, label, opts) {
      var seg = el("div", { class: "seg wide" }, opts.map(function (o) {
        return el("button", { class: "segb" + (d[key] === o[0] ? " on" : ""), type: "button", text: o[1],
          onclick: function (e) {
            d[key] = o[0];
            [].forEach.call(seg.children, function (c) { c.classList.remove("on"); });
            e.currentTarget.classList.add("on");
          } });
      }));
      sh.body.appendChild(el("div", { class: "lf" }, [el("span", { class: "lflbl", text: label }), seg]));
    }
    group("energy", "Energy", [["low", "Low"], ["normal", "Normal"], ["high", "High"]]);
    group("soreness", "Soreness", [["low", "Low"], ["moderate", "Moderate"], ["high", "High"]]);
    group("workdayLoad", "Work today", [["light", "Light"], ["normal", "Normal"], ["very-physical", "Very physical"]]);

    var pain = el("input", { type: "checkbox" });
    pain.checked = d.painOrIllness;
    pain.addEventListener("change", function () { d.painOrIllness = pain.checked; });
    sh.body.appendChild(el("label", { class: "checkrow" }, [pain,
      el("span", { text: "Pain or feeling unwell" })]));

    var note = el("input", { class: "noteinput", type: "text", value: d.note, placeholder: "Note (optional)",
      oninput: function (e) { d.note = e.target.value; } });
    sh.body.appendChild(note);

    sh.body.appendChild(el("button", { class: "btn primary", type: "button", onclick: function () {
      if (existing) {
        existing.energy = d.energy; existing.soreness = d.soreness;
        existing.workdayLoad = d.workdayLoad; existing.painOrIllness = d.painOrIllness;
        existing.note = d.note; existing.updatedAt = U.nowISO();
      } else {
        st.readinessCheckins.push({
          checkinId: M.uid("rc"), date: dateIso, energy: d.energy, soreness: d.soreness,
          workdayLoad: d.workdayLoad, painOrIllness: d.painOrIllness, note: d.note, createdAt: U.nowISO()
        });
        st.readinessCheckins.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      }
      S.save(); sh.close(); render();
    } }, [existing ? "Save" : "Save check-in"]));

    if (existing) {
      sh.body.appendChild(el("button", { class: "btn danger sm", type: "button", onclick: function () {
        if (!confirm("Delete the check-in for " + M.humanDate(dateIso) + "?")) return;
        st.readinessCheckins = st.readinessCheckins.filter(function (c) { return c.date !== dateIso; });
        S.save(); sh.close(); render();
      } }, ["Delete this check-in"]));
    }
    sh.open();
  }

  function trendTone(st, slope) {
    var s = st.settings;
    if (slope >= s.bwTargetKgPerWeekLow && slope <= s.bwTargetKgPerWeekHigh) return "up";
    return "neutral";
  }

  function weighInSheet(st, dateIso) {
    var existing = M.bodyweightSeries(st).filter(function (b) { return b.date === dateIso; })[0];
    var sh = App.ui.sheet(M.humanDate(dateIso));
    var d = { kg: existing ? String(existing.kg) : "", note: existing ? (existing.note || "") : "" };
    var input = el("input", { class: "num", inputmode: "decimal", value: d.kg, "aria-label": "weight in kg",
      oninput: function (e) { d.kg = e.target.value; } });
    sh.body.appendChild(el("div", { class: "lf" }, [
      el("span", { class: "lflbl", text: "Weight (kg)" }), stepper(input, 0.1)
    ]));
    var note = el("input", { class: "noteinput", type: "text", value: d.note,
      placeholder: "Note (optional) — e.g. after a big weekend",
      oninput: function (e) { d.note = e.target.value; } });
    sh.body.appendChild(note);
    sh.body.appendChild(el("p", { class: "hint", text: "Same conditions each time gives a readable trend: first thing, after the toilet, before eating or drinking." }));
    sh.body.appendChild(el("button", { class: "btn primary", type: "button", onclick: function () {
      var kg = parseFloat(d.kg);
      if (isNaN(kg) || kg <= 0 || kg > 400) { App.ui.toast("Enter a weight in kg"); return; }
      kg = Math.round(kg * 10) / 10;
      if (existing) { existing.kg = kg; existing.note = d.note; }
      else {
        st.bodyweights.push({ entryId: M.uid("bw"), date: dateIso, kg: kg, note: d.note, createdAt: U.nowISO() });
      }
      S.save(); sh.close(); render();
    } }, [existing ? "Save" : "Log " + (d.kg || "") + " kg"]));
    if (existing) {
      sh.body.appendChild(el("button", { class: "btn danger sm", type: "button", onclick: function () {
        if (!confirm("Delete the weigh-in for " + M.humanDate(dateIso) + "?")) return;
        st.bodyweights = st.bodyweights.filter(function (b) { return b.date !== dateIso; });
        S.save(); sh.close(); render();
      } }, ["Delete this entry"]));
    }
    sh.open();
  }

  // Scatter of every weigh-in with the rolling average drawn over it.
  function weightChart(t) {
    var series = t.series;
    var W = 300, H = 130, PAD_L = 6, PAD_R = 6, PAD_T = 12, PAD_B = 18;
    var vals = series.map(function (p) { return p.kg; });
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    if (max === min) { max = min + 0.5; min = min - 0.5; }
    var pad = (max - min) * 0.15; min -= pad; max += pad;
    var t0 = M.isoToDate(series[0].date).getTime();
    var t1 = M.isoToDate(series[series.length - 1].date).getTime();
    var span = Math.max(1, t1 - t0);
    function x(dateIso) { return PAD_L + ((M.isoToDate(dateIso).getTime() - t0) / span) * (W - PAD_L - PAD_R); }
    function y(v) { return PAD_T + (1 - (v - min) / (max - min)) * (H - PAD_T - PAD_B); }

    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "spark");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Body weight from " + series[0].kg + " to " + series[series.length - 1].kg + " kg");
    function add(tag, attrs) {
      var n = document.createElementNS(NS, tag);
      Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
      svg.appendChild(n); return n;
    }
    [0, 0.5, 1].forEach(function (f) {
      var yy = PAD_T + f * (H - PAD_T - PAD_B);
      add("line", { class: "gridln", x1: PAD_L, x2: W - PAD_R, y1: yy, y2: yy });
    });
    // raw weigh-ins
    series.forEach(function (p) { add("circle", { class: "scatter", cx: x(p.date), cy: y(p.kg), r: 2.4 }); });
    // rolling average
    var roll = t.rolling.filter(function (r) { return r.avg != null; });
    if (roll.length > 1) {
      add("polyline", { class: "trend", points: roll.map(function (r) { return x(r.date) + "," + y(r.avg); }).join(" ") });
      var last = roll[roll.length - 1];
      add("circle", { class: "dot", cx: x(last.date), cy: y(last.avg), r: 4 });
    }
    var wrap = el("div", { class: "chartwrap" }, [svg]);
    wrap.appendChild(el("div", { class: "chartaxis" }, [
      el("span", { text: M.shortDate(series[0].date) }),
      el("span", { class: "chartmax", text: roll.length ? "avg " + roll[roll.length - 1].avg + " kg" : "" }),
      el("span", { text: M.shortDate(series[series.length - 1].date) })
    ]));
    return wrap;
  }

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

  function deviceMatchesSourceOfTruth(sot) {
    var p = App.env.platform();
    if (sot === "iphone") return p === "iphone" || p === "ipad";
    if (sot === "mac") return p === "mac";
    return true;
  }

  App.views = {
    Today: Today, Session: Session, SessionDetail: SessionDetail,
    History: History, ExerciseDetail: ExerciseDetail,
    Food: Food, Body: Body,
    More: More, Placeholder: Placeholder,
    MigrationRecovery: MigrationRecovery
  };
})();
