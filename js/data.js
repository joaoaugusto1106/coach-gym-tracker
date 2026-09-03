/* Seed content — the exercise library, the movement families, and the
   starting program version. Editing here only affects a fresh install or a
   "Reset all data"; once the app has saved a state, your live copy wins.

   Identity rules (see the Stage 1.5 review):
   - `id` is the stable key. Names are display-only and may be edited.
   - `movementFamilyId` groups interchangeable variants (incline BB / DB /
     machine / Smith). Variants in a family are OFFERED together as swaps but
     keep completely separate weights, e1RM and PR history. The app never
     compares kilograms across a family. */

window.App = window.App || {};

App.MUSCLES = ["chest", "back", "shoulders", "arms", "legs", "core"];

/* --- Nutrition ------------------------------------------------------------
   João's actual routine, kept exactly as it is. The app tracks whether each
   checkpoint happened — it is not a food database and never will be.
   Copied into settings.mealPlan on first run so it can be edited later
   without touching this file. */
App.NUTRITION_SEED = {
  kcalTargetLow: 3400,
  kcalTargetHigh: 3500,
  proteinTarget: 200,
  checkpoints: [
    { id: "cp1", time: "~6:30",   label: "Breakfast",
      detail: "1 scoop oats (microwaved ~1.5 min with water), a good portion of berries, 2 tbsp peanut butter, a little honey, 1 scoop whey" },
    { id: "cp2", time: "~9:00",   label: "Mid-morning",
      detail: "220 g yoghurt, 2 scoops oats, a little milk, 1 pear" },
    { id: "cp3", time: "Lunch",   label: "Lunch",
      detail: "~150 g chicken, ~300–350 g cooked rice" },
    { id: "cp4", time: "~3:35",   label: "Pre-gym",
      detail: "220 g yoghurt, 2 scoops oats, a little milk, 1 pear" },
    { id: "cp5", time: "Post-workout", label: "In the sauna",
      detail: "1.5 scoops whey, creatine, water" },
    { id: "cp6", time: "~7:00",   label: "Dinner",
      detail: "~150 g chicken, ~300–350 g cooked rice" }
  ]
};

App.MOVEMENT_FAMILIES = [
  { id: "flat-press",        name: "Flat press" },
  { id: "incline-press",     name: "Incline press" },
  { id: "chest-fly",         name: "Chest fly" },
  { id: "dip",               name: "Dip" },
  { id: "overhead-press",    name: "Overhead press" },
  { id: "lateral-raise",     name: "Lateral raise" },
  { id: "rear-delt",         name: "Rear-delt raise" },
  { id: "vertical-pull",     name: "Vertical pull" },
  { id: "row-barbell",       name: "Barbell row" },
  { id: "row-supported",     name: "Supported row" },
  { id: "curl-supinated",    name: "Supinated curl" },
  { id: "curl-neutral",      name: "Neutral / hammer curl" },
  { id: "triceps-pushdown",  name: "Triceps pushdown" },
  { id: "triceps-overhead",  name: "Overhead triceps extension" },
  { id: "triceps-compound",  name: "Compound triceps press" },
  { id: "squat",             name: "Squat" },
  { id: "leg-press-fam",     name: "Leg press" },
  { id: "hinge",             name: "Hip hinge" },
  { id: "leg-curl",          name: "Leg curl" },
  { id: "lunge",             name: "Lunge / split squat" },
  { id: "calf-raise",        name: "Calf raise" },
  { id: "trunk-flexion",     name: "Trunk flexion" }
];

var FAMILY_PATTERN = {
  "flat-press": "horizontal-press", "incline-press": "horizontal-press", "chest-fly": "fly",
  "dip": "horizontal-press", "overhead-press": "vertical-press", "lateral-raise": "lateral-raise",
  "rear-delt": "rear-delt", "vertical-pull": "vertical-pull", "row-barbell": "horizontal-pull",
  "row-supported": "horizontal-pull", "curl-supinated": "elbow-flexion", "curl-neutral": "elbow-flexion",
  "triceps-pushdown": "elbow-extension", "triceps-overhead": "elbow-extension",
  "triceps-compound": "horizontal-press", "squat": "squat", "leg-press-fam": "squat",
  "hinge": "hinge", "leg-curl": "knee-flexion", "lunge": "lunge", "calf-raise": "calf",
  "trunk-flexion": "trunk-flexion"
};

function defaultIncrement(equipment) { return equipment === "dumbbell" ? 2 : 2.5; }

/* [ id, name, muscleGroup, equipment, movementFamilyId ] — the rest is filled in below. */
App.EXERCISE_SEED = [
  ["bb-bench",             "Barbell Bench Press",             "chest",     "barbell",    "flat-press"],
  ["db-bench",             "Dumbbell Bench Press",            "chest",     "dumbbell",   "flat-press"],
  ["machine-chest-press",  "Machine Chest Press",             "chest",     "machine",    "flat-press"],
  ["incline-db-press",     "Incline Dumbbell Press",          "chest",     "dumbbell",   "incline-press"],
  ["incline-machine-press","Incline Machine Press",           "chest",     "machine",    "incline-press"],
  ["incline-bb-press",     "Incline Barbell Press",           "chest",     "barbell",    "incline-press"],
  ["incline-smith-press",  "Incline Smith Press",             "chest",     "smith",      "incline-press"],
  ["low-high-cable-fly",   "Low-to-High Cable Fly",           "chest",     "cable",      "chest-fly"],
  ["weighted-dip",         "Weighted Dip",                    "chest",     "bodyweight", "dip"],
  ["weighted-pullup",      "Weighted Pull-Up",                "back",      "bodyweight", "vertical-pull"],
  ["lat-pulldown",         "Lat Pulldown",                    "back",      "machine",    "vertical-pull"],
  ["ng-pulldown",          "Neutral-Grip Pulldown",           "back",      "machine",    "vertical-pull"],
  ["assisted-pullup",      "Assisted Pull-Up",                "back",      "machine",    "vertical-pull"],
  ["bb-row",               "Barbell Row",                     "back",      "barbell",    "row-barbell"],
  ["pendlay-row",          "Pendlay Row",                     "back",      "barbell",    "row-barbell"],
  ["tbar-row",             "T-Bar Row",                       "back",      "barbell",    "row-barbell"],
  ["chest-supported-row",  "Chest-Supported Row",             "back",      "machine",    "row-supported"],
  ["seated-cable-row",     "Seated Cable Row",                "back",      "cable",      "row-supported"],
  ["machine-row",          "Machine Row",                     "back",      "machine",    "row-supported"],
  ["ohp",                  "Standing Overhead Press",         "shoulders", "barbell",    "overhead-press"],
  ["seated-db-press",      "Seated Dumbbell Press",           "shoulders", "dumbbell",   "overhead-press"],
  ["machine-shoulder-press","Machine Shoulder Press",         "shoulders", "machine",    "overhead-press"],
  ["arnold-press",         "Dumbbell Arnold Press",           "shoulders", "dumbbell",   "overhead-press"],
  ["cable-lateral",        "Cable Lateral Raise",             "shoulders", "cable",      "lateral-raise"],
  ["db-lateral",           "Dumbbell Lateral Raise",          "shoulders", "dumbbell",   "lateral-raise"],
  ["machine-lateral",      "Machine Lateral Raise",           "shoulders", "machine",    "lateral-raise"],
  ["reverse-pecdeck",      "Reverse Pec-Deck",                "shoulders", "machine",    "rear-delt"],
  ["rear-delt-cable-fly",  "Rear-Delt Cable Fly",             "shoulders", "cable",      "rear-delt"],
  ["face-pull",            "Face Pull",                       "shoulders", "cable",      "rear-delt"],
  ["incline-db-curl",      "Incline Dumbbell Curl",           "arms",      "dumbbell",   "curl-supinated"],
  ["bayesian-curl",        "Bayesian Cable Curl",             "arms",      "cable",      "curl-supinated"],
  ["ezbar-curl",           "EZ-Bar Curl",                     "arms",      "barbell",    "curl-supinated"],
  ["machine-preacher",     "Machine Preacher Curl",           "arms",      "machine",    "curl-supinated"],
  ["hammer-curl",          "Hammer Curl",                     "arms",      "dumbbell",   "curl-neutral"],
  ["rope-hammer",          "Rope Cable Hammer Curl",          "arms",      "cable",      "curl-neutral"],
  ["rope-pushdown",        "Triceps Rope Pushdown",           "arms",      "cable",      "triceps-pushdown"],
  ["crossbody-cable-ext",  "Cross-Body Cable Extension",      "arms",      "cable",      "triceps-pushdown"],
  ["overhead-cable-ext",   "Overhead Cable Triceps Ext",      "arms",      "cable",      "triceps-overhead"],
  ["cgbp",                 "Close-Grip Bench Press",          "arms",      "barbell",    "triceps-compound"],
  ["jm-press",             "JM Press",                        "arms",      "barbell",    "triceps-compound"],
  ["dip-machine",          "Dip Machine",                     "arms",      "machine",    "dip"],
  ["back-squat",           "Back Squat",                      "legs",      "barbell",    "squat"],
  ["hack-squat",           "Hack Squat",                      "legs",      "machine",    "squat"],
  ["leg-press",            "Leg Press",                       "legs",      "machine",    "leg-press-fam"],
  ["rdl",                  "Romanian Deadlift",               "legs",      "barbell",    "hinge"],
  ["lying-leg-curl",       "Lying Leg Curl",                  "legs",      "machine",    "leg-curl"],
  ["seated-leg-curl",      "Seated Leg Curl",                 "legs",      "machine",    "leg-curl"],
  ["nordic-curl",          "Nordic Hamstring Curl",           "legs",      "bodyweight", "leg-curl"],
  ["bulgarian-split-squat","Bulgarian Split Squat",           "legs",      "dumbbell",   "lunge"],
  ["walking-lunge",        "Walking Lunge",                   "legs",      "dumbbell",   "lunge"],
  ["standing-calf",        "Standing Calf Raise",             "legs",      "machine",    "calf-raise"],
  ["seated-calf",          "Seated Calf Raise",               "legs",      "machine",    "calf-raise"],
  ["leg-press-calf",       "Leg-Press Calf Raise",            "legs",      "machine",    "calf-raise"],
  ["hanging-leg-raise",    "Hanging Leg Raise",               "core",      "bodyweight", "trunk-flexion"],
  ["cable-crunch",         "Cable Crunch",                    "core",      "cable",      "trunk-flexion"],
  ["ab-wheel",             "Ab Wheel Rollout",                "core",      "bodyweight", "trunk-flexion"]
].map(function (r) {
  return {
    id: r[0], name: r[1], muscleGroup: r[2], equipment: r[3],
    movementFamilyId: r[4],
    movementPattern: FAMILY_PATTERN[r[4]] || null,
    secondaryMuscles: [],
    defaultLoadIncrementKg: defaultIncrement(r[3]),
    referenceImage: null,
    active: true,
    userNote: ""
  };
});

var EX_NAME = {};
App.EXERCISE_SEED.forEach(function (e) { EX_NAME[e.id] = e.name; });

/* --- Program version -----------------------------------------------------
   4 lifting days, upper-body emphasis, one leg day. This is version "pv1";
   later stages add pv2 / pv3 with their own effectiveStartDate, and every
   completed session snapshots the prescription it was trained under.
   Rotation cycles through trainingDayOrder on intentional completion.
   Slot row: [ label, defaultExerciseId, [alternatives], sets, repLow, repHigh, targetRIR, note? ] */
function buildDay(id, name, focusTags, rows) {
  return {
    id: id, name: name, focusTags: focusTags,
    slots: rows.map(function (r, i) {
      return {
        planSlotId: id + ".s" + (i + 1),
        label: r[0],
        defaultExerciseId: r[1],
        allowedExerciseIds: [r[1]].concat(r[2]),
        sets: r[3], repLow: r[4], repHigh: r[5], rir: r[6],
        loadIncrementKg: null,        // null = use the exercise's default increment
        note: r[7] || ""
      };
    })
  };
}

/* --- The three variants --------------------------------------------------
   Same four days, same slot order, same movement family in each slot — so
   last-time recall, swaps and muscle-group volume stay comparable across a
   whole year. What rotates is the *implement and the rep emphasis*:

     A  barbell base, moderate reps      — the block you learn the lifts on
     B  dumbbell and machine, higher reps — easier on the joints, more volume
     C  heavier, lower reps               — pushes the top end

   The phase number picks the variant (phase 1 → A, 2 → B, 3 → C, 4 → A), so
   a 6-week phase is a block and the year is four of them. Weights are never
   compared across variants automatically: each exercise keeps its own history,
   which is exactly what movementFamilies already guarantee. */

var VARIANT_A_DAYS = [
  buildDay("push", "Upper · Push", ["chest", "shoulders", "arms"], [
    ["Primary chest press",   "bb-bench",            ["db-bench", "machine-chest-press"],            4, 6,  9,  2],
    ["Overhead press",        "ohp",                 ["seated-db-press", "machine-shoulder-press"],  3, 6,  10, 2],
    ["Incline press",         "incline-db-press",    ["incline-machine-press", "low-high-cable-fly"],3, 8,  12, 2],
    ["Row (balance)",         "chest-supported-row", ["seated-cable-row"],                           3, 10, 12, 2],
    ["Lateral raise",         "cable-lateral",       ["db-lateral", "machine-lateral"],              3, 12, 20, 1],
    ["Triceps pushdown",      "rope-pushdown",       ["overhead-cable-ext", "dip-machine"],          3, 10, 15, 1]
  ]),
  buildDay("lower", "Lower", ["legs", "core"], [
    ["Squat pattern",         "back-squat",       ["hack-squat", "leg-press"],                 4, 6,  10, 2],
    ["Hip hinge",             "rdl",              ["lying-leg-curl"],                          3, 8,  12, 2],
    ["Leg press / quad",      "leg-press",        ["bulgarian-split-squat", "walking-lunge"],  3, 10, 15, 2],
    ["Leg curl",              "seated-leg-curl",  ["nordic-curl"],                             3, 10, 15, 1],
    ["Calf raise",            "standing-calf",    ["seated-calf", "leg-press-calf"],           4, 8,  15, 1],
    ["Trunk flexion",         "hanging-leg-raise",["cable-crunch", "ab-wheel"],                3, 10, 15, 1]
  ]),
  buildDay("pull", "Upper · Pull", ["back", "shoulders", "arms"], [
    ["Vertical pull",         "weighted-pullup",  ["lat-pulldown", "ng-pulldown"],                  4, 6,  10, 2],
    ["Horizontal row",        "bb-row",           ["pendlay-row", "chest-supported-row", "tbar-row"],4, 8,  10, 2],
    ["Row (width)",           "seated-cable-row", ["machine-row"],                                  3, 10, 12, 2],
    ["Rear delt",             "reverse-pecdeck",  ["rear-delt-cable-fly", "face-pull"],             3, 15, 20, 1],
    ["Supinated curl",        "incline-db-curl",  ["bayesian-curl", "ezbar-curl"],                  3, 8,  12, 1],
    ["Neutral curl",          "hammer-curl",      ["rope-hammer"],                                  2, 10, 15, 1]
  ]),
  buildDay("arms", "Upper · Arms & Delts", ["arms", "shoulders", "chest"], [
    ["Incline press",         "incline-bb-press",      ["incline-smith-press", "incline-db-press"], 3, 8,  12, 2],
    ["Shoulder press",        "machine-shoulder-press",["arnold-press"],                            3, 10, 12, 2],
    ["Lateral raise",         "cable-lateral",         ["machine-lateral"],                         4, 12, 20, 1, "Drop set on the last set"],
    ["Compound triceps",      "cgbp",                  ["jm-press", "dip-machine"],                 3, 8,  12, 2],
    ["Supinated curl",        "ezbar-curl",            ["machine-preacher"],                        3, 8,  12, 1],
    ["Overhead triceps",      "overhead-cable-ext",    ["crossbody-cable-ext"],                     2, 12, 15, 1]
  ])
];

/* B — dumbbells and machines, a couple of reps higher everywhere. Same slots,
   so "Primary chest press" is still the first thing you do on push day. */
var VARIANT_B_DAYS = [
  buildDay("push", "Upper · Push", ["chest", "shoulders", "arms"], [
    ["Primary chest press",   "db-bench",              ["bb-bench", "machine-chest-press"],            4, 8,  12, 2],
    ["Overhead press",        "seated-db-press",       ["ohp", "machine-shoulder-press"],              3, 8,  12, 2],
    ["Incline press",         "incline-machine-press", ["incline-db-press", "low-high-cable-fly"],     3, 10, 15, 2],
    ["Row (balance)",         "seated-cable-row",      ["chest-supported-row", "machine-row"],         3, 10, 15, 2],
    ["Lateral raise",         "db-lateral",            ["cable-lateral", "machine-lateral"],           4, 12, 20, 1],
    ["Triceps pushdown",      "overhead-cable-ext",    ["rope-pushdown", "dip-machine"],               3, 12, 15, 1]
  ]),
  buildDay("lower", "Lower", ["legs", "core"], [
    ["Squat pattern",         "hack-squat",            ["back-squat", "leg-press"],                    4, 8,  12, 2],
    ["Hip hinge",             "rdl",                   ["lying-leg-curl"],                             3, 10, 15, 2],
    ["Leg press / quad",      "bulgarian-split-squat", ["leg-press", "walking-lunge"],                 3, 10, 12, 2],
    ["Leg curl",              "lying-leg-curl",        ["seated-leg-curl", "nordic-curl"],             3, 12, 15, 1],
    ["Calf raise",            "seated-calf",           ["standing-calf", "leg-press-calf"],            4, 10, 15, 1],
    ["Trunk flexion",         "cable-crunch",          ["hanging-leg-raise", "ab-wheel"],              3, 12, 15, 1]
  ]),
  buildDay("pull", "Upper · Pull", ["back", "shoulders", "arms"], [
    ["Vertical pull",         "lat-pulldown",          ["weighted-pullup", "ng-pulldown"],             4, 8,  12, 2],
    ["Horizontal row",        "chest-supported-row",   ["bb-row", "tbar-row", "machine-row"],          4, 10, 12, 2],
    ["Row (width)",           "machine-row",           ["seated-cable-row"],                           3, 12, 15, 2],
    ["Rear delt",             "face-pull",             ["reverse-pecdeck", "rear-delt-cable-fly"],     3, 15, 20, 1],
    ["Supinated curl",        "bayesian-curl",         ["incline-db-curl", "ezbar-curl"],              3, 10, 15, 1],
    ["Neutral curl",          "rope-hammer",           ["hammer-curl"],                                2, 12, 15, 1]
  ]),
  buildDay("arms", "Upper · Arms & Delts", ["arms", "shoulders", "chest"], [
    ["Incline press",         "incline-db-press",      ["incline-machine-press", "incline-bb-press"],  3, 10, 15, 2],
    ["Shoulder press",        "arnold-press",          ["machine-shoulder-press", "seated-db-press"],  3, 10, 12, 2],
    ["Lateral raise",         "machine-lateral",       ["cable-lateral", "db-lateral"],                4, 12, 20, 1, "Drop set on the last set"],
    ["Compound triceps",      "dip-machine",           ["cgbp", "jm-press"],                           3, 10, 12, 2],
    ["Supinated curl",        "machine-preacher",      ["ezbar-curl", "incline-db-curl"],              3, 10, 15, 1],
    ["Overhead triceps",      "crossbody-cable-ext",   ["overhead-cable-ext"],                         2, 12, 15, 1]
  ])
];

/* C — the heavy block. Fewer reps on the primaries, one more set on them, and
   the accessories stay in normal ranges so the extra intensity lands on the
   lifts that carry it. RIR targets are unchanged: heavier is not to failure. */
var VARIANT_C_DAYS = [
  buildDay("push", "Upper · Push", ["chest", "shoulders", "arms"], [
    ["Primary chest press",   "bb-bench",              ["db-bench", "machine-chest-press"],            5, 4,  7,  2, "Heavier block — still leave 2 in the tank"],
    ["Overhead press",        "ohp",                   ["seated-db-press", "machine-shoulder-press"],  4, 5,  8,  2],
    ["Incline press",         "incline-bb-press",      ["incline-smith-press", "incline-db-press"],    3, 6,  10, 2],
    ["Row (balance)",         "chest-supported-row",   ["seated-cable-row", "machine-row"],            3, 8,  12, 2],
    ["Lateral raise",         "cable-lateral",         ["db-lateral", "machine-lateral"],              4, 10, 15, 1],
    ["Triceps pushdown",      "rope-pushdown",         ["overhead-cable-ext", "dip-machine"],          3, 8,  12, 1]
  ]),
  buildDay("lower", "Lower", ["legs", "core"], [
    ["Squat pattern",         "back-squat",            ["hack-squat", "leg-press"],                    5, 4,  7,  2, "Heavier block — still leave 2 in the tank"],
    ["Hip hinge",             "rdl",                   ["lying-leg-curl"],                             4, 6,  8,  2],
    ["Leg press / quad",      "leg-press",             ["hack-squat", "bulgarian-split-squat"],        3, 8,  12, 2],
    ["Leg curl",              "seated-leg-curl",       ["lying-leg-curl", "nordic-curl"],              3, 8,  12, 1],
    ["Calf raise",            "standing-calf",         ["seated-calf", "leg-press-calf"],              4, 6,  10, 1],
    ["Trunk flexion",         "ab-wheel",              ["hanging-leg-raise", "cable-crunch"],          3, 8,  12, 1]
  ]),
  buildDay("pull", "Upper · Pull", ["back", "shoulders", "arms"], [
    ["Vertical pull",         "weighted-pullup",       ["lat-pulldown", "ng-pulldown"],                5, 4,  7,  2, "Add weight before adding reps this block"],
    ["Horizontal row",        "pendlay-row",           ["bb-row", "tbar-row"],                         4, 5,  8,  2],
    ["Row (width)",           "seated-cable-row",      ["machine-row"],                                3, 8,  12, 2],
    ["Rear delt",             "rear-delt-cable-fly",   ["reverse-pecdeck", "face-pull"],               3, 12, 20, 1],
    ["Supinated curl",        "ezbar-curl",            ["incline-db-curl", "bayesian-curl"],           3, 6,  10, 1],
    ["Neutral curl",          "hammer-curl",           ["rope-hammer"],                                3, 8,  12, 1]
  ]),
  buildDay("arms", "Upper · Arms & Delts", ["arms", "shoulders", "chest"], [
    ["Incline press",         "incline-smith-press",   ["incline-bb-press", "incline-db-press"],       4, 6,  10, 2],
    ["Shoulder press",        "seated-db-press",       ["machine-shoulder-press", "arnold-press"],     3, 8,  10, 2],
    ["Lateral raise",         "cable-lateral",         ["db-lateral", "machine-lateral"],              4, 10, 15, 1, "Heavier than usual — stop if the form breaks"],
    ["Compound triceps",      "jm-press",              ["cgbp", "dip-machine"],                        3, 6,  10, 2],
    ["Supinated curl",        "incline-db-curl",       ["ezbar-curl", "machine-preacher"],             3, 6,  10, 1],
    ["Overhead triceps",      "overhead-cable-ext",    ["crossbody-cable-ext"],                        3, 10, 12, 1]
  ])
];

App.PROGRAM_VARIANT_SEED = [
  { id: "A", name: "Barbell base",        blurb: "Barbell primaries, moderate reps.",       days: VARIANT_A_DAYS },
  { id: "B", name: "Dumbbell & machine",  blurb: "Kinder on the joints, a little more volume.", days: VARIANT_B_DAYS },
  { id: "C", name: "Heavy block",         blurb: "Fewer reps and an extra set on the primaries.", days: VARIANT_C_DAYS }
];

App.PROGRAM_SEED = {
  id: "pv1",
  name: "Upper-emphasis block — v1",
  // effectiveStartDate is filled from settings.phaseStartDate on seed / migration
  phaseLengthWeeks: 6,
  trainingDayOrder: ["push", "lower", "pull", "arms"],
  // `days` stays as variant A: it is what every older reader of a program
  // version expects, and the fallback when a version carries no variants.
  days: VARIANT_A_DAYS,
  variants: App.PROGRAM_VARIANT_SEED
};
