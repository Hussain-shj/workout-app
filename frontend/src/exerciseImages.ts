const BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises'

const IMAGE_SLUGS: Record<string, string> = {
  'Barbell Bench Press': 'Barbell_Bench_Press_-_Medium_Grip',
  'Dumbbell Bench Press': 'Dumbbell_Bench_Press',
  'Smith Machine Bench Press': 'Smith_Machine_Bench_Press',
  'Machine Chest Press': 'Leverage_Chest_Press',
  'Incline Dumbbell Press': 'Incline_Dumbbell_Press',
  'Cable Fly': 'Cable_Crossover',
  'Overhead Press': 'Standing_Military_Press',
  'Dumbbell Shoulder Press': 'Seated_Dumbbell_Press',
  'Lateral Raise': 'Side_Lateral_Raise',
  'Cable Lateral Raise': 'Cable_Seated_Lateral_Raise',
  'Lat Pulldown': 'Wide-Grip_Lat_Pulldown',
  'Neutral Grip Pulldown': 'Close-Grip_Front_Lat_Pulldown',
  'Assisted Pull-Up': 'Pullups',
  'Single Arm Cable Pulldown': 'Straight-Arm_Pulldown',
  'Seated Cable Row': 'Seated_Cable_Rows',
  'Chest Supported Row': 'T-Bar_Row_with_Handle',
  'Barbell Row': 'Bent_Over_Barbell_Row',
  'Rear Delt Fly': 'Reverse_Flyes',
  'Dumbbell Curl': 'Dumbbell_Bicep_Curl',
  'Cable Curl': 'Cable_Hammer_Curls_-_Rope_Attachment',
  'Rope Pushdown': 'Triceps_Pushdown_-_Rope_Attachment',
  'Overhead Cable Extension': 'Cable_Rope_Overhead_Triceps_Extension',
  'Back Squat': 'Barbell_Full_Squat',
  'Hack Squat': 'Hack_Squat',
  'Leg Press': 'Leg_Press',
  'Leg Extension': 'Leg_Extensions',
  'Romanian Deadlift': 'Romanian_Deadlift',
  'Dumbbell Romanian Deadlift': 'Stiff-Legged_Dumbbell_Deadlift',
  'Lying Leg Curl': 'Lying_Leg_Curls',
  'Seated Leg Curl': 'Seated_Leg_Curl',
  'Standing Calf Raise': 'Standing_Calf_Raises',
  'Seated Calf Raise': 'Seated_Calf_Raise',
}

export function exerciseImageUrl(name: string) {
  const slug = IMAGE_SLUGS[name] || name.trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '')
  return `${BASE}/${slug}/0.jpg`
}

export const fallbackExerciseImage = `${BASE}/Dumbbell_Bench_Press/0.jpg`
