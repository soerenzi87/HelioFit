
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { WeeklyMealPlan, DailyMealPlan, Recipe, NutritionPreferences, Language, UserProfile } from '../types';
import { adjustDailyPlanAfterException } from '../services/geminiService';
import { exportMealPlanToICS } from '../services/calendarService';

interface NutritionTabProps {
  weeklyPlan: WeeklyMealPlan | null;
  onGeneratePlan: (prefs: NutritionPreferences) => void;
  onUpdateWeeklyPlan: (day: string, dailyPlan: DailyMealPlan) => void;
  isLoading: boolean;
  language: Language;
  profile: UserProfile | null;
  targets: any;
  onUpdateProfile: (updated: UserProfile) => void;
}

const APPLIANCES_BASE = [
  { id: 'stove', de: 'Herd', en: 'Stove', icon: 'fa-fire-burner' },
  { id: 'oven', de: 'Backofen', en: 'Oven', icon: 'fa-box-open' },
  { id: 'microwave', de: 'Mikrowelle', en: 'Mikrowelle', icon: 'fa-microwave' },
  { id: 'airfryer', de: 'Heißluftfritteuse', en: 'Air Fryer', icon: 'fa-wind' },
  { id: 'ricecooker', de: 'Reiskocher', en: 'Rice Cooker', icon: 'fa-bowl-rice' },
  { id: 'blender', de: 'Mixer', en: 'Blender', icon: 'fa-blender' },
];

const VARIETY_OPTIONS = [
  { id: 'SAME_EVERY_DAY', de: 'Konstant', en: 'Constant', sub: '1 Plan / Woche', icon: 'fa-equals' },
  { id: 'TWO_DAY_ROTATION', de: 'Rotation', en: 'Rotation', sub: '2 Tagespläne', icon: 'fa-repeat' },
  { id: 'DAILY_VARIETY', de: 'Vielfalt', en: 'Variety', sub: '7 Tagespläne', icon: 'fa-layer-group' },
];

const DAYS_DE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

interface AggregatedIngredient {
  name: string;
  amount: number;
  unit: string;
}

const NutritionTab: React.FC<NutritionTabProps> = ({ weeklyPlan, onGeneratePlan, onUpdateWeeklyPlan, isLoading, language, profile, targets, onUpdateProfile }) => {
  const [selectedDay, setSelectedDay] = useState<string>(DAYS_DE[0]);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [showShoppingList, setShowShoppingList] = useState(false);
  
  const [preferredTags, setPreferredTags] = useState<string[]>(profile?.nutritionPreferences?.preferredIngredients || []);
  const [excludedTags, setExcludedTags] = useState<string[]>(profile?.nutritionPreferences?.excludedIngredients || []);
  const [selectedAppliances, setSelectedAppliances] = useState<string[]>(profile?.nutritionPreferences?.appliances || ['stove', 'oven']);
  const [selectedDays, setSelectedDays] = useState<string[]>(profile?.nutritionPreferences?.days || ['Montag', 'Mittwoch', 'Freitag']);
  const [planVariety, setPlanVariety] = useState<'SAME_EVERY_DAY' | 'TWO_DAY_ROTATION' | 'DAILY_VARIETY'>(profile?.nutritionPreferences?.planVariety || 'DAILY_VARIETY');
  
  const [prefInput, setPrefInput] = useState('');
  const [exclInput, setExclInput] = useState('');
  const [exceptionInput, setExceptionInput] = useState<{meal: string, text: string} | null>(null);
  const [isAdjusting, setIsAdjusting] = useState(false);

  // Sync local state to profile when it changes to persist across tab switches
  const updatePrefs = (updates: Partial<NutritionPreferences>) => {
    if (!profile) return;
    const newPrefs = {
      preferredIngredients: preferredTags,
      excludedIngredients: excludedTags,
      appliances: selectedAppliances,
      days: selectedDays,
      planVariety,
      ...updates
    };
    onUpdateProfile({
      ...profile,
      nutritionPreferences: newPrefs
    });
  };

  // Fix: Added missing 'instructions' property to the translation object 't'
  const t = language === 'de' ? {
    engine: 'Food Engine', configSub: 'Algorithmus konfigurieren', daysSelect: 'Tage für den Plan wählen', run: 'Wochenplan erstellen', exception: 'Ausnahme loggen', appliances: 'Geräte', protein: 'Protein', carbs: 'Carbs', fats: 'Fette', ingredients: 'Zutaten', instructions: 'Zubereitung', shopping: 'Einkaufsliste', noPlan: 'Kein Plan vorhanden', preferred: 'Bevorzugte Zutaten', excluded: 'Ausschlüsse (Allergien/Abneigungen)', add: 'Hinzufügen', export: 'In Kalender exportieren', varietyTitle: 'Wiederholungsmuster', shoppingSub: 'Aggregierte Mengen für die Woche',
    errorNoAnalysis: 'Bitte führe zuerst eine KI-Analyse im Dashboard (Overview) durch, um deine Kalorienziele zu berechnen.'
  } : {
    engine: 'Food Engine', configSub: 'Configure algorithm', daysSelect: 'Select days', run: 'Generate Weekly Plan', exception: 'Log Exception', appliances: 'Tools', protein: 'Protein', carbs: 'Carbs', fats: 'Fats', ingredients: 'Ingredients', instructions: 'Instructions', shopping: 'Shopping List', noPlan: 'No plan available', preferred: 'Preferred Ingredients', excluded: 'Excluded (Allergies/Dislikes)', add: 'Add', export: 'Export', varietyTitle: 'Repetition Pattern', shoppingSub: 'Weekly aggregated totals',
    errorNoAnalysis: 'Please perform an AI analysis in the Dashboard (Overview) first to calculate your calorie targets.'
  };

  const dayTotals = useMemo(() => {
    if (!weeklyPlan || !weeklyPlan[selectedDay]) return null;
    return (Object.values(weeklyPlan[selectedDay]) as Recipe[]).reduce((acc, meal) => {
      acc.calories += meal.calories || 0;
      acc.protein += meal.protein || 0;
      acc.carbs += meal.carbs || 0;
      acc.fats += meal.fats || 0;
      return acc;
    }, { calories: 0, protein: 0, carbs: 0, fats: 0 });
  }, [weeklyPlan, selectedDay]);

  const shoppingList = useMemo((): AggregatedIngredient[] => {
    if (!weeklyPlan) return [];
    const ingredientMap = new Map<string, { amount: number, unit: string }>();
    Object.values(weeklyPlan).forEach(dayPlan => {
      MEAL_TYPES.forEach(type => {
        dayPlan[type]?.ingredients.forEach(ingStr => {
          const match = ingStr.match(/([\d.,]+)\s*(g|kg|ml|l|el|tl|stk|stück)?/i);
          const amount = match ? parseFloat(match[1].replace(',', '.')) : 0;
          const unit = match?.[2] ? match[2].toLowerCase() : '';
          const name = ingStr.replace(/([\d.,]+)\s*(g|kg|ml|l|el|tl|stk|stück)?/gi, '').trim().toLowerCase();
          if (!name) return;
          const key = `${name}|${unit}`;
          if (ingredientMap.has(key)) ingredientMap.get(key)!.amount += amount;
          else ingredientMap.set(key, { amount, unit });
        });
      });
    });
    return Array.from(ingredientMap.entries()).map(([key, data]) => {
      const [name] = key.split('|');
      let finalAmount = data.amount;
      let finalUnit = data.unit;
      if (finalUnit === 'g' && finalAmount >= 1000) { finalAmount /= 1000; finalUnit = 'kg'; }
      return { name: name.charAt(0).toUpperCase() + name.slice(1), amount: Math.round(finalAmount * 100) / 100, unit: finalUnit };
    }).sort((a,b) => a.name.localeCompare(b.name));
  }, [weeklyPlan]);

  const handleGenerateClick = () => {
    if (!targets) {
      alert(t.errorNoAnalysis);
      return;
    }
    onGeneratePlan({ preferredIngredients: preferredTags, excludedIngredients: excludedTags, appliances: selectedAppliances, days: selectedDays, planVariety });
    setShowConfig(false);
  };

  const handleAddPref = () => { 
    if (prefInput) { 
      const newTags = [...preferredTags, prefInput];
      setPreferredTags(newTags); 
      setPrefInput(''); 
      updatePrefs({ preferredIngredients: newTags });
    } 
  };
  const handleAddExcl = () => { 
    if (exclInput) { 
      const newTags = [...excludedTags, exclInput];
      setExcludedTags(newTags); 
      setExclInput(''); 
      updatePrefs({ excludedIngredients: newTags });
    } 
  };

  if (isLoading) return <div className="flex flex-col items-center justify-center min-h-[500px]"><div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div><p className="mt-4 font-black uppercase text-[10px] text-slate-400">Masterchef Engine...</p></div>;

  if (!weeklyPlan || showConfig) return (
    <div className="bg-white rounded-[3rem] shadow-2xl p-8 lg:p-12 border border-slate-100 space-y-10 animate-fade-in mb-10">
      <div className="flex items-center justify-between">
        <div><h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">{t.engine}</h3><p className="text-slate-400 text-xs font-bold uppercase tracking-widest">{t.configSub}</p></div>
        {weeklyPlan && <button onClick={() => setShowConfig(false)} className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center"><i className="fas fa-times text-xl"></i></button>}
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <div className="space-y-8">
          <div className="space-y-4">
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.daysSelect}</label>
            <div className="flex flex-wrap gap-2">
              {DAYS_DE.map(day => {
                const isActive = selectedDays.includes(day);
                return (
                  <button 
                    key={day} 
                    onClick={() => {
                      const newDays = isActive ? selectedDays.filter(d => d !== day) : [...selectedDays, day];
                      setSelectedDays(newDays);
                      updatePrefs({ days: newDays });
                    }} 
                    className={`px-4 py-2.5 rounded-xl text-[10px] font-black transition-all border ${isActive ? 'bg-orange-600 border-orange-600 text-white shadow-md' : 'bg-white border-slate-200 text-slate-400'}`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-4">
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.preferred}</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input type="text" value={prefInput} onChange={e => setPrefInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddPref()} placeholder="z.B. Skyr, Hähnchen..." className="flex-1 p-4 bg-slate-50 rounded-2xl border border-slate-100 font-bold outline-none focus:ring-2 focus:ring-orange-500" />
              <button onClick={handleAddPref} className="w-full sm:w-auto px-6 py-4 sm:py-0 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px]">{t.add}</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {preferredTags.map(tag => (
                <span key={tag} className="px-3 py-1.5 bg-orange-50 text-orange-600 border border-orange-100 rounded-xl text-[10px] font-black flex items-center gap-2">
                  {tag} 
                  <button onClick={() => {
                    const newTags = preferredTags.filter(t => t !== tag);
                    setPreferredTags(newTags);
                    updatePrefs({ preferredIngredients: newTags });
                  }}>
                    <i className="fas fa-times"></i>
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.excluded}</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input type="text" value={exclInput} onChange={e => setExclInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddExcl()} placeholder="z.B. Fisch, Koriander..." className="flex-1 p-4 bg-slate-50 rounded-2xl border border-slate-100 font-bold outline-none focus:ring-2 focus:ring-orange-500" />
              <button onClick={handleAddExcl} className="w-full sm:w-auto px-6 py-4 sm:py-0 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px]">{t.add}</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {excludedTags.map(tag => (
                <span key={tag} className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-100 rounded-xl text-[10px] font-black flex items-center gap-2">
                  {tag} 
                  <button onClick={() => {
                    const newTags = excludedTags.filter(t => t !== tag);
                    setExcludedTags(newTags);
                    updatePrefs({ excludedIngredients: newTags });
                  }}>
                    <i className="fas fa-times"></i>
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <div className="space-y-4">
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.varietyTitle}</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {VARIETY_OPTIONS.map(opt => (
                <button 
                  key={opt.id} 
                  onClick={() => {
                    const val = opt.id as any;
                    setPlanVariety(val);
                    updatePrefs({ planVariety: val });
                  }} 
                  className={`p-5 rounded-[2rem] border transition-all flex flex-col items-center text-center gap-2 ${planVariety === opt.id ? 'bg-slate-900 border-slate-900 text-white shadow-xl scale-105' : 'bg-slate-50 border-slate-100 text-slate-400'}`}
                >
                  <i className={`fas ${opt.icon} text-lg ${planVariety === opt.id ? 'text-orange-500' : ''}`}></i>
                  <div>
                    <p className="text-[10px] font-black uppercase mb-1">{opt[language]}</p>
                    <p className="text-[8px] opacity-60 font-bold uppercase whitespace-nowrap">{opt.sub}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.appliances}</label>
            <div className="grid grid-cols-2 gap-3">
              {APPLIANCES_BASE.map(app => {
                const isActive = selectedAppliances.includes(app.id);
                return (
                  <button 
                    key={app.id} 
                    onClick={() => {
                      const newApps = isActive ? selectedAppliances.filter(a => a !== app.id) : [...selectedAppliances, app.id];
                      setSelectedAppliances(newApps);
                      updatePrefs({ appliances: newApps });
                    }} 
                    className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${isActive ? 'bg-slate-900 border-slate-900 text-white shadow-md' : 'bg-slate-50 border-slate-100 text-slate-400'}`}
                  >
                    <i className={`fas ${app.icon} text-lg ${isActive ? 'text-orange-500' : ''}`}></i>
                    <span className="text-[10px] font-black uppercase">{app[language]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <button onClick={handleGenerateClick} className="w-full py-6 bg-orange-600 text-white rounded-[2rem] font-black text-xl uppercase tracking-widest shadow-xl shadow-orange-100 hover:bg-orange-700 transition-all">{t.run}</button>
    </div>
  );

  return (
    <div className="space-y-6 pb-20 animate-fade-in relative">
      <div className="flex flex-col gap-4">
        <div className="flex overflow-x-auto gap-1.5 p-1 bg-slate-100 rounded-2xl w-full no-scrollbar">
          {Object.keys(weeklyPlan || {}).sort((a,b) => DAYS_DE.indexOf(a) - DAYS_DE.indexOf(b)).map(day => (
            <button key={day} onClick={() => setSelectedDay(day)} className={`shrink-0 px-5 py-2.5 rounded-xl font-black text-[11px] uppercase transition-all whitespace-nowrap ${selectedDay === day ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500'}`}>{day}</button>
          ))}
          <div className="flex gap-1.5 ml-auto">
             <button onClick={() => setShowShoppingList(true)} className="px-4 py-2.5 rounded-xl text-slate-400 bg-white shadow-sm flex items-center justify-center"><i className="fas fa-shopping-basket"></i></button>
             <button onClick={() => setShowConfig(true)} className="px-4 py-2.5 rounded-xl text-slate-400 bg-white shadow-sm flex items-center justify-center"><i className="fas fa-sliders"></i></button>
          </div>
        </div>
        
        {dayTotals && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
             <div className="bg-white p-3 rounded-2xl text-center shadow-sm"><p className="text-[8px] font-black text-slate-400 uppercase">kcal</p><p className="text-sm font-black text-slate-900">{Math.round(dayTotals.calories)}</p></div>
             <div className="bg-white p-3 rounded-2xl text-center shadow-sm"><p className="text-[8px] font-black text-slate-400 uppercase">P</p><p className="text-sm font-black text-slate-900">{Math.round(dayTotals.protein)}g</p></div>
             <div className="bg-white p-3 rounded-2xl text-center shadow-sm"><p className="text-[8px] font-black text-slate-400 uppercase">C</p><p className="text-sm font-black text-slate-900">{Math.round(dayTotals.carbs)}g</p></div>
             <div className="bg-white p-3 rounded-2xl text-center shadow-sm"><p className="text-[8px] font-black text-slate-400 uppercase">F</p><p className="text-sm font-black text-slate-900">{Math.round(dayTotals.fats)}g</p></div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {MEAL_TYPES.map((type) => {
          const meal = weeklyPlan?.[selectedDay]?.[type];
          if (!meal) return null;
          return (
            <div key={type} onClick={() => setSelectedRecipe(meal)} className="bg-white p-5 rounded-[2rem] border border-slate-100 hover:shadow-lg transition-all cursor-pointer group relative overflow-hidden">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 bg-orange-50 text-orange-500 rounded-xl flex items-center justify-center"><i className={`fas ${type === 'breakfast' ? 'fa-coffee' : type === 'lunch' ? 'fa-sun' : type === 'dinner' ? 'fa-moon' : 'fa-cookie-bite'}`}></i></div>
                <div><p className="text-[8px] font-black uppercase text-slate-400 mb-1">{type}</p><h4 className="font-black text-slate-900 text-sm leading-tight h-10 line-clamp-2">{meal.name}</h4></div>
              </div>
              <div className="flex justify-between text-[9px] font-black text-slate-500 border-t pt-3"><span>{Math.round(meal.calories)} kcal</span><span className="text-orange-600">{Math.round(meal.protein)}g P</span></div>
            </div>
          );
        })}
      </div>

      {selectedRecipe && (
        <div className="bg-white rounded-[2.5rem] p-8 lg:p-12 border border-slate-100 shadow-xl animate-fade-in">
           <div className="flex justify-between items-center border-b pb-6 mb-6">
             <h3 className="text-2xl font-black">{selectedRecipe.name}</h3>
             <button onClick={() => setSelectedRecipe(null)} className="w-10 h-10 bg-slate-50 rounded-full text-slate-400 flex items-center justify-center"><i className="fas fa-times"></i></button>
           </div>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div><h4 className="text-[10px] font-black text-slate-400 uppercase mb-4 tracking-widest">{t.ingredients}</h4><ul className="space-y-3">{selectedRecipe.ingredients.map((ing, i) => <li key={i} className="text-xs font-bold text-slate-600 flex gap-3 border-b border-slate-50 pb-2"><span className="w-2 h-2 bg-orange-400 rounded-full mt-1.5 flex-shrink-0"></span>{ing}</li>)}</ul></div>
              <div><h4 className="text-[10px] font-black text-slate-400 uppercase mb-4 tracking-widest">{t.instructions}</h4><div className="space-y-5">{selectedRecipe.instructions.map((step, i) => <div key={i} className="flex gap-4"><div className="flex-shrink-0 w-8 h-8 bg-slate-900 text-white rounded-xl flex items-center justify-center text-[11px] font-black">{i+1}</div><p className="text-xs text-slate-600 leading-relaxed pt-1">{step}</p></div>)}</div></div>
           </div>
        </div>
      )}

      {showShoppingList && (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-white rounded-[3rem] w-full max-w-4xl max-h-[90vh] shadow-2xl overflow-hidden flex flex-col animate-scale-in">
            <div className="bg-slate-900 p-8 text-white flex justify-between items-center">
              <div><h3 className="text-2xl font-black uppercase tracking-tight flex items-center gap-3"><i className="fas fa-basket-shopping text-amber-400"></i> {t.shopping}</h3><p className="text-slate-400 text-[10px] font-bold uppercase mt-1">{t.shoppingSub}</p></div>
              <button onClick={() => setShowShoppingList(false)} className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center"><i className="fas fa-times"></i></button>
            </div>
            <div className="flex-grow overflow-y-auto p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {shoppingList.map((ing, i) => (
                <label key={i} className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 cursor-pointer active:bg-slate-200 transition-all">
                  <input type="checkbox" className="w-6 h-6 rounded-lg accent-orange-500" />
                  <div className="flex flex-col"><span className="text-[9px] font-black text-orange-500 uppercase">{ing.amount} {ing.unit}</span><span className="text-sm font-bold text-slate-900">{ing.name}</span></div>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default NutritionTab;
