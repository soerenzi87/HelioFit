import { Language } from '../../types';

export const APPLIANCES_BASE = [
  { id: 'stove', de: 'Herd', en: 'Stove', icon: 'fa-fire-burner' },
  { id: 'oven', de: 'Backofen', en: 'Oven', icon: 'fa-box-open' },
  { id: 'microwave', de: 'Mikrowelle', en: 'Microwave', icon: 'fa-microwave' },
  { id: 'airfryer', de: 'Heißluftfritteuse', en: 'Air Fryer', icon: 'fa-wind' },
  { id: 'ricecooker', de: 'Reiskocher', en: 'Rice Cooker', icon: 'fa-bowl-rice' },
  { id: 'blender', de: 'Mixer', en: 'Blender', icon: 'fa-blender' },
];

export const VARIETY_OPTIONS = [
  { id: 'SAME_EVERY_DAY', de: 'Konstant', en: 'Constant', sub: '1 Plan / Woche', icon: 'fa-equals' },
  { id: 'TWO_DAY_ROTATION', de: 'Rotation', en: 'Rotation', sub: '2 Tagespläne', icon: 'fa-repeat' },
  { id: 'DAILY_VARIETY', de: 'Vielfalt', en: 'Variety', sub: '7 Tagespläne', icon: 'fa-layer-group' },
];

export const DAYS_DE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
export const SHORT_DAYS_DE: Record<string, string> = { Montag: 'Mo', Dienstag: 'Di', Mittwoch: 'Mi', Donnerstag: 'Do', Freitag: 'Fr', Samstag: 'Sa', Sonntag: 'So' };
export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

export interface AggregatedIngredient {
  name: string;
  amount: number;
  unit: string;
}

export const getTodayDE = (): string => {
  const jsDay = new Date().getDay();
  const map = [6, 0, 1, 2, 3, 4, 5];
  return DAYS_DE[map[jsDay]];
};
