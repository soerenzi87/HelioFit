import { Exercise, ExerciseLog, Language } from '../../types';

export const DAYS_DE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
export const DAYS_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const extractDayName = (dayTitle: string): string => {
  const full = dayTitle.split(':')[0].trim();
  const shortMap: Record<string, string> = {
    'Montag': 'Mo', 'Dienstag': 'Di', 'Mittwoch': 'Mi', 'Donnerstag': 'Do',
    'Freitag': 'Fr', 'Samstag': 'Sa', 'Sonntag': 'So',
    'Monday': 'Mon', 'Tuesday': 'Tue', 'Wednesday': 'Wed', 'Thursday': 'Thu',
    'Friday': 'Fri', 'Saturday': 'Sat', 'Sunday': 'Sun',
  };
  return shortMap[full] || full.slice(0, 2);
};

export const isBodyweightExercise = (ex: Exercise): boolean => {
  const sw = (ex.suggestedWeight || '').toLowerCase();
  const eq = (ex.equipment || '').toLowerCase();
  const nm = ex.name.toLowerCase();
  if (['körpergewicht', 'bodyweight', 'bw'].some(t => sw.includes(t))) return true;
  if (['ohne', 'bodyweight', 'körpergewicht', 'none'].some(t => eq === t)) return true;
  return ['plank', 'dip', 'klimm', 'pull-up', 'pullup', 'chin-up', 'chinup', 'sit-up', 'situp', 'crunch', 'leg raise', 'burpee', 'push-up', 'pushup', 'liegestütz', 'mountain climber'].some(t => nm.includes(t));
};

export const parseSuggestedWeight = (sw?: string): number => {
  if (!sw) return 0;
  const lower = sw.toLowerCase();
  if (lower.includes('körpergewicht') || lower.includes('bodyweight') || lower.includes('ohne')) return 0;
  const kgMatch = lower.match(/([\d.]+)\s*kg/);
  if (kgMatch) return parseFloat(kgMatch[1]);
  const match = sw.match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 0;
};

export const weightPlaceholder = (sw?: string): string => {
  if (!sw) return '';
  const v = parseSuggestedWeight(sw);
  return v > 0 ? String(v) : '';
};

export const parseMaxReps = (reps?: string): number => {
  if (!reps) return 0;
  const lower = reps.toLowerCase();
  if (lower.includes('amrap') || lower.includes('max')) return 0;
  if (lower.includes('s') && /\d+s/.test(lower)) return 0;
  const nums = reps.match(/\d+/g);
  if (!nums) return 0;
  return Math.max(...nums.map(Number));
};

export const repsPlaceholder = (reps?: string): string => {
  if (!reps) return '';
  const v = parseMaxReps(reps);
  return v > 0 ? String(v) : '';
};

export const getDisplayWeight = (set: ExerciseLog['sets'][number]) => set.weightText || (set.weight ? `${set.weight}kg` : '-');
export const getDisplayReps = (set: ExerciseLog['sets'][number]) => set.repsText || (set.reps ? String(set.reps) : '-');
