/* Persistence, migrations, validation, backups.

   One JSON blob at localStorage["coach.v1"] (the key is just a namespace —
   `schemaVersion` inside it is the real version). Sibling keys:
     coach.lkg              last-known-good copy (previous successful save)
     coach.backup.<id>      rolling + pre-migration snapshots

   Safety contract:
   - Every save() first copies the previous good blob to coach.lkg.
   - A migration snapshots the ORIGINAL before touching it, validates the
     result, and on any failure returns the original untouched (schema stays
     as-is) with App.store.migrationError set — the app then shows a recovery
     screen instead of risking the data.
   - Import validates + previews + snapshots current before replacing.        */

window.App = window.App || {};
(function () {
  var U = App.util;
  var KEY = "coach.v1";
  var LKG_KEY = "coach.lkg";
  var BACKUP_PREFIX = "coach.backup.";
  var SCHEMA = 2;
  var APP_VERSION = "0.90.0";
  var MAX_ROLLING_BACKUPS = 5;

  var state = null;

  // ---------------------------------------------------------------- seed
  function seedState() {
    var today = U.perthDateISO();
    var now = U.nowISO();
    var pv = U.deepCopy(App.PROGRAM_SEED);
    pv.effectiveStartDate = today;
    pv.createdAt = now;
    return {
      schemaVersion: SCHEMA,
      meta: {
        appVersion: APP_VERSION, createdAt: now, updatedAt: now,
        lastSuccessfulSaveAt: null, lastBackupAt: null,
        migrationHistory: [], timezone: "Australia/Perth",
        weightUnit: "kg", sourceOfTruthDevice: "unset"
      },
      settings: {
        phaseStartDate: today, phaseLengthWeeks: 6, blockPhases: 3,
        kcalTargetLow: 3400, kcalTargetHigh: 3500, proteinTarget: 200,
        bwTargetKgPerWeekLow: 0.2, bwTargetKgPerWeekHigh: 0.3,
        theme: "auto",
        healthWriteShortcutName: "Log Strength Workout",
        healthReadShortcutName: "Read Recovery",
        restTimerDefaultSec: 150,
        mealPlan: U.deepCopy(App.NUTRITION_SEED)
      },
      rotationIndex: 0,
      manualDayId: null,
      activeProgramVersionId: pv.id,
      programVersions: [pv],
      exercises: App.EXERCISE_SEED.map(U.deepCopy),
      movementFamilies: U.deepCopy(App.MOVEMENT_FAMILIES),
      activeSession: null,
      sessions: [],
      bodyweights: [], nutritionDays: [], recoveryReadings: [], readinessCheckins: [],
      cardioSessions: [],
      importEvents: [], backups: []
    };
  }

  // -------------------------------------------------------- v1 -> v2 migration
  function migrateV1toV2(s) {
    var now = U.nowISO();
    var set = s.settings || {};
    var start = set.phaseStartDate || U.perthDateISO();

    s.meta = {
      appVersion: APP_VERSION,
      createdAt: earliestDate(s) || now,
      updatedAt: now,
      lastSuccessfulSaveAt: null,
      lastBackupAt: null,
      migrationHistory: (s.meta && s.meta.migrationHistory) || [],
      timezone: "Australia/Perth",
      weightUnit: "kg",
      sourceOfTruthDevice: "unset"
    };

    set.phaseStartDate = start;
    set.phaseLengthWeeks = set.phaseLengthWeeks || 6;
    set.blockPhases = set.blockPhases || 3;
    if (set.kcalTargetLow == null) set.kcalTargetLow = set.kcalTarget ? set.kcalTarget - 50 : 3400;
    if (set.kcalTargetHigh == null) set.kcalTargetHigh = set.kcalTarget ? set.kcalTarget + 50 : 3500;
    if (set.proteinTarget == null) set.proteinTarget = 200;
    if (set.bwTargetKgPerWeekLow == null) set.bwTargetKgPerWeekLow = 0.2;
    if (set.bwTargetKgPerWeekHigh == null) set.bwTargetKgPerWeekHigh = 0.3;
    if (!set.theme) set.theme = "auto";
    set.healthWriteShortcutName = set.healthWriteShortcutName || set.healthShortcutName || "Log Strength Workout";
    set.healthReadShortcutName = set.healthReadShortcutName || "Read Recovery";
    if (set.restTimerDefaultSec == null) set.restTimerDefaultSec = 150;
    if (!set.mealPlan || !Array.isArray(set.mealPlan.checkpoints)) set.mealPlan = U.deepCopy(App.NUTRITION_SEED);
    s.settings = set;

    if (typeof s.rotationIndex !== "number") s.rotationIndex = 0;
    if (s.manualDayId === undefined) s.manualDayId = null;

    // program (single, mutable) -> programVersions[] (append-only)
    if (!Array.isArray(s.programVersions) || !s.programVersions.length) {
      var pv = U.deepCopy(App.PROGRAM_SEED);
      pv.effectiveStartDate = start;
      pv.createdAt = now;
      s.programVersions = [pv];
    }
    s.activeProgramVersionId = s.activeProgramVersionId || s.programVersions[0].id;
    delete s.program;

    // exercise library -> enriched catalog
    var seedById = {};
    App.EXERCISE_SEED.forEach(function (e) { seedById[e.id] = e; });
    s.exercises = (s.exercises || []).map(function (e) {
      var seed = seedById[e.id] || {};
      return {
        id: e.id,
        name: e.name || seed.name || e.id,
        muscleGroup: e.muscleGroup || seed.muscleGroup || "core",
        equipment: e.equipment || seed.equipment || "machine",
        movementFamilyId: e.movementFamilyId || seed.movementFamilyId || null,
        movementPattern: e.movementPattern || seed.movementPattern || null,
        secondaryMuscles: e.secondaryMuscles || [],
        defaultLoadIncrementKg: e.defaultLoadIncrementKg != null ? e.defaultLoadIncrementKg
          : (seed.defaultLoadIncrementKg != null ? seed.defaultLoadIncrementKg
            : (e.equipment === "dumbbell" ? 2 : 2.5)),
        referenceImage: e.referenceImage || null,
        active: e.active !== false,
        userNote: e.userNote || ""
      };
    });
    var have = {};
    s.exercises.forEach(function (e) { have[e.id] = true; });
    App.EXERCISE_SEED.forEach(function (e) { if (!have[e.id]) s.exercises.push(U.deepCopy(e)); });

    s.movementFamilies = s.movementFamilies || U.deepCopy(App.MOVEMENT_FAMILIES);

    var exFam = {};
    s.exercises.forEach(function (e) { exFam[e.id] = e.movementFamilyId; });
    (s.sessions || []).forEach(function (ss) { upgradeSession(ss, exFam, "completed"); });
    if (s.activeSession) upgradeSession(s.activeSession, exFam, "draft");

    s.bodyweights = s.bodyweights || [];
    s.nutritionDays = s.nutritionDays || s.nutrition || [];
    s.recoveryReadings = s.recoveryReadings || s.recovery || [];
    s.readinessCheckins = s.readinessCheckins || [];
    // v1 kept a loose `cardio` list. It used to be deleted here, which is why
    // rides had nowhere to live; carry anything that was in there across.
    s.cardioSessions = s.cardioSessions || s.cardio || [];
    s.importEvents = s.importEvents || [];
    s.backups = s.backups || [];
    delete s.nutrition; delete s.recovery; delete s.cardio;

    s.meta.migrationHistory.push({ from: 1, to: 2, at: now });
    s.schemaVersion = 2;
    return s;
  }

  function upgradeSession(ss, exFam, defaultStatus) {
    if (!ss.id) ss.id = U.uid("s");
    if (!ss.dayId) ss.dayId = String(ss.dayTemplateId || "push").replace(/^[A-Za-z]-/, "");
    if (!ss.programVersionId) ss.programVersionId = "pv1";
    if (!ss.startMode) ss.startMode = "scheduled";
    if (!ss.status) ss.status = ss.endedAt ? "completed" : defaultStatus;
    if (ss.rotationPositionSnapshot == null) ss.rotationPositionSnapshot = (ss.dayIndex != null ? ss.dayIndex : 0);
    if (ss.advancesRotation == null) ss.advancesRotation = (ss.status === "completed");
    if (!ss.date) ss.date = String(ss.startedAt || "").slice(0, 10) || U.perthDateISO();
    if (ss.recoverySnapshot === undefined) ss.recoverySnapshot = null;
    if (ss.notes == null) ss.notes = "";
    if (ss.createdAt == null) ss.createdAt = ss.startedAt || U.nowISO();
    ss.updatedAt = ss.updatedAt || U.nowISO();

    if (!Array.isArray(ss.entries)) ss.entries = [];
    ss.entries.forEach(function (en, ei) {
      if (!en.id) en.id = U.uid("e");
      if (en.order == null) en.order = ei;
      if (!en.movementFamilyId) en.movementFamilyId = exFam[en.exerciseId] || null;
      if (en.planSlotId === undefined) en.planSlotId = en.slotId || null;
      if (en.prescribedExerciseId === undefined) en.prescribedExerciseId = en.exerciseId;
      if (!Array.isArray(en.altIds)) en.altIds = [];
      if (en.note == null) en.note = "";
      if (en.substitutionReason === undefined) en.substitutionReason = null;
      if (en.wasSwapped == null) en.wasSwapped = false;
      if (!Array.isArray(en.sets)) en.sets = [];
      en.sets.forEach(function (stg, si) {
        if (!stg.id) stg.id = U.uid("set");
        if (stg.order == null) stg.order = si;
        if (!stg.type) stg.type = stg.warmup ? "warmup" : "working";
        delete stg.warmup;
        if (stg.rir === undefined) stg.rir = null;
        if (stg.note === undefined) stg.note = null;
        if (stg.loggedAt === undefined) stg.loggedAt = null;
        if (stg.e1rm == null && stg.weightKg != null && stg.reps != null) {
          stg.e1rm = stg.weightKg * (1 + stg.reps / 30);
        }
        if (!Array.isArray(stg.prFlags)) stg.prFlags = [];
      });
    });
  }

  function earliestDate(s) {
    var d = null;
    (s.sessions || []).forEach(function (ss) {
      var x = ss.date || String(ss.startedAt || "").slice(0, 10);
      if (x && (!d || x < d)) d = x;
    });
    return d;
  }

  // A defensive top-up for data already at v2 (fills fields a newer build added).
  function normalizeV2(s) {
    if (!s.meta) s.meta = seedState().meta;
    if (!s.settings) s.settings = seedState().settings;
    ["sessions", "bodyweights", "nutritionDays", "recoveryReadings", "readinessCheckins",
     "cardioSessions", "importEvents", "backups", "exercises", "programVersions",
     "movementFamilies"].forEach(function (k) {
      if (!Array.isArray(s[k])) s[k] = [];
    });
    if (!s.programVersions.length) {
      var pv = U.deepCopy(App.PROGRAM_SEED);
      pv.effectiveStartDate = s.settings.phaseStartDate; pv.createdAt = U.nowISO();
      s.programVersions = [pv];
    }
    if (!s.activeProgramVersionId) s.activeProgramVersionId = s.programVersions[0].id;
    // Backfill A/B/C variants onto versions saved before they existed. This is a
    // seed backfill, not a shape change -- the field is optional and the model
    // falls back to `days` when it is absent -- so it belongs here alongside the
    // new-exercise backfill rather than in a numbered migration.
    // Whatever `days` the version already had becomes variant A, so a program
    // the user edited is preserved rather than overwritten by the seed.
    s.programVersions.forEach(function (pv) {
      if (Array.isArray(pv.variants) && pv.variants.length) return;
      var seed = App.PROGRAM_VARIANT_SEED || [];
      if (!seed.length) return;
      pv.variants = seed.map(function (v, i) {
        return {
          id: v.id, name: v.name, blurb: v.blurb,
          days: (i === 0 && Array.isArray(pv.days) && pv.days.length)
            ? U.deepCopy(pv.days)
            : U.deepCopy(v.days)
        };
      });
    });
    if (!s.settings.mealPlan || !Array.isArray(s.settings.mealPlan.checkpoints)) {
      s.settings.mealPlan = U.deepCopy(App.NUTRITION_SEED);
    }
    if (typeof s.rotationIndex !== "number") s.rotationIndex = 0;
    if (s.manualDayId === undefined) s.manualDayId = null;
    if (s.activeSession === undefined) s.activeSession = null;
    var exFam = {};
    s.exercises.forEach(function (e) { exFam[e.id] = e.movementFamilyId; });
    s.sessions.forEach(function (ss) { upgradeSession(ss, exFam, "completed"); });
    if (s.activeSession) upgradeSession(s.activeSession, exFam, "draft");
    return s;
  }

  // ---------------------------------------------------------------- validation
  function validateState(s) {
    var errors = [], warnings = [];
    if (!s || typeof s !== "object") return { ok: false, errors: ["not an object"], warnings: [], summary: {} };
    if (s.schemaVersion !== SCHEMA) errors.push("schemaVersion is " + s.schemaVersion + ", expected " + SCHEMA);
    if (!s.meta) errors.push("missing meta");
    if (!s.settings) errors.push("missing settings");
    ["sessions", "exercises", "programVersions"].forEach(function (k) {
      if (!Array.isArray(s[k])) errors.push("missing/!array " + k);
    });
    if (Array.isArray(s.programVersions) && !s.programVersions.length) errors.push("no program versions");

    (s.cardioSessions || []).forEach(function (c, i) {
      if (!c || !c.id) { errors.push("cardioSessions[" + i + "] has no id"); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date || "")) errors.push("cardio " + c.id + " bad date: " + c.date);
      if (!(typeof c.minutes === "number" && c.minutes > 0 && c.minutes <= 600))
        errors.push("cardio " + c.id + " implausible minutes: " + c.minutes);
      if (c.avgHrBpm != null && !(typeof c.avgHrBpm === "number" && c.avgHrBpm >= 40 && c.avgHrBpm <= 220))
        warnings.push("cardio " + c.id + " implausible avg HR: " + c.avgHrBpm);
    });

    var exIds = {};
    (s.exercises || []).forEach(function (e) { if (e && e.id) exIds[e.id] = true; });

    (s.sessions || []).forEach(function (ss, i) {
      if (!ss || !ss.id) { errors.push("session[" + i + "] has no id"); return; }
      if (["draft", "completed", "partial", "abandoned"].indexOf(ss.status) < 0)
        errors.push("session " + ss.id + " bad status: " + ss.status);
      if (!Array.isArray(ss.entries)) { errors.push("session " + ss.id + " entries !array"); return; }
      ss.entries.forEach(function (en) {
        if (en && en.exerciseId && !exIds[en.exerciseId]) warnings.push("session " + ss.id + " references unknown exercise " + en.exerciseId);
        (en.sets || []).forEach(function (st) {
          if (typeof st.weightKg !== "number" || typeof st.reps !== "number")
            errors.push("session " + ss.id + " has a set with non-numeric weight/reps");
        });
      });
    });

    var summary = {
      schemaVersion: s.schemaVersion,
      sessions: (s.sessions || []).length,
      completedSessions: (s.sessions || []).filter(function (x) { return x.status === "completed"; }).length,
      programVersions: (s.programVersions || []).length,
      exercises: (s.exercises || []).length,
      cardioSessions: (s.cardioSessions || []).length,
      lastSessionDate: (s.sessions || []).reduce(function (a, x) { return x.date > a ? x.date : a; }, ""),
      appVersion: s.meta && s.meta.appVersion,
      exportedAt: s.meta && s.meta.exportedAt
    };
    return { ok: errors.length === 0, errors: errors, warnings: warnings, summary: summary };
  }

  // ---------------------------------------------------------------- low-level io
  function readKey(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function writeKey(k, v) { localStorage.setItem(k, v); }

  /* How much room the app is taking, split so it is obvious what is training
     history and what is just recoverable copies.

     localStorage has no reliable quota API -- browsers report between 5 and 10
     MB and Safari does not expose it at all -- so this reports what is actually
     stored and compares it against a conservative 5 MB, rather than pretending
     to know the real ceiling. The point is to give warning before a write
     fails, since the existing handling only notices afterwards. */
  var ASSUMED_QUOTA_BYTES = 5 * 1024 * 1024;
  var WARN_AT = 0.7;                       // ~3.5 MB, the figure in the README

  function footprint() {
    var main = 0, backups = 0, lkg = 0, other = 0;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        var n = (localStorage.getItem(k) || "").length;
        if (k === KEY) main = n;
        else if (k === LKG_KEY) lkg = n;
        else if (k.indexOf(BACKUP_PREFIX) === 0) backups += n;
        else other += n;
      }
    } catch (e) { /* storage unavailable -- report zeroes rather than throwing */ }
    var ours = main + backups + lkg;
    return {
      mainBytes: main, backupBytes: backups, lkgBytes: lkg, otherBytes: other,
      totalBytes: ours, assumedQuotaBytes: ASSUMED_QUOTA_BYTES,
      fraction: ours / ASSUMED_QUOTA_BYTES,
      shouldWarn: ours / ASSUMED_QUOTA_BYTES >= WARN_AT
    };
  }

  function setSaveHealth(ok) {
    App.store.lastSaveOk = ok;
    if (typeof App.onSaveHealthChange === "function") App.onSaveHealthChange(ok);
  }

  function saveLKG() {
    try {
      var cur = readKey(KEY);
      if (cur) { JSON.parse(cur); writeKey(LKG_KEY, cur); }   // only if it parses
    } catch (e) { /* leave LKG as-is */ }
  }

  function persist() {
    if (!state) return false;
    saveLKG();
    if (state.meta) state.meta.updatedAt = U.nowISO();
    try {
      writeKey(KEY, JSON.stringify(state));
      if (state.meta) state.meta.lastSuccessfulSaveAt = U.nowISO();
      setSaveHealth(true);
      return true;
    } catch (e) {
      console.error("Coach: save failed —", e);
      setSaveHealth(false);
      return false;
    }
  }

  // ---------------------------------------------------------------- backups
  function makeBackup(trigger) {
    if (!state) return null;
    try {
      var id = "b-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e4).toString(36);
      var blob = JSON.stringify(state);
      writeKey(BACKUP_PREFIX + id, blob);
      state.backups = state.backups || [];
      state.backups.push({
        id: id, at: U.nowISO(), trigger: trigger,
        schemaVersion: state.schemaVersion, sizeBytes: blob.length
      });
      pruneBackups();
      if (trigger === "manual" || trigger === "auto" || trigger === "export") {
        if (state.meta) state.meta.lastBackupAt = U.nowISO();
      }
      return id;
    } catch (e) { console.warn("Coach: backup failed —", e); return null; }
  }

  // union two backup indexes by id, keeping only entries whose blob still exists
  function mergeBackups(a, b) {
    var seen = {}, out = [];
    a.concat(b).forEach(function (x) {
      if (!x || !x.id || seen[x.id]) return;
      if (readKey(BACKUP_PREFIX + x.id) == null) return;
      seen[x.id] = 1; out.push(x);
    });
    return out.sort(function (p, q) { return p.at < q.at ? 1 : -1; });
  }

  function pruneBackups() {
    var protectedTriggers = { "pre-migration": 1 };
    var prot = state.backups.filter(function (b) { return protectedTriggers[b.trigger]; });
    var rolling = state.backups.filter(function (b) { return !protectedTriggers[b.trigger]; })
      .sort(function (a, b) { return a.at < b.at ? 1 : -1; });
    rolling.slice(MAX_ROLLING_BACKUPS).forEach(function (b) {
      try { localStorage.removeItem(BACKUP_PREFIX + b.id); } catch (e) {}
    });
    state.backups = prot.concat(rolling.slice(0, MAX_ROLLING_BACKUPS))
      .sort(function (a, b) { return a.at < b.at ? 1 : -1; });
  }

  // ---------------------------------------------------------------- load + migrate
  function runMigrations(parsed) {
    var from = parsed.schemaVersion || 1;
    if (from >= SCHEMA) return normalizeV2(parsed);

    var preKey = null;
    try {
      preKey = BACKUP_PREFIX + "premig-v" + SCHEMA + "-" + Date.now().toString(36);
      writeKey(preKey, JSON.stringify(parsed));
    } catch (e) { preKey = null; }

    var working = U.deepCopy(parsed);
    try {
      if ((working.schemaVersion || 1) < 2) working = migrateV1toV2(working);
      var v = validateState(working);
      if (!v.ok) throw new Error("post-migration validation failed: " + v.errors.join("; "));
      working.backups = working.backups || [];
      if (preKey) working.backups.push({
        id: preKey.replace(BACKUP_PREFIX, ""), at: U.nowISO(),
        trigger: "pre-migration", schemaVersion: from, sizeBytes: JSON.stringify(parsed).length
      });
      return working;
    } catch (e) {
      console.error("Coach: MIGRATION FAILED — original data left untouched.", e);
      App.store.migrationError = {
        message: String((e && e.message) || e),
        fromSchema: from,
        backupKey: preKey,
        original: parsed
      };
      return parsed;   // untouched; app.js shows the recovery screen
    }
  }

  function load() {
    App.store.recoveredFromLKG = false;
    App.store.migrationError = null;

    var raw = readKey(KEY);
    if (raw == null) { state = seedState(); persist(); return afterLoad(); }

    var parsed = null;
    try { parsed = JSON.parse(raw); }
    catch (e) {
      var lkg = readKey(LKG_KEY);
      if (lkg) { try { parsed = JSON.parse(lkg); App.store.recoveredFromLKG = true; } catch (e2) { parsed = null; } }
      if (!parsed) { console.warn("Coach: corrupt save + no usable LKG — reseeding."); state = seedState(); persist(); return afterLoad(); }
    }

    state = runMigrations(parsed);
    if (!App.store.migrationError) persist();      // write the migrated shape back
    return afterLoad();
  }

  function afterLoad() {
    if (App.store.migrationError) return state;
    try {
      var lb = state.meta && state.meta.lastBackupAt;
      var stale = !lb || (Date.now() - new Date(lb).getTime()) > 7 * 86400000;
      if (stale && state.sessions && state.sessions.length) { makeBackup("auto"); persist(); }
    } catch (e) {}
    return state;
  }

  // ---------------------------------------------------------------- import
  function isDuplicateOfCurrent(incoming) {
    if (!state || !Array.isArray(state.sessions)) return false;
    if (incoming.sessions.length !== state.sessions.length) return false;
    var mine = state.sessions.map(function (s) { return s.id; }).sort().join(",");
    var theirs = incoming.sessions.map(function (s) { return s.id; }).sort().join(",");
    return mine === theirs && mine.length > 0;
  }

  // ---------------------------------------------------------------- public api
  App.store = {
    footprint: footprint,
    get: function () { return state || load(); },
    save: persist,
    reload: load,
    schema: SCHEMA,
    appVersion: APP_VERSION,
    KEY: KEY,
    lastSaveOk: true,
    recoveredFromLKG: false,
    migrationError: null,

    validate: validateState,
    makeBackup: makeBackup,

    exportJSON: function () {
      if (state && state.meta) state.meta.exportedAt = U.nowISO();
      return JSON.stringify(state, null, 2);
    },
    markExported: function () {
      if (state && state.meta) { state.meta.lastBackupAt = U.nowISO(); }
      makeBackup("export");
      persist();
    },

    // step 1: parse + migrate-to-current + validate, WITHOUT touching current data
    inspectImport: function (text) {
      var parsed;
      try { parsed = JSON.parse(text); }
      catch (e) { return { ok: false, fatal: "That file isn't valid JSON." }; }
      var working;
      try {
        working = U.deepCopy(parsed);
        working = ((working.schemaVersion || 1) < SCHEMA) ? migrateV1toV2(working) : normalizeV2(working);
      } catch (e) { return { ok: false, fatal: "Couldn't read this backup: " + ((e && e.message) || e) }; }
      var v = validateState(working);
      if (!v.ok) return { ok: false, fatal: "This backup failed validation: " + v.errors.join("; ") };
      return {
        ok: true, parsed: working, summary: v.summary, warnings: v.warnings,
        duplicate: isDuplicateOfCurrent(working)
      };
    },
    // step 2: snapshot current, then replace
    applyImport: function (working, filename) {
      var backupId = makeBackup("pre-import");
      // carry the backup index forward — otherwise the snapshot we just took
      // becomes an orphan blob you can't restore from
      var carriedBackups = (state && state.backups) ? state.backups.slice() : [];
      var carriedImports = (state && state.importEvents) ? state.importEvents.slice() : [];
      state = working;
      state.backups = mergeBackups(carriedBackups, state.backups || []);
      state.importEvents = carriedImports.concat(state.importEvents || []);
      state.importEvents.push({
        at: U.nowISO(), filename: filename || "(file)", result: "applied",
        reason: "", backupIdBefore: backupId
      });
      persist();
      return state;
    },

    listBackups: function () { return (state && state.backups ? state.backups.slice() : []).sort(function (a, b) { return a.at < b.at ? 1 : -1; }); },
    restoreBackup: function (id) {
      var raw = readKey(BACKUP_PREFIX + id);
      if (!raw) return { ok: false, fatal: "That backup is no longer on this device." };
      var parsed;
      try { parsed = JSON.parse(raw); } catch (e) { return { ok: false, fatal: "That backup is unreadable." }; }
      var working;
      try {
        working = ((parsed.schemaVersion || 1) < SCHEMA) ? migrateV1toV2(U.deepCopy(parsed)) : normalizeV2(U.deepCopy(parsed));
      } catch (e) { return { ok: false, fatal: "That backup couldn't be read: " + ((e && e.message) || e) }; }
      var v = validateState(working);
      if (!v.ok) return { ok: false, fatal: "That backup didn't validate: " + v.errors.join("; ") };
      makeBackup("pre-restore");                       // only once we know the restore will work
      var carriedBackups = (state && state.backups) ? state.backups.slice() : [];
      state = working;
      state.backups = mergeBackups(carriedBackups, state.backups || []);
      persist();
      return { ok: true };
    },

    resetAll: function () {
      makeBackup("pre-reset");
      state = seedState();
      persist();
      return state;
    },

    // exposes the untouched original after a failed migration, for a manual export
    exportMigrationOriginal: function () {
      return App.store.migrationError ? JSON.stringify(App.store.migrationError.original, null, 2) : null;
    }
  };
})();
