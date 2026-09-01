/* Persistence. One JSON blob in localStorage, keyed + versioned.
   Everything the app knows lives in `state`; save() writes it; load() reads
   it (seeding on first run and running migrations on later runs). */

window.App = window.App || {};
(function () {
  var KEY = "coach.v1";
  var SCHEMA = 1;
  var state = null;

  function seedState() {
    var today = new Date().toISOString().slice(0, 10);
    return {
      schemaVersion: SCHEMA,
      settings: {
        units: "kg",
        phaseStartDate: today,     // week + phase + variant are derived from this
        phaseLengthWeeks: 6,
        blockPhases: 3,
        kcalTarget: 3450,
        proteinTarget: 200,
        bwTrendTargetKgPerWeek: 0.25,
        theme: "auto",             // auto | light | dark
        healthShortcutName: "Log Strength Workout"
      },
      rotationIndex: 0,            // which day of the active variant comes next (0..n-1)
      exercises: App.EXERCISE_SEED.map(function (e) { return Object.assign({}, e); }),
      program: JSON.parse(JSON.stringify(App.PROGRAM_SEED)),
      activeSession: null,        // the workout in progress, if any
      sessions: [],               // finished workouts
      bodyweights: [],            // stage 9
      recovery: [],               // stage 8
      nutrition: [],              // stage 5
      cardio: []                  // stage 6
    };
  }

  function migrate(s) {
    if (!s || typeof s !== "object") return seedState();
    if (!s.schemaVersion) s.schemaVersion = 1;
    // guard against a save written by an older build missing newer fields
    ["sessions", "bodyweights", "recovery", "nutrition", "cardio", "exercises"].forEach(function (k) {
      if (!Array.isArray(s[k])) s[k] = [];
    });
    if (!s.settings) s.settings = seedState().settings;
    if (!s.program) s.program = JSON.parse(JSON.stringify(App.PROGRAM_SEED));
    if (typeof s.rotationIndex !== "number") s.rotationIndex = 0;
    if (s.activeSession === undefined) s.activeSession = null;
    // future: if (s.schemaVersion < 2) { ...; s.schemaVersion = 2; }
    return s;
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { /* storage blocked */ }
    if (!raw) { state = seedState(); save(); return state; }
    try { state = migrate(JSON.parse(raw)); }
    catch (e) { console.warn("Coach: corrupt save, reseeding.", e); state = seedState(); }
    return state;
  }

  function save() {
    if (!state) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.error("Coach: save failed.", e);
      if (App.ui && App.ui.toast) App.ui.toast("Couldn't save — storage full or blocked");
    }
  }

  App.store = {
    get: function () { return state || load(); },
    save: save,
    reload: load,
    exportJSON: function () { return JSON.stringify(state, null, 2); },
    importJSON: function (text) {
      var parsed = JSON.parse(text);            // throws on bad JSON — caller handles
      state = migrate(parsed);
      save();
      return state;
    },
    resetAll: function () { state = seedState(); save(); return state; },
    KEY: KEY
  };
})();
