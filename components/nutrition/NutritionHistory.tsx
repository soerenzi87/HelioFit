import React from 'react';
import { Language, UserProfile, Recipe } from '../../types';
import { DAYS_DE, MEAL_TYPES } from './nutritionHelpers';

interface NutritionHistoryProps {
  profile: UserProfile | null;
  language: Language;
}

const NutritionHistory: React.FC<NutritionHistoryProps> = ({ profile, language }) => {
  return (
    <div className="space-y-8 animate-fade-in">
      <div className="bg-[#1a1f26] rounded-[1.5rem] sm:rounded-[3rem] p-5 sm:p-10 lg:p-14 border border-white/5 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-14 opacity-5 text-9xl pointer-events-none translate-x-4"><i className="fas fa-clock-rotate-left text-white"></i></div>
        <div className="relative z-10 mb-6 sm:mb-10">
          <p className="text-orange-500 text-[10px] font-black uppercase tracking-[0.3em] mb-2">{language === 'de' ? 'Vergangene Wochen' : 'Past Weeks'}</p>
          <h3 className="text-2xl sm:text-4xl font-black text-white tracking-tighter uppercase">{language === 'de' ? 'Nutrition Historie' : 'Nutrition History'}</h3>
        </div>

        {(profile?.nutritionHistory || []).slice().reverse().map((entry, idx) => {
          const completedDate = new Date(entry.completedAt);
          const dateStr = completedDate.toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', { day: '2-digit', month: '2-digit', year: 'numeric' });
          const days = Object.keys(entry.plan).sort((a, b) => DAYS_DE.indexOf(a) - DAYS_DE.indexOf(b));
          const weekTotals = { calories: 0, protein: 0, carbs: 0, fats: 0, mealsEaten: 0, mealsTotal: 0 };
          days.forEach(day => {
            const dayPlan = entry.plan[day];
            if (!dayPlan) return;
            MEAL_TYPES.forEach(mt => {
              const meal = dayPlan[mt] as Recipe | undefined;
              if (meal) {
                weekTotals.mealsTotal++;
                const wasEaten = !!entry.eatenMeals[`${day}|${mt}`];
                if (wasEaten) {
                  weekTotals.mealsEaten++;
                  weekTotals.calories += meal.calories || 0;
                  weekTotals.protein += meal.protein || 0;
                  weekTotals.carbs += meal.carbs || 0;
                  weekTotals.fats += meal.fats || 0;
                }
              }
            });
            const addFood = entry.additionalFood?.[day];
            if (addFood?.estimate) {
              weekTotals.calories += addFood.estimate.totalCalories || 0;
              weekTotals.protein += addFood.estimate.totalProtein || 0;
              weekTotals.carbs += addFood.estimate.totalCarbs || 0;
              weekTotals.fats += addFood.estimate.totalFats || 0;
            }
          });
          const adherencePercent = weekTotals.mealsTotal > 0 ? Math.round((weekTotals.mealsEaten / weekTotals.mealsTotal) * 100) : 0;

          return (
            <details key={idx} className="group">
              <summary className="cursor-pointer list-none">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 bg-slate-800/40 rounded-2xl border border-white/5 hover:bg-slate-800/60 transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-orange-600/20 rounded-2xl flex items-center justify-center">
                      <i className="fas fa-utensils text-orange-400"></i>
                    </div>
                    <div>
                      <p className="text-white font-bold text-sm">{language === 'de' ? 'Woche abgeschlossen' : 'Week completed'} {dateStr}</p>
                      <p className="text-slate-400 text-xs">{days.length} {language === 'de' ? 'Tage' : 'days'} · {weekTotals.mealsEaten}/{weekTotals.mealsTotal} {language === 'de' ? 'Mahlzeiten gegessen' : 'meals eaten'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${adherencePercent}%`, backgroundColor: adherencePercent >= 80 ? '#22c55e' : adherencePercent >= 50 ? '#f59e0b' : '#ef4444' }}></div>
                      </div>
                      <span className="text-xs font-bold text-slate-300">{adherencePercent}%</span>
                    </div>
                    <i className="fas fa-chevron-down text-slate-500 text-xs group-open:rotate-180 transition-transform"></i>
                  </div>
                </div>
              </summary>

              <div className="mt-4 space-y-3 pl-4 border-l-2 border-orange-600/20 ml-6">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  {[
                    { label: 'kcal', value: Math.round(weekTotals.calories), color: 'text-orange-400' },
                    { label: language === 'de' ? 'Protein' : 'Protein', value: `${Math.round(weekTotals.protein)}g`, color: 'text-blue-400' },
                    { label: 'Carbs', value: `${Math.round(weekTotals.carbs)}g`, color: 'text-amber-400' },
                    { label: language === 'de' ? 'Fette' : 'Fats', value: `${Math.round(weekTotals.fats)}g`, color: 'text-pink-400' },
                  ].map(stat => (
                    <div key={stat.label} className="bg-slate-800/40 rounded-xl p-3 text-center border border-white/5">
                      <p className={`text-lg font-black ${stat.color}`}>{stat.value}</p>
                      <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">{stat.label}</p>
                    </div>
                  ))}
                </div>

                {days.map(day => {
                  const dayPlan = entry.plan[day];
                  if (!dayPlan) return null;
                  const dayMeals = MEAL_TYPES.filter(mt => dayPlan[mt]);
                  const dayEaten = dayMeals.filter(mt => entry.eatenMeals[`${day}|${mt}`]);
                  const addFood = entry.additionalFood?.[day];

                  return (
                    <div key={day} className="bg-slate-800/20 rounded-xl p-4 border border-white/5">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-bold text-white">{day}</p>
                        <span className="text-[10px] font-bold text-slate-400">{dayEaten.length}/{dayMeals.length} <i className="fas fa-check text-emerald-400"></i></span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {dayMeals.map(mt => {
                          const meal = dayPlan[mt] as Recipe;
                          const eaten = !!entry.eatenMeals[`${day}|${mt}`];
                          return (
                            <span key={mt} className={`text-[10px] px-3 py-1 rounded-full font-bold ${eaten ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/20' : 'bg-slate-700/50 text-slate-500 border border-white/5'}`}>
                              {meal.name || mt}
                            </span>
                          );
                        })}
                        {addFood?.text && (
                          <span className="text-[10px] px-3 py-1 rounded-full font-bold bg-amber-500/20 text-amber-300 border border-amber-400/20">
                            + {addFood.text}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          );
        })}

        {(!profile?.nutritionHistory || profile.nutritionHistory.length === 0) && (
          <p className="text-slate-500 text-sm text-center py-10">{language === 'de' ? 'Noch keine abgeschlossenen Wochen.' : 'No completed weeks yet.'}</p>
        )}
      </div>
    </div>
  );
};

export default NutritionHistory;
