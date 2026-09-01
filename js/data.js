/* Seed content. This is the stuff you'll want to tweak over time — your
   exercise library and your program. Kept in its own file on purpose.
   Editing here only affects a fresh install or a "Reset all data"; once the
   app has saved a state, your live copy in the browser is what's used. */

window.App = window.App || {};

App.MUSCLES = ["chest", "back", "shoulders", "arms", "legs", "core"];

/* --- Exercise library ------------------------------------------------------
   id         stable key, referenced by the program and by saved sets
   name       display name
   muscleGroup one of App.MUSCLES (drives weekly volume later)
   equipment  informational for now; helps matching reference photos later  */
App.EXERCISE_SEED = [
  // chest
  { id: "bb-bench",            name: "Barbell Bench Press",        muscleGroup: "chest",     equipment: "barbell" },
  { id: "db-bench",            name: "Dumbbell Bench Press",       muscleGroup: "chest",     equipment: "dumbbell" },
  { id: "machine-chest-press", name: "Machine Chest Press",        muscleGroup: "chest",     equipment: "machine" },
  { id: "incline-db-press",    name: "Incline Dumbbell Press",     muscleGroup: "chest",     equipment: "dumbbell" },
  { id: "incline-machine-press",name:"Incline Machine Press",      muscleGroup: "chest",     equipment: "machine" },
  { id: "incline-bb-press",    name: "Incline Barbell Press",      muscleGroup: "chest",     equipment: "barbell" },
  { id: "incline-smith-press", name: "Incline Smith Press",        muscleGroup: "chest",     equipment: "machine" },
  { id: "low-high-cable-fly",  name: "Low-to-High Cable Fly",      muscleGroup: "chest",     equipment: "cable" },
  { id: "weighted-dip",        name: "Weighted Dip",               muscleGroup: "chest",     equipment: "bodyweight" },
  // back
  { id: "weighted-pullup",     name: "Weighted Pull-Up",           muscleGroup: "back",      equipment: "bodyweight" },
  { id: "lat-pulldown",        name: "Lat Pulldown",               muscleGroup: "back",      equipment: "machine" },
  { id: "ng-pulldown",         name: "Neutral-Grip Pulldown",      muscleGroup: "back",      equipment: "machine" },
  { id: "assisted-pullup",     name: "Assisted Pull-Up",           muscleGroup: "back",      equipment: "machine" },
  { id: "bb-row",              name: "Barbell Row",                muscleGroup: "back",      equipment: "barbell" },
  { id: "pendlay-row",         name: "Pendlay Row",                muscleGroup: "back",      equipment: "barbell" },
  { id: "tbar-row",            name: "T-Bar Row",                  muscleGroup: "back",      equipment: "machine" },
  { id: "chest-supported-row", name: "Chest-Supported Row",        muscleGroup: "back",      equipment: "machine" },
  { id: "seated-cable-row",    name: "Seated Cable Row",           muscleGroup: "back",      equipment: "cable" },
  { id: "machine-row",         name: "Machine Row",                muscleGroup: "back",      equipment: "machine" },
  // shoulders
  { id: "ohp",                 name: "Standing Overhead Press",    muscleGroup: "shoulders", equipment: "barbell" },
  { id: "seated-db-press",     name: "Seated Dumbbell Press",      muscleGroup: "shoulders", equipment: "dumbbell" },
  { id: "machine-shoulder-press",name:"Machine Shoulder Press",    muscleGroup: "shoulders", equipment: "machine" },
  { id: "arnold-press",        name: "Dumbbell Arnold Press",      muscleGroup: "shoulders", equipment: "dumbbell" },
  { id: "cable-lateral",       name: "Cable Lateral Raise",        muscleGroup: "shoulders", equipment: "cable" },
  { id: "db-lateral",          name: "Dumbbell Lateral Raise",     muscleGroup: "shoulders", equipment: "dumbbell" },
  { id: "machine-lateral",     name: "Machine Lateral Raise",      muscleGroup: "shoulders", equipment: "machine" },
  { id: "reverse-pecdeck",     name: "Reverse Pec-Deck",           muscleGroup: "shoulders", equipment: "machine" },
  { id: "rear-delt-cable-fly", name: "Rear-Delt Cable Fly",        muscleGroup: "shoulders", equipment: "cable" },
  { id: "face-pull",           name: "Face Pull",                  muscleGroup: "shoulders", equipment: "cable" },
  // arms
  { id: "incline-db-curl",     name: "Incline Dumbbell Curl",      muscleGroup: "arms",      equipment: "dumbbell" },
  { id: "bayesian-curl",       name: "Bayesian Cable Curl",        muscleGroup: "arms",      equipment: "cable" },
  { id: "ezbar-curl",          name: "EZ-Bar Curl",                muscleGroup: "arms",      equipment: "barbell" },
  { id: "hammer-curl",         name: "Hammer Curl",                muscleGroup: "arms",      equipment: "dumbbell" },
  { id: "rope-hammer",         name: "Rope Cable Hammer Curl",     muscleGroup: "arms",      equipment: "cable" },
  { id: "machine-preacher",    name: "Machine Preacher Curl",      muscleGroup: "arms",      equipment: "machine" },
  { id: "rope-pushdown",       name: "Triceps Rope Pushdown",      muscleGroup: "arms",      equipment: "cable" },
  { id: "overhead-cable-ext",  name: "Overhead Cable Triceps Ext", muscleGroup: "arms",      equipment: "cable" },
  { id: "crossbody-cable-ext", name: "Cross-Body Cable Extension", muscleGroup: "arms",      equipment: "cable" },
  { id: "cgbp",                name: "Close-Grip Bench Press",      muscleGroup: "arms",      equipment: "barbell" },
  { id: "jm-press",            name: "JM Press",                   muscleGroup: "arms",      equipment: "barbell" },
  { id: "dip-machine",         name: "Dip Machine",                muscleGroup: "arms",      equipment: "machine" },
  // legs
  { id: "back-squat",          name: "Back Squat",                 muscleGroup: "legs",      equipment: "barbell" },
  { id: "hack-squat",          name: "Hack Squat",                 muscleGroup: "legs",      equipment: "machine" },
  { id: "leg-press",           name: "Leg Press",                  muscleGroup: "legs",      equipment: "machine" },
  { id: "rdl",                 name: "Romanian Deadlift",          muscleGroup: "legs",      equipment: "barbell" },
  { id: "lying-leg-curl",      name: "Lying Leg Curl",             muscleGroup: "legs",      equipment: "machine" },
  { id: "seated-leg-curl",     name: "Seated Leg Curl",            muscleGroup: "legs",      equipment: "machine" },
  { id: "nordic-curl",         name: "Nordic Hamstring Curl",      muscleGroup: "legs",      equipment: "bodyweight" },
  { id: "bulgarian-split-squat",name:"Bulgarian Split Squat",      muscleGroup: "legs",      equipment: "dumbbell" },
  { id: "walking-lunge",       name: "Walking Lunge",              muscleGroup: "legs",      equipment: "dumbbell" },
  { id: "standing-calf",       name: "Standing Calf Raise",        muscleGroup: "legs",      equipment: "machine" },
  { id: "seated-calf",         name: "Seated Calf Raise",          muscleGroup: "legs",      equipment: "machine" },
  { id: "leg-press-calf",      name: "Leg-Press Calf Raise",       muscleGroup: "legs",      equipment: "machine" },
  // core
  { id: "hanging-leg-raise",   name: "Hanging Leg Raise",          muscleGroup: "core",      equipment: "bodyweight" },
  { id: "cable-crunch",        name: "Cable Crunch",               muscleGroup: "core",      equipment: "cable" },
  { id: "ab-wheel",            name: "Ab Wheel Rollout",           muscleGroup: "core",      equipment: "bodyweight" }
];

/* --- Program -------------------------------------------------------------
   4 lifting days, upper-body emphasis, one leg day. Variant A only for now;
   B and C get added at the rotation stage and cycle A -> B -> C by phase.
   slot: exerciseId + altIds (swap targets) + sets / repLow-repHigh / rir.  */
App.PROGRAM_SEED = {
  name: "Upper-emphasis block",
  daysPerWeek: 4,
  rotateOn: "phase",
  variants: [
    {
      label: "A",
      days: [
        {
          id: "A-push", name: "Upper · Push", focusTags: ["chest", "shoulders", "arms"],
          slots: [
            { exerciseId: "bb-bench",            altIds: ["db-bench", "machine-chest-press"],           sets: 4, repLow: 6,  repHigh: 9,  rir: 2 },
            { exerciseId: "ohp",                 altIds: ["seated-db-press", "machine-shoulder-press"], sets: 3, repLow: 6,  repHigh: 10, rir: 2 },
            { exerciseId: "incline-db-press",    altIds: ["incline-machine-press", "low-high-cable-fly"],sets: 3, repLow: 8,  repHigh: 12, rir: 2 },
            { exerciseId: "chest-supported-row", altIds: ["seated-cable-row"],                          sets: 3, repLow: 10, repHigh: 12, rir: 2 },
            { exerciseId: "cable-lateral",       altIds: ["db-lateral", "machine-lateral"],             sets: 3, repLow: 12, repHigh: 20, rir: 1 },
            { exerciseId: "rope-pushdown",       altIds: ["overhead-cable-ext", "dip-machine"],         sets: 3, repLow: 10, repHigh: 15, rir: 1 }
          ]
        },
        {
          id: "A-lower", name: "Lower", focusTags: ["legs", "core"],
          slots: [
            { exerciseId: "back-squat",       altIds: ["hack-squat", "leg-press"],                sets: 4, repLow: 6,  repHigh: 10, rir: 2 },
            { exerciseId: "rdl",              altIds: ["lying-leg-curl"],                          sets: 3, repLow: 8,  repHigh: 12, rir: 2 },
            { exerciseId: "leg-press",        altIds: ["bulgarian-split-squat", "walking-lunge"],  sets: 3, repLow: 10, repHigh: 15, rir: 2 },
            { exerciseId: "seated-leg-curl",  altIds: ["nordic-curl"],                             sets: 3, repLow: 10, repHigh: 15, rir: 1 },
            { exerciseId: "standing-calf",    altIds: ["seated-calf", "leg-press-calf"],           sets: 4, repLow: 8,  repHigh: 15, rir: 1 },
            { exerciseId: "hanging-leg-raise",altIds: ["cable-crunch", "ab-wheel"],                sets: 3, repLow: 10, repHigh: 15, rir: 1 }
          ]
        },
        {
          id: "A-pull", name: "Upper · Pull", focusTags: ["back", "shoulders", "arms"],
          slots: [
            { exerciseId: "weighted-pullup",  altIds: ["lat-pulldown", "ng-pulldown"],                 sets: 4, repLow: 6,  repHigh: 10, rir: 2 },
            { exerciseId: "bb-row",           altIds: ["pendlay-row", "chest-supported-row", "tbar-row"],sets: 4, repLow: 8,  repHigh: 10, rir: 2 },
            { exerciseId: "seated-cable-row", altIds: ["machine-row"],                                  sets: 3, repLow: 10, repHigh: 12, rir: 2 },
            { exerciseId: "reverse-pecdeck",  altIds: ["rear-delt-cable-fly", "face-pull"],             sets: 3, repLow: 15, repHigh: 20, rir: 1 },
            { exerciseId: "incline-db-curl",  altIds: ["bayesian-curl", "ezbar-curl"],                  sets: 3, repLow: 8,  repHigh: 12, rir: 1 },
            { exerciseId: "hammer-curl",      altIds: ["rope-hammer"],                                  sets: 2, repLow: 10, repHigh: 15, rir: 1 }
          ]
        },
        {
          id: "A-arms", name: "Upper · Arms & Delts", focusTags: ["arms", "shoulders", "chest"],
          slots: [
            { exerciseId: "incline-bb-press",        altIds: ["incline-smith-press", "incline-db-press"], sets: 3, repLow: 8,  repHigh: 12, rir: 2 },
            { exerciseId: "machine-shoulder-press",  altIds: ["arnold-press"],                            sets: 3, repLow: 10, repHigh: 12, rir: 2 },
            { exerciseId: "cable-lateral",           altIds: ["machine-lateral"],                         sets: 4, repLow: 12, repHigh: 20, rir: 1, note: "Drop set on the last set" },
            { exerciseId: "cgbp",                    altIds: ["jm-press", "dip-machine"],                 sets: 3, repLow: 8,  repHigh: 12, rir: 2 },
            { exerciseId: "ezbar-curl",              altIds: ["machine-preacher"],                        sets: 3, repLow: 8,  repHigh: 12, rir: 1 },
            { exerciseId: "overhead-cable-ext",      altIds: ["crossbody-cable-ext"],                     sets: 2, repLow: 12, repHigh: 15, rir: 1 }
          ]
        }
      ]
    }
  ]
};
