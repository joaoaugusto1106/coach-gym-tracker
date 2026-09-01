/* Screens. Each returns a .screen node; app.js swaps it in and appends the
   tab bar. Re-render happens on discrete actions (never mid-keystroke), so
   in-progress input for the current exercise is held in `draft`. */

window.App = window.App || {};
(function () {
  var el = App.ui.el, icon = App.ui.icon, M = App.model, S = App.store;

  function render() { return App.render(); }
  var draft = {};   // entryId -> { weight, reps, rir }

  // ---- shell helpers -----------------------------------------------------
  function navbar(opts) {
    opts = opts || {};
    return el("div", { class: "navbar" }, [
      opts.lead
        ? el("button", { class: "lead", type: "button", onclick: opts.lead.onClick },
            [icon("chev", 18), opts.lead.label])
        : el("span", {}),
      el("span", { class: "navtitle", text: opts.title || "" }),
      opts.trail
        ? el("button", { class: "trail", type: "button", onclick: opts.trail.onClick, text: opts.trail.label })
        : el("span", {})
    ]);
  }

  function screen(navOpts, nodes, largeTitle, sub) {
    // iOS pattern: the inline nav title only shows once the large title scrolls away.
    if (largeTitle) navOpts = { lead: navOpts && navOpts.lead, trail: navOpts && navOpts.trail };
    var content = el("div", { class: "content" });
    if (largeTitle) {
      content.appendChild(el("h1", { class: "largetitle" },
        [largeTitle, sub ? el("span", { class: "sub", text: sub }) : null]));
    }
    (nodes || []).forEach(function (n) { if (n) content.appendChild(n); });
    return el("div", { class: "screen" }, [navbar(navOpts), content]);
  }

  // ---- Today -----------------------------------------------------------
  function Today() {
    var st = S.get();
    var info = M.phaseInfo(st.settings);
    var nd = M.nextDay(st);
    var active = st.activeSession;
    var nodes = [];

    nodes.push(el("div", { class: "muscle" }, [
      el("span", { class: "chip", text: "Phase " + info.phase + " · Wk " + info.week + (info.isDeloadWeek ? " · deload" : "") }),
      el("span", { class: "chip m", text: "Variant " + nd.variant.label })
    ]));

    if (active) {
      var nSets = active.entries.reduce(function (a, e) { return a + e.sets.length; }, 0);
      nodes.push(el("div", { class: "card" }, [
        el("span", { class: "eyebrow", text: "Session in progress" }),
        el("div", { class: "rowb" }, [
          el("b", { text: active.dayName }),
          el("span", { class: "chip m", text: active.entries.length + " ex · " + nSets + " sets" })
        ]),
        el("button", { class: "btn primary", type: "button", onclick: function () { location.hash = "#/session"; } }, ["Resume session"]),
        el("button", { class: "btn ghost", type: "button", onclick: function () {
          if (confirm("Discard the session in progress? Logged sets will be lost.")) { st.activeSession = null; S.save(); render(); }
        } }, ["Discard"])
      ]));
    }

    var slotRows = nd.day.slots.map(function (slot, i) {
      var sug = M.overloadSuggestion(st, slot.exerciseId, slot);
      return el("div", { class: "exrow" }, [
        el("div", { class: "exrow-name", text: (i + 1) + ".  " + M.exerciseName(st, slot.exerciseId) }),
        el("div", { class: "exrow-target", text: M.repRangeText(slot) + (slot.note ? "  ·  " + slot.note : "") }),
        el("div", { class: "exrow-last" + (sug.tone === "none" ? " dim" : " sug-" + sug.tone), text: sug.headline })
      ]);
    });

    nodes.push(el("div", { class: "card" }, [
      el("span", { class: "eyebrow", text: "Today · " + nd.day.name }),
      el("div", { class: "exlist" }, slotRows),
      active ? null : el("button", { class: "btn primary", type: "button", onclick: startSession }, ["Start session"])
    ]));

    if (!active) {
      nodes.push(el("div", { class: "card" }, [
        el("span", { class: "eyebrow", text: "Not that day today?" }),
        el("div", { class: "daypick" }, nd.variant.days.map(function (d, idx) {
          return el("button", {
            class: "chip" + (idx === nd.dayIndex ? "" : " m"), type: "button",
            onclick: function () { st.rotationIndex = idx; S.save(); render(); }
          }, [d.name]);
        }))
      ]));
    }

    return screen({ title: "Today" }, nodes, "Today", M.humanDate(new Date()));
  }

  // ---- start / finish -------------------------------------------------
  function startSession() {
    var st = S.get();
    if (st.activeSession) { location.hash = "#/session"; return; }
    var nd = M.nextDay(st);
    var info = M.phaseInfo(st.settings);
    st.activeSession = {
      id: M.uid("s"),
      date: M.todayISO(),
      startedAt: new Date().toISOString(),
      endedAt: null,
      variantLabel: nd.variant.label,
      dayTemplateId: nd.day.id,
      dayName: nd.day.name,
      dayIndex: nd.dayIndex,
      phase: info.phase,
      week: info.week,
      bodyweightAtSession: null,
      notes: "",
      healthLogged: false,
      entries: nd.day.slots.map(function (slot, i) {
        return {
          id: M.uid("e"),
          slotId: nd.day.id + ":" + i,
          prescribedExerciseId: slot.exerciseId,
          exerciseId: slot.exerciseId,
          altIds: slot.altIds ? slot.altIds.slice() : [],
          slot: { sets: slot.sets, repLow: slot.repLow, repHigh: slot.repHigh, rir: slot.rir, note: slot.note || "" },
          wasSwapped: false,
          order: i,
          sets: []
        };
      })
    };
    S.save();
    location.hash = "#/session";
  }

  function finishSession(st, as) {
    var total = as.entries.reduce(function (a, e) { return a + e.sets.length; }, 0);
    if (total === 0 && !confirm("No sets logged. Save this session anyway?")) return;
    as.endedAt = new Date().toISOString();
    // keep prescribed exercises for the record; drop untouched freestyle adds
    as.entries = as.entries.filter(function (e) { return e.sets.length > 0 || e.slotId; });
    M.recomputeSessionPRs(st, as);                 // authoritative PR pass
    var prs = M.collectSessionPRs(st, as);
    st.sessions.push(as);
    var v = M.activeVariant(st);
    var doneIdx = (as.dayIndex == null) ? st.rotationIndex : as.dayIndex;
    st.rotationIndex = (doneIdx + 1) % v.days.length;
    st.activeSession = null;
    draft = {};
    S.save();
    location.hash = "#/history";
    render();
    if (prs.length) showPRSummary(st, as, prs);
    else App.ui.toast("Session saved");
  }

  function showPRSummary(st, session, prs) {
    var sh = App.ui.sheet(prs.length + (prs.length === 1 ? " new PR" : " new PRs"));
    sh.body.appendChild(el("p", { class: "hint", text: session.dayName + " · " + M.shortDate(session.date) + " — saved." }));
    prs.forEach(function (p) {
      sh.body.appendChild(el("div", { class: "pr-line" }, [
        icon("trophy", 18),
        el("div", {}, [
          el("div", { class: "pr-line-name", text: M.exerciseName(st, p.exerciseId) }),
          el("div", { class: "pr-line-detail", text: p.label + "  ·  " + p.weightKg + " kg × " + p.reps })
        ])
      ]));
    });
    sh.body.appendChild(el("button", { class: "btn primary", type: "button",
      onclick: function () { sh.close(); location.hash = "#/history"; } }, ["Done"]));
    sh.open();
  }

  // ---- Session (active) ---------------------------------------------
  function Session() {
    var st = S.get();
    var as = st.activeSession;
    if (!as) {
      return screen({ title: "Session" }, [
        el("div", { class: "card empty" }, [
          el("p", { text: "No session in progress." }),
          el("button", { class: "btn primary", type: "button", onclick: function () { location.hash = "#/today"; } }, ["Go to Today"])
        ])
      ], "Session");
    }

    var nodes = [];
    nodes.push(el("div", { class: "muscle" }, [
      el("span", { class: "chip", text: "Phase " + as.phase + " · Wk " + as.week }),
      el("span", { class: "chip m", text: "Variant " + as.variantLabel })
    ]));

    as.entries.forEach(function (entry) { nodes.push(exerciseCard(st, as, entry)); });

    nodes.push(el("button", { class: "btn ghost", type: "button", onclick: function () { addExercise(st, as); } },
      [icon("plus", 16), " Add exercise"]));

    nodes.push(el("div", { class: "finishbar" }, [
      el("button", { class: "btn primary", type: "button", onclick: function () { finishSession(st, as); } }, ["Finish & save"]),
      el("button", { class: "btn danger sm", type: "button", onclick: function () {
        if (confirm("Discard this session? Logged sets will be lost.")) { st.activeSession = null; S.save(); location.hash = "#/today"; }
      } }, ["Discard session"]),
      el("p", { class: "hint", text: "“Save & log to Apple Health” arrives in a later stage." })
    ]));

    return screen({ title: as.dayName, lead: { label: "Today", onClick: function () { location.hash = "#/today"; } } }, nodes);
  }

  function getDraft(entry) {
    if (!draft[entry.id]) {
      // once you've logged a set this session, keep going from that; otherwise
      // start from your first working set last time (match, then beat).
      var lastLogged = entry.sets[entry.sets.length - 1];
      var lp = M.lastPerformance(S.get(), entry.exerciseId, S.get().activeSession && S.get().activeSession.id);
      var firstLast = lp && (M.workingSets(lp.sets)[0] || lp.sets[0]);
      var base = lastLogged || firstLast || null;
      draft[entry.id] = {
        weight: base ? String(base.weightKg) : "",
        reps: base ? String(base.reps) : String(entry.slot ? entry.slot.repLow : 8),
        rir: base ? base.rir : (entry.slot ? entry.slot.rir : 2)
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
    var options = [entry.exerciseId].concat(entry.altIds || []).filter(function (v, i, a) { return a.indexOf(v) === i; });

    var swapBtn = null;
    if (options.length > 1) {
      swapBtn = el("button", { class: "swapbtn", type: "button", "aria-label": "swap exercise",
        onclick: function () { swapExercise(st, entry, options); } }, [icon("swap", 16)]);
    }

    var last = M.lastPerformance(st, entry.exerciseId, as.id);
    var sug = M.overloadSuggestion(st, entry.exerciseId, entry.slot);

    var setList = entry.sets.length ? el("div", { class: "setlog" }, entry.sets.map(function (s, i) {
      var prl = M.prLabel(s.prFlags, s.weightKg);
      return el("div", { class: "setlogrow" }, [
        el("span", { class: "n", text: String(i + 1) }),
        el("span", { class: "sv", text: s.weightKg + " kg × " + s.reps }),
        el("span", { class: "rir", text: "RIR " + s.rir }),
        prl ? el("span", { class: "pr-tag", text: "▲ " + prl }) : null,
        el("button", { class: "del", type: "button", "aria-label": "delete set", onclick: function () {
          entry.sets.splice(i, 1); S.save(); render();
        } }, [icon("x", 14)])
      ]);
    })) : null;

    var wInput = el("input", { class: "num", inputmode: "decimal", value: d.weight, "aria-label": "weight in kg",
      oninput: function (e) { d.weight = e.target.value; } });
    var rInput = el("input", { class: "num", inputmode: "numeric", value: d.reps, "aria-label": "reps",
      oninput: function (e) { d.reps = e.target.value; } });

    var seg = el("div", { class: "seg" }, [0, 1, 2, 3, 4].map(function (v) {
      return el("button", { class: "segb" + (v === d.rir ? " on" : ""), type: "button",
        onclick: function () { d.rir = v; render(); }, text: String(v) });
    }));

    var logBtn = el("button", { class: "btn primary sm", type: "button", onclick: function () {
      var w = parseFloat(d.weight), r = parseInt(d.reps, 10);
      if (isNaN(w) || w < 0) { App.ui.toast("Enter a weight"); return; }
      if (isNaN(r) || r < 1) { App.ui.toast("Enter reps"); return; }
      var rir = (d.rir == null) ? 2 : d.rir;
      var set = { weightKg: w, reps: r, rir: rir, warmup: false, e1rm: M.epley(w, r) };
      var prior = M.priorSetsLive(st, entry.exerciseId, entry, entry.sets.length);
      set.prFlags = M.prsForSet(prior, set);
      entry.sets.push(set);
      S.save(); render();
      if (set.prFlags.length) App.ui.toast("New PR · " + M.prLabel(set.prFlags, w));
    } }, ["Log set"]);

    return el("div", { class: "card ex" }, [
      el("div", { class: "ex-head" }, [
        el("div", { class: "ex-name", text: ex ? ex.name : entry.exerciseId }),
        swapBtn
      ]),
      el("div", { class: "ex-meta" }, [
        el("span", { class: "ex-target", text: M.repRangeText(entry.slot) }),
        entry.slot && entry.slot.note ? el("span", { class: "ex-note", text: entry.slot.note }) : null
      ]),
      last
        ? el("div", { class: "recall" }, [
            el("div", { class: "recall-head" }, [
              el("span", { class: "eyebrow", text: "Last time · " + M.shortDate(last.date) }),
              el("span", { class: "eyebrow", text: "RIR" })
            ]),
            el("div", { class: "recall-sets" }, last.sets.map(function (s, i) {
              return el("div", { class: "recall-row" }, [
                el("span", { class: "n", text: String(i + 1) }),
                el("span", { class: "sv", text: s.weightKg + " kg × " + s.reps }),
                el("span", { class: "rir", text: (s.rir == null ? "–" : String(s.rir)) })
              ]);
            })),
            el("div", { class: "recall-sug sug-" + sug.tone }, [
              icon(sug.tone === "back" ? "warn" : "up", 16),
              el("div", {}, [
                el("div", { class: "sug-head", text: sug.headline }),
                el("div", { class: "sug-detail", text: sug.detail })
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
          el("label", { class: "lf" }, [el("span", { class: "lflbl", text: "Weight (kg)" }), stepper(wInput, 2.5)]),
          el("label", { class: "lf" }, [el("span", { class: "lflbl", text: "Reps" }), stepper(rInput, 1)])
        ]),
        el("div", { class: "lf" }, [el("span", { class: "lflbl", text: "Reps in reserve" }), seg]),
        logBtn
      ])
    ]);
  }

  function swapExercise(st, entry, options) {
    var sh = App.ui.sheet("Swap exercise");
    sh.body.appendChild(el("p", { class: "hint", text: "Machine taken? Pick an alternative — your history for it carries over." }));
    options.forEach(function (id) {
      var isCur = id === entry.exerciseId;
      var isPrescribed = id === entry.prescribedExerciseId;
      sh.body.appendChild(el("button", {
        class: "btn ghost" + (isCur ? " primary" : ""), type: "button",
        onclick: function () {
          entry.exerciseId = id;
          entry.wasSwapped = id !== entry.prescribedExerciseId;
          delete draft[entry.id];
          S.save(); sh.close(); render();
        }
      }, [M.exerciseName(st, id) + (isPrescribed ? "  ·  prescribed" : "")]));
    });
    sh.open();
  }

  function addExercise(st, as) {
    var sh = App.ui.sheet("Add exercise");
    var groups = {};
    st.exercises.forEach(function (e) { (groups[e.muscleGroup] = groups[e.muscleGroup] || []).push(e); });
    var sel = el("select", { class: "bigselect", size: 1 });
    App.MUSCLES.forEach(function (mg) {
      if (!groups[mg]) return;
      var og = el("optgroup", { label: mg.charAt(0).toUpperCase() + mg.slice(1) });
      groups[mg].sort(function (a, b) { return a.name < b.name ? -1 : 1; }).forEach(function (e) {
        og.appendChild(el("option", { value: e.id, text: e.name }));
      });
      sel.appendChild(og);
    });
    sh.body.appendChild(sel);
    sh.body.appendChild(el("button", { class: "btn primary", type: "button", onclick: function () {
      var id = sel.value;
      if (!id) return;
      as.entries.push({
        id: M.uid("e"), slotId: null, prescribedExerciseId: id, exerciseId: id,
        altIds: [], slot: null, wasSwapped: false, order: as.entries.length, sets: []
      });
      S.save(); sh.close(); render();
    } }, ["Add to session"]));
    sh.open();
  }

  // ---- History -------------------------------------------------------
  function History() {
    var st = S.get();
    var sessions = st.sessions.slice().sort(function (a, b) { return a.startedAt < b.startedAt ? 1 : -1; });
    var nodes = [];

    if (!sessions.length) {
      nodes.push(el("div", { class: "card empty" }, [
        icon("cal", 28),
        el("p", { text: "No sessions yet. Start one from Today — it shows up here, and it's still here after you close the app." })
      ]));
    } else {
      sessions.forEach(function (s) {
        var sets = s.entries.reduce(function (a, e) { return a + e.sets.length; }, 0);
        var prCount = M.collectSessionPRs(st, s).length;
        nodes.push(el("a", { class: "card sess", href: "#/session/" + s.id }, [
          el("div", { class: "rowb" }, [
            el("b", { text: M.shortDate(s.date) + " · " + s.dayName }),
            el("span", { class: "chip m", text: s.entries.length + " ex · " + sets + " sets" })
          ]),
          el("div", { class: "muscle" }, [
            el("span", { class: "chip m", text: "Phase " + s.phase + " · Wk " + s.week }),
            el("span", { class: "chip m", text: "Variant " + s.variantLabel }),
            prCount ? el("span", { class: "chip pr", text: "▲ " + prCount + " PR" }) : null
          ])
        ]));
      });
    }
    return screen({ title: "History" }, nodes, "History");
  }

  function SessionDetail(id) {
    var st = S.get();
    var s = null;
    for (var i = 0; i < st.sessions.length; i++) if (st.sessions[i].id === id) s = st.sessions[i];
    var back = { label: "History", onClick: function () { location.hash = "#/history"; } };
    if (!s) {
      return screen({ title: "Session", lead: back }, [
        el("div", { class: "card empty" }, [el("p", { text: "Session not found." })])
      ]);
    }
    var nodes = [el("div", { class: "muscle" }, [
      el("span", { class: "chip m", text: "Phase " + s.phase + " · Wk " + s.week }),
      el("span", { class: "chip m", text: "Variant " + s.variantLabel }),
      el("span", { class: "chip m", text: s.dayName })
    ])];

    var logged = s.entries.filter(function (e) { return e.sets.length; });
    if (!logged.length) {
      nodes.push(el("div", { class: "card empty" }, [el("p", { text: "No sets were logged in this session." })]));
    }
    logged.forEach(function (e) {
      nodes.push(el("div", { class: "card" }, [
        el("div", { class: "ex-name", text: M.exerciseName(st, e.exerciseId) + (e.wasSwapped ? "  (swapped)" : "") }),
        el("div", { class: "setlog" }, e.sets.map(function (x, i) {
          var prl = M.prLabel(x.prFlags, x.weightKg);
          return el("div", { class: "setlogrow" }, [
            el("span", { class: "n", text: String(i + 1) }),
            el("span", { class: "sv", text: x.weightKg + " kg × " + x.reps }),
            el("span", { class: "rir", text: "RIR " + x.rir }),
            prl ? el("span", { class: "pr-tag", text: "▲ " + prl }) : null
          ]);
        }))
      ]));
    });

    return screen({ title: M.shortDate(s.date), lead: back }, nodes);
  }

  // ---- placeholders + More ----------------------------------------
  function Placeholder(title, msg) {
    return screen({ title: title }, [el("div", { class: "card empty" }, [el("p", { text: msg })])], title);
  }

  function exportData() {
    var blob = new Blob([S.exportJSON()], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = el("a", { href: url, download: "coach-backup-" + M.todayISO() + ".json" });
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
  }

  function importData() {
    var inp = el("input", { type: "file", accept: "application/json,.json", style: "display:none" });
    inp.addEventListener("change", function () {
      var f = inp.files && inp.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          S.importJSON(String(reader.result));
          App.applyTheme();
          App.ui.toast("Data imported");
          location.hash = "#/today"; render();
        } catch (e) { App.ui.toast("Import failed — not a valid backup"); }
      };
      reader.readAsText(f);
    });
    document.body.appendChild(inp); inp.click();
    setTimeout(function () { if (inp.parentNode) inp.parentNode.removeChild(inp); }, 1000);
  }

  function More() {
    var st = S.get();
    var s = st.settings;
    var nodes = [];

    nodes.push(el("div", { class: "card" }, [
      el("span", { class: "eyebrow", text: "Program" }),
      el("div", { class: "rowb" }, [el("span", { text: "Phase length" }), el("b", { text: s.phaseLengthWeeks + " weeks" })]),
      el("div", { class: "rowb" }, [el("span", { text: "Phase start date" }), el("b", { text: s.phaseStartDate })]),
      el("button", { class: "btn ghost sm", type: "button", onclick: function () {
        var v = prompt("Phase start date (YYYY-MM-DD) — the Monday your current phase began:", s.phaseStartDate);
        if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) { s.phaseStartDate = v; S.save(); render(); }
        else if (v != null) App.ui.toast("Use the format 2026-09-01");
      } }, ["Change start date"])
    ]));

    nodes.push(el("div", { class: "card" }, [
      el("span", { class: "eyebrow", text: "Appearance" }),
      el("div", { class: "seg wide" }, ["auto", "light", "dark"].map(function (t) {
        return el("button", { class: "segb" + (s.theme === t ? " on" : ""), type: "button",
          onclick: function () { s.theme = t; S.save(); App.applyTheme(); render(); },
          text: t.charAt(0).toUpperCase() + t.slice(1) });
      }))
    ]));

    nodes.push(el("div", { class: "card" }, [
      el("span", { class: "eyebrow", text: "Backup" }),
      el("p", { class: "hint", text: "Data lives on this device only. Export a copy before clearing Safari data or moving to another device." }),
      el("button", { class: "btn ghost sm", type: "button", onclick: exportData }, ["Export data (JSON)"]),
      el("button", { class: "btn ghost sm", type: "button", onclick: importData }, ["Import data"]),
      el("button", { class: "btn danger sm", type: "button", onclick: function () {
        if (confirm("Erase everything and reload the seed program? This cannot be undone.")) {
          S.resetAll(); App.applyTheme(); location.hash = "#/today"; render();
        }
      } }, ["Reset all data"])
    ]));

    nodes.push(el("p", { class: "hint center", text: "Coach · stage 1" }));
    return screen({ title: "More" }, nodes, "More");
  }

  App.views = {
    Today: Today,
    Session: Session,
    SessionDetail: SessionDetail,
    History: History,
    More: More,
    Placeholder: Placeholder
  };
})();
