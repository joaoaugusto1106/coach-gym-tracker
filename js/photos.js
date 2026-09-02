/* Exercise reference photos — curated, not fuzzy-matched.

   Source: free-exercise-db (https://github.com/yuhonas/free-exercise-db),
   released into the public domain (Unlicense). Images are served from
   raw.githubusercontent.com and lazy-loaded; the app works fine without them.

   Every entry below was matched BY HAND against the database and marked:
     "exact" — same movement, same equipment
     "close" — same movement pattern, different kit or grip. Still useful for
               form, and the app says so on the photo rather than pretending.
     null    — nothing honest to show. No photo is better than a wrong one.

   Regenerate/extend with tools/match-exercise-photos.py. */

window.App = window.App || {};

App.EXERCISE_PHOTO_SOURCE = {
  name: "free-exercise-db",
  url: "https://github.com/yuhonas/free-exercise-db",
  licence: "Public domain (Unlicense)",
  base: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/"
};

App.EXERCISE_PHOTOS = {
  "ab-wheel": { id: "Barbell_Ab_Rollout_-_On_Knees", name: "Barbell Ab Rollout - On Knees", match: "close", images: ["Barbell_Ab_Rollout_-_On_Knees/0.jpg", "Barbell_Ab_Rollout_-_On_Knees/1.jpg"] },
  "arnold-press": { id: "Arnold_Dumbbell_Press", name: "Arnold Dumbbell Press", match: "exact", images: ["Arnold_Dumbbell_Press/0.jpg", "Arnold_Dumbbell_Press/1.jpg"] },
  "assisted-pullup": { id: "Band_Assisted_Pull-Up", name: "Band Assisted Pull-Up", match: "close", images: ["Band_Assisted_Pull-Up/0.jpg", "Band_Assisted_Pull-Up/1.jpg"] },
  "back-squat": { id: "Barbell_Squat", name: "Barbell Squat", match: "exact", images: ["Barbell_Squat/0.jpg", "Barbell_Squat/1.jpg"] },
  "bayesian-curl": { id: "Standing_Biceps_Cable_Curl", name: "Standing Biceps Cable Curl", match: "close", images: ["Standing_Biceps_Cable_Curl/0.jpg", "Standing_Biceps_Cable_Curl/1.jpg"] },
  "bb-bench": { id: "Barbell_Bench_Press_-_Medium_Grip", name: "Barbell Bench Press - Medium Grip", match: "exact", images: ["Barbell_Bench_Press_-_Medium_Grip/0.jpg", "Barbell_Bench_Press_-_Medium_Grip/1.jpg"] },
  "bb-row": { id: "Bent_Over_Barbell_Row", name: "Bent Over Barbell Row", match: "exact", images: ["Bent_Over_Barbell_Row/0.jpg", "Bent_Over_Barbell_Row/1.jpg"] },
  "bulgarian-split-squat": { id: "Split_Squat_with_Dumbbells", name: "Split Squat with Dumbbells", match: "close", images: ["Split_Squat_with_Dumbbells/0.jpg", "Split_Squat_with_Dumbbells/1.jpg"] },
  "cable-crunch": { id: "Cable_Crunch", name: "Cable Crunch", match: "exact", images: ["Cable_Crunch/0.jpg", "Cable_Crunch/1.jpg"] },
  "cable-lateral": { id: "Cable_Seated_Lateral_Raise", name: "Cable Seated Lateral Raise", match: "close", images: ["Cable_Seated_Lateral_Raise/0.jpg", "Cable_Seated_Lateral_Raise/1.jpg"] },
  "cgbp": { id: "Close-Grip_Barbell_Bench_Press", name: "Close-Grip Barbell Bench Press", match: "exact", images: ["Close-Grip_Barbell_Bench_Press/0.jpg", "Close-Grip_Barbell_Bench_Press/1.jpg"] },
  "chest-supported-row": { id: "Leverage_High_Row", name: "Leverage High Row", match: "close", images: ["Leverage_High_Row/0.jpg", "Leverage_High_Row/1.jpg"] },
  "crossbody-cable-ext": { id: "Low_Cable_Triceps_Extension", name: "Low Cable Triceps Extension", match: "close", images: ["Low_Cable_Triceps_Extension/0.jpg", "Low_Cable_Triceps_Extension/1.jpg"] },
  "db-bench": { id: "Dumbbell_Bench_Press", name: "Dumbbell Bench Press", match: "exact", images: ["Dumbbell_Bench_Press/0.jpg", "Dumbbell_Bench_Press/1.jpg"] },
  "db-lateral": { id: "Side_Lateral_Raise", name: "Side Lateral Raise", match: "exact", images: ["Side_Lateral_Raise/0.jpg", "Side_Lateral_Raise/1.jpg"] },
  "dip-machine": { id: "Dip_Machine", name: "Dip Machine", match: "exact", images: ["Dip_Machine/0.jpg", "Dip_Machine/1.jpg"] },
  "ezbar-curl": { id: "EZ-Bar_Curl", name: "EZ-Bar Curl", match: "exact", images: ["EZ-Bar_Curl/0.jpg", "EZ-Bar_Curl/1.jpg"] },
  "face-pull": { id: "Face_Pull", name: "Face Pull", match: "exact", images: ["Face_Pull/0.jpg", "Face_Pull/1.jpg"] },
  "hack-squat": { id: "Hack_Squat", name: "Hack Squat", match: "exact", images: ["Hack_Squat/0.jpg", "Hack_Squat/1.jpg"] },
  "hammer-curl": { id: "Hammer_Curls", name: "Hammer Curls", match: "exact", images: ["Hammer_Curls/0.jpg", "Hammer_Curls/1.jpg"] },
  "hanging-leg-raise": { id: "Hanging_Leg_Raise", name: "Hanging Leg Raise", match: "exact", images: ["Hanging_Leg_Raise/0.jpg", "Hanging_Leg_Raise/1.jpg"] },
  "incline-bb-press": { id: "Barbell_Incline_Bench_Press_-_Medium_Grip", name: "Barbell Incline Bench Press - Medium Grip", match: "exact", images: ["Barbell_Incline_Bench_Press_-_Medium_Grip/0.jpg", "Barbell_Incline_Bench_Press_-_Medium_Grip/1.jpg"] },
  "incline-db-curl": { id: "Incline_Dumbbell_Curl", name: "Incline Dumbbell Curl", match: "exact", images: ["Incline_Dumbbell_Curl/0.jpg", "Incline_Dumbbell_Curl/1.jpg"] },
  "incline-db-press": { id: "Incline_Dumbbell_Press", name: "Incline Dumbbell Press", match: "exact", images: ["Incline_Dumbbell_Press/0.jpg", "Incline_Dumbbell_Press/1.jpg"] },
  "incline-machine-press": { id: "Leverage_Incline_Chest_Press", name: "Leverage Incline Chest Press", match: "exact", images: ["Leverage_Incline_Chest_Press/0.jpg", "Leverage_Incline_Chest_Press/1.jpg"] },
  "incline-smith-press": { id: "Smith_Machine_Incline_Bench_Press", name: "Smith Machine Incline Bench Press", match: "exact", images: ["Smith_Machine_Incline_Bench_Press/0.jpg", "Smith_Machine_Incline_Bench_Press/1.jpg"] },
  "jm-press": { id: "JM_Press", name: "JM Press", match: "exact", images: ["JM_Press/0.jpg", "JM_Press/1.jpg"] },
  "lat-pulldown": { id: "Wide-Grip_Lat_Pulldown", name: "Wide-Grip Lat Pulldown", match: "close", images: ["Wide-Grip_Lat_Pulldown/0.jpg", "Wide-Grip_Lat_Pulldown/1.jpg"] },
  "leg-press": { id: "Leg_Press", name: "Leg Press", match: "exact", images: ["Leg_Press/0.jpg", "Leg_Press/1.jpg"] },
  "leg-press-calf": { id: "Calf_Press_On_The_Leg_Press_Machine", name: "Calf Press On The Leg Press Machine", match: "exact", images: ["Calf_Press_On_The_Leg_Press_Machine/0.jpg", "Calf_Press_On_The_Leg_Press_Machine/1.jpg"] },
  "low-high-cable-fly": { id: "Low_Cable_Crossover", name: "Low Cable Crossover", match: "close", images: ["Low_Cable_Crossover/0.jpg", "Low_Cable_Crossover/1.jpg"] },
  "lying-leg-curl": { id: "Lying_Leg_Curls", name: "Lying Leg Curls", match: "exact", images: ["Lying_Leg_Curls/0.jpg", "Lying_Leg_Curls/1.jpg"] },
  "machine-chest-press": { id: "Leverage_Chest_Press", name: "Leverage Chest Press", match: "exact", images: ["Leverage_Chest_Press/0.jpg", "Leverage_Chest_Press/1.jpg"] },
  "machine-lateral": { id: "Side_Lateral_Raise", name: "Side Lateral Raise", match: "close", images: ["Side_Lateral_Raise/0.jpg", "Side_Lateral_Raise/1.jpg"] },
  "machine-preacher": { id: "Machine_Preacher_Curls", name: "Machine Preacher Curls", match: "exact", images: ["Machine_Preacher_Curls/0.jpg", "Machine_Preacher_Curls/1.jpg"] },
  "machine-row": { id: "Leverage_Iso_Row", name: "Leverage Iso Row", match: "close", images: ["Leverage_Iso_Row/0.jpg", "Leverage_Iso_Row/1.jpg"] },
  "machine-shoulder-press": { id: "Machine_Shoulder_Military_Press", name: "Machine Shoulder (Military) Press", match: "exact", images: ["Machine_Shoulder_Military_Press/0.jpg", "Machine_Shoulder_Military_Press/1.jpg"] },
  "ng-pulldown": { id: "Close-Grip_Front_Lat_Pulldown", name: "Close-Grip Front Lat Pulldown", match: "close", images: ["Close-Grip_Front_Lat_Pulldown/0.jpg", "Close-Grip_Front_Lat_Pulldown/1.jpg"] },
  "nordic-curl": null,
  "ohp": { id: "Standing_Military_Press", name: "Standing Military Press", match: "exact", images: ["Standing_Military_Press/0.jpg", "Standing_Military_Press/1.jpg"] },
  "overhead-cable-ext": { id: "Cable_Rope_Overhead_Triceps_Extension", name: "Cable Rope Overhead Triceps Extension", match: "exact", images: ["Cable_Rope_Overhead_Triceps_Extension/0.jpg", "Cable_Rope_Overhead_Triceps_Extension/1.jpg"] },
  "pendlay-row": { id: "Bent_Over_Barbell_Row", name: "Bent Over Barbell Row", match: "close", images: ["Bent_Over_Barbell_Row/0.jpg", "Bent_Over_Barbell_Row/1.jpg"] },
  "rdl": { id: "Romanian_Deadlift", name: "Romanian Deadlift", match: "exact", images: ["Romanian_Deadlift/0.jpg", "Romanian_Deadlift/1.jpg"] },
  "rear-delt-cable-fly": { id: "Cable_Rear_Delt_Fly", name: "Cable Rear Delt Fly", match: "exact", images: ["Cable_Rear_Delt_Fly/0.jpg", "Cable_Rear_Delt_Fly/1.jpg"] },
  "reverse-pecdeck": { id: "Reverse_Machine_Flyes", name: "Reverse Machine Flyes", match: "exact", images: ["Reverse_Machine_Flyes/0.jpg", "Reverse_Machine_Flyes/1.jpg"] },
  "rope-hammer": { id: "Cable_Hammer_Curls_-_Rope_Attachment", name: "Cable Hammer Curls - Rope Attachment", match: "exact", images: ["Cable_Hammer_Curls_-_Rope_Attachment/0.jpg", "Cable_Hammer_Curls_-_Rope_Attachment/1.jpg"] },
  "rope-pushdown": { id: "Triceps_Pushdown_-_Rope_Attachment", name: "Triceps Pushdown - Rope Attachment", match: "exact", images: ["Triceps_Pushdown_-_Rope_Attachment/0.jpg", "Triceps_Pushdown_-_Rope_Attachment/1.jpg"] },
  "seated-cable-row": { id: "Seated_Cable_Rows", name: "Seated Cable Rows", match: "exact", images: ["Seated_Cable_Rows/0.jpg", "Seated_Cable_Rows/1.jpg"] },
  "seated-calf": { id: "Seated_Calf_Raise", name: "Seated Calf Raise", match: "exact", images: ["Seated_Calf_Raise/0.jpg", "Seated_Calf_Raise/1.jpg"] },
  "seated-db-press": { id: "Seated_Dumbbell_Press", name: "Seated Dumbbell Press", match: "exact", images: ["Seated_Dumbbell_Press/0.jpg", "Seated_Dumbbell_Press/1.jpg"] },
  "seated-leg-curl": { id: "Seated_Leg_Curl", name: "Seated Leg Curl", match: "exact", images: ["Seated_Leg_Curl/0.jpg", "Seated_Leg_Curl/1.jpg"] },
  "standing-calf": { id: "Standing_Calf_Raises", name: "Standing Calf Raises", match: "exact", images: ["Standing_Calf_Raises/0.jpg", "Standing_Calf_Raises/1.jpg"] },
  "tbar-row": { id: "T-Bar_Row_with_Handle", name: "T-Bar Row with Handle", match: "exact", images: ["T-Bar_Row_with_Handle/0.jpg", "T-Bar_Row_with_Handle/1.jpg"] },
  "walking-lunge": { id: "Dumbbell_Lunges", name: "Dumbbell Lunges", match: "close", images: ["Dumbbell_Lunges/0.jpg", "Dumbbell_Lunges/1.jpg"] },
  "weighted-dip": { id: "Dips_-_Chest_Version", name: "Dips - Chest Version", match: "close", images: ["Dips_-_Chest_Version/0.jpg", "Dips_-_Chest_Version/1.jpg"] },
  "weighted-pullup": { id: "Weighted_Pull_Ups", name: "Weighted Pull Ups", match: "exact", images: ["Weighted_Pull_Ups/0.jpg", "Weighted_Pull_Ups/1.jpg"] }
};
