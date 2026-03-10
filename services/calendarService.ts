
import { WeeklyMealPlan, WorkoutProgram, Language } from "../types";

const DAYS_MAP: Record<string, number> = {
  'Montag': 1, 'Dienstag': 2, 'Mittwoch': 3, 'Donnerstag': 4, 'Freitag': 5, 'Samstag': 6, 'Sonntag': 0,
  'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6, 'Sunday': 0
};

function getNextDateForDay(dayName: string): Date {
  const targetDay = DAYS_MAP[dayName];
  const now = new Date();
  const resultDate = new Date(now);
  const currentDay = now.getDay();
  
  let diff = targetDay - currentDay;
  if (diff < 0) diff += 7;
  
  resultDate.setDate(now.getDate() + diff);
  return resultDate;
}

function formatDateToICS(date: Date, hours: number, minutes: number): string {
  const d = new Date(date);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

export const exportMealPlanToICS = (plan: WeeklyMealPlan, lang: Language) => {
  let icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HelioFit AI//Meal Planner//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH'
  ];

  Object.entries(plan).forEach(([day, meals]) => {
    const baseDate = getNextDateForDay(day);
    
    const mealTimes = [
      { key: 'breakfast', h: 8, m: 0, title: lang === 'de' ? 'Frühstück' : 'Breakfast' },
      { key: 'lunch', h: 12, m: 30, title: lang === 'de' ? 'Mittagessen' : 'Lunch' },
      { key: 'snack', h: 16, m: 0, title: lang === 'de' ? 'Snack' : 'Snack' },
      { key: 'dinner', h: 19, m: 0, title: lang === 'de' ? 'Abendessen' : 'Dinner' }
    ];

    mealTimes.forEach(mt => {
      const meal = (meals as any)[mt.key];
      if (!meal) return;

      const start = formatDateToICS(baseDate, mt.h, mt.m);
      const end = formatDateToICS(baseDate, mt.h + 1, mt.m);

      icsContent.push('BEGIN:VEVENT');
      icsContent.push(`SUMMARY:HelioFit: ${mt.title} - ${meal.name}`);
      icsContent.push(`DTSTART:${start}`);
      icsContent.push(`DTEND:${end}`);
      icsContent.push(`DESCRIPTION:${meal.calories}kcal | P: ${meal.protein}g\\n\\nZutaten: ${meal.ingredients.join(', ')}`);
      icsContent.push('END:VEVENT');
    });
  });

  icsContent.push('END:VCALENDAR');
  downloadFile(icsContent.join('\r\n'), 'HelioFit_MealPlan.ics');
};

export const exportWorkoutToICS = (program: WorkoutProgram, lang: Language) => {
  let icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HelioFit AI//Workout//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH'
  ];

  program.sessions.forEach(session => {
    // Extrahiere Wochentag aus Titeln wie "Montag: Oberkörper"
    const dayMatch = session.dayTitle.match(/(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/);
    const dayName = dayMatch ? dayMatch[0] : 'Monday';
    const baseDate = getNextDateForDay(dayName);

    const start = formatDateToICS(baseDate, 18, 0);
    const end = formatDateToICS(baseDate, 19, 0);

    icsContent.push('BEGIN:VEVENT');
    icsContent.push(`SUMMARY:HelioFit Workout: ${session.dayTitle}`);
    icsContent.push(`DTSTART:${start}`);
    icsContent.push(`DTEND:${end}`);
    icsContent.push(`DESCRIPTION:Fokus: ${session.focus}\\nDauer: ${session.duration}\\n\\nÜbungen:\\n${session.exercises.map(e => `- ${e.name} (${e.sets}x${e.reps})`).join('\\n')}`);
    icsContent.push('END:VEVENT');
  });

  icsContent.push('END:VCALENDAR');
  downloadFile(icsContent.join('\r\n'), 'HelioFit_Workout.ics');
};

function downloadFile(content: string, fileName: string) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const link = document.createElement('a');
  link.href = window.URL.createObjectURL(blob);
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
