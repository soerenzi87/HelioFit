
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
  const [activeTab, setActiveTab] = useState<'engine' | 'recipes'>('engine');
  const [showConfig, setShowConfig] = useState(false);
  const [showShoppingList, setShowShoppingList] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
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
    errorNoAnalysis: 'Bitte führe zuerst eine KI-Analyse im Dashboard (Overview) durch, um deine Kalorienziele zu berechnen.',
    favorites: 'Rezepte', weeklyPlan: 'Food Engine', planForWeek: 'Für die Woche einplanen', liked: 'Favorit', activeRecipes: 'Eingeplante Rezepte'
  } : {
    engine: 'Food Engine', configSub: 'Configure algorithm', daysSelect: 'Select days', run: 'Generate Weekly Plan', exception: 'Log Exception', appliances: 'Tools', protein: 'Protein', carbs: 'Carbs', fats: 'Fats', ingredients: 'Ingredients', instructions: 'Instructions', shopping: 'Shopping List', noPlan: 'No plan available', preferred: 'Preferred Ingredients', excluded: 'Excluded (Allergies/Dislikes)', add: 'Add', export: 'Export', varietyTitle: 'Repetition Pattern', shoppingSub: 'Weekly aggregated totals',
    errorNoAnalysis: 'Please perform an AI analysis in the Dashboard (Overview) first to calculate your calorie targets.',
    favorites: 'Recipes', weeklyPlan: 'Food Engine', planForWeek: 'Plan for Week', liked: 'Favorite', activeRecipes: 'Planned Recipes'
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

  const toggleLike = (recipe: Recipe) => {
    if (!profile) return;
    const liked = profile.likedRecipes || [];
    const isLiked = liked.some(r => r.name === recipe.name);
    let newLiked;
    if (isLiked) {
      newLiked = liked.filter(r => r.name !== recipe.name);
    } else {
      newLiked = [...liked, { ...recipe, usageCount: recipe.usageCount || 0 }];
    }
    onUpdateProfile({ ...profile, likedRecipes: newLiked });
  };

  const togglePlanned = (recipe: Recipe) => {
    if (!profile) return;
    const liked = profile.likedRecipes || [];
    const newLiked = liked.map(r => 
      r.name === recipe.name ? { ...r, isPlannedForWeek: !r.isPlannedForWeek } : r
    );
    onUpdateProfile({ ...profile, likedRecipes: newLiked });
  };

  const sortedFavorites = useMemo(() => {
    let list = [...(profile?.likedRecipes || [])];
    if (searchTerm) {
      list = list.filter(r => r.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    return list.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
  }, [profile?.likedRecipes, searchTerm]);

  const plannedRecipes = profile?.likedRecipes?.filter(r => r.isPlannedForWeek) || [];

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center min-h-[500px]">
      <div className="w-20 h-20 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-8 shadow-xl shadow-orange-500/20"></div>
      <p className="font-black uppercase tracking-[0.3em] text-[10px] text-slate-400 animate-pulse">Masterchef Engine...</p>
    </div>
  );

  const renderConfig = () => (
    <div className="bg-[#1a1f26] rounded-[3rem] shadow-2xl p-8 lg:p-12 border border-white/5 space-y-12 animate-fade-in mb-10 overflow-hidden flex flex-col relative">
      <div className="absolute top-0 right-0 p-12 opacity-5 text-9xl pointer-events-none translate-x-4"><i className="fas fa-gears text-white"></i></div>
      
      <div className="flex items-center justify-between shrink-0 relative z-10">
        <div>
          <p className="text-orange-500 text-[10px] font-black uppercase tracking-[0.3em] mb-2">Algorithm Settings</p>
          <h3 className="text-4xl font-black text-white tracking-tighter uppercase">{t.engine}</h3>
        </div>
        {weeklyPlan && (
          <button 
            onClick={() => setShowConfig(false)} 
            className="w-14 h-14 rounded-2xl bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-500 flex items-center justify-center transition-all border border-white/5"
          >
            <i className="fas fa-times text-2xl"></i>
          </button>
        )}
      </div>
      
      <div className="space-y-12 pr-2 custom-scrollbar relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div className="space-y-10">
            <div className="space-y-5">
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{t.daysSelect}</label>
              <div className="flex flex-wrap gap-2.5">
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
                      className={`px-5 py-3 rounded-2xl text-[10px] font-black transition-all border ${isActive ? 'bg-orange-600 border-orange-500 text-white shadow-xl shadow-orange-600/20' : 'bg-slate-800/30 border-white/5 text-slate-400 hover:border-white/10'}`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-5">
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{t.preferred}</label>
              <div className="flex flex-col sm:flex-row gap-3">
                <input 
                  type="text" 
                  value={prefInput} 
                  onChange={e => setPrefInput(e.target.value)} 
                  onKeyDown={e => e.key === 'Enter' && handleAddPref()} 
                  placeholder="z.B. Skyr, Hähnchen..." 
                  className="flex-1 p-5 bg-slate-800/50 rounded-2xl border border-white/5 font-bold text-white outline-none focus:ring-2 focus:ring-orange-500 transition-all placeholder:text-slate-600" 
                />
                <button onClick={handleAddPref} className="w-full sm:w-auto px-8 py-5 bg-white/5 hover:bg-white/10 text-white border border-white/5 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all">{t.add}</button>
              </div>
              <div className="flex flex-wrap gap-2.5">
                {preferredTags.map(tag => (
                  <span key={tag} className="px-4 py-2 bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded-xl text-[10px] font-black flex items-center gap-3">
                    {tag} 
                    <button 
                      onClick={() => {
                        const newTags = preferredTags.filter(t => t !== tag);
                        setPreferredTags(newTags);
                        updatePrefs({ preferredIngredients: newTags });
                      }}
                      className="hover:text-red-400 transition-colors"
                    >
                      <i className="fas fa-times"></i>
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-5">
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{t.excluded}</label>
              <div className="flex flex-col sm:flex-row gap-3">
                <input 
                  type="text" 
                  value={exclInput} 
                  onChange={e => setExclInput(e.target.value)} 
                  onKeyDown={e => e.key === 'Enter' && handleAddExcl()} 
                  placeholder="z.B. Fisch, Koriander..." 
                  className="flex-1 p-5 bg-slate-800/50 rounded-2xl border border-white/5 font-bold text-white outline-none focus:ring-2 focus:ring-red-500 transition-all placeholder:text-slate-600" 
                />
                <button onClick={handleAddExcl} className="w-full sm:w-auto px-8 py-5 bg-white/5 hover:bg-white/10 text-white border border-white/5 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all">{t.add}</button>
              </div>
              <div className="flex flex-wrap gap-2.5">
                {excludedTags.map(tag => (
                  <span key={tag} className="px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl text-[10px] font-black flex items-center gap-3">
                    {tag} 
                    <button 
                      onClick={() => {
                        const newTags = excludedTags.filter(t => t !== tag);
                        setExcludedTags(newTags);
                        updatePrefs({ excludedIngredients: newTags });
                      }}
                      className="hover:text-white transition-colors"
                    >
                      <i className="fas fa-times"></i>
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-10">
            <div className="space-y-5">
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{t.varietyTitle}</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {VARIETY_OPTIONS.map(opt => (
                  <button 
                    key={opt.id} 
                    onClick={() => {
                      const val = opt.id as any;
                      setPlanVariety(val);
                      updatePrefs({ planVariety: val });
                    }} 
                    className={`p-6 rounded-[2.5rem] border transition-all flex flex-col items-center text-center gap-3 ${planVariety === opt.id ? 'bg-orange-600 border-orange-500 text-white shadow-2xl shadow-orange-600/20 scale-[1.03]' : 'bg-slate-800/30 border-white/5 text-slate-500 hover:border-white/10'}`}
                  >
                    <i className={`fas ${opt.icon} text-xl ${planVariety === opt.id ? 'text-white' : 'text-orange-500 opacity-60'}`}></i>
                    <div>
                      <p className="text-[11px] font-black uppercase mb-1 tracking-tight">{opt[language]}</p>
                      <p className={`text-[9px] font-bold uppercase whitespace-nowrap opacity-60`}>{opt.sub}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-5">
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{t.appliances}</label>
              <div className="grid grid-cols-2 gap-4">
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
                      className={`flex items-center gap-5 p-5 rounded-2xl border transition-all ${isActive ? 'bg-slate-800 border-orange-500/50 text-white shadow-xl' : 'bg-slate-800/30 border-white/5 text-slate-500 hover:border-white/10'}`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${isActive ? 'bg-orange-600 text-white' : 'bg-slate-800 text-orange-500/40'}`}>
                        <i className={`fas ${app.icon}`}></i>
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-wider">{app[language]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-8 pt-10 border-t border-white/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-orange-500 text-[10px] font-black uppercase tracking-[0.2em] mb-1">Curation</p>
              <h4 className="text-xl font-black text-white tracking-tighter uppercase">{t.activeRecipes}</h4>
            </div>
            <div className="px-4 py-2 bg-white/5 border border-white/5 rounded-xl text-[10px] font-black text-slate-400 uppercase tracking-widest">{plannedRecipes.length} Active</div>
          </div>
          
          {plannedRecipes.length === 0 ? (
            <div className="p-12 bg-slate-800/20 rounded-[2.5rem] border-2 border-dashed border-white/5 text-center transition-all hover:bg-slate-800/30">
              <i className="fas fa-info-circle text-4xl text-slate-700 mb-4"></i>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest max-w-xs mx-auto leading-relaxed">No recipes selected for manual inclusion. Browse your personal library to add recipes.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {plannedRecipes.map((fav, i) => (
                <div key={i} className="p-6 rounded-[2rem] border bg-gradient-to-br from-orange-600 to-orange-700 border-orange-500 text-white shadow-xl flex items-center justify-between gap-6 transition-transform hover:scale-[1.02]">
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-sm tracking-tight truncate mb-1 uppercase">{fav.name}</p>
                    <div className="flex items-center gap-3 opacity-80 text-[9px] font-black uppercase tracking-wider">
                      <span className="flex items-center gap-1.5"><i className="fas fa-repeat"></i> {fav.usageCount || 0}x</span>
                      <span>•</span>
                      <span className="flex items-center gap-1.5"><i className="fas fa-clock"></i> {fav.prepTime}</span>
                    </div>
                  </div>
                  <button 
                    onClick={() => togglePlanned(fav)} 
                    className="w-12 h-12 rounded-2xl bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-all border border-white/20"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="pt-10 shrink-0 relative z-10">
        <button 
          onClick={handleGenerateClick} 
          className="w-full py-7 bg-orange-600 hover:bg-orange-500 text-white rounded-[2.5rem] font-black text-2xl uppercase tracking-[0.1em] shadow-[0_20px_50px_rgba(234,88,12,0.3)] transition-all active:scale-[0.98] border border-orange-400/20"
        >
          {t.run}
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-8 pb-20 animate-fade-in relative">
      <div className="flex gap-2 p-1.5 bg-slate-800/40 border border-white/5 backdrop-blur-md rounded-2xl w-fit">
        <button 
          onClick={() => setActiveTab('engine')} 
          className={`px-8 py-3 rounded-xl font-black text-xs uppercase transition-all ${activeTab === 'engine' ? 'bg-orange-600 text-white shadow-xl shadow-orange-600/20' : 'text-slate-500 hover:text-slate-300'}`}
        >
          {t.weeklyPlan}
        </button>
        <button 
          onClick={() => setActiveTab('recipes')} 
          className={`px-8 py-3 rounded-xl font-black text-xs uppercase transition-all ${activeTab === 'recipes' ? 'bg-orange-600 text-white shadow-xl shadow-orange-600/20' : 'text-slate-500 hover:text-slate-300'}`}
        >
          {t.favorites}
        </button>
      </div>

      {activeTab === 'engine' ? (
        <div className="space-y-8">
          {!weeklyPlan || showConfig ? (
            renderConfig()
          ) : (
            <div className="space-y-8 animate-fade-in">
              <div className="bg-gradient-to-br from-orange-600 to-orange-700 rounded-[3rem] p-10 text-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 shadow-2xl border border-orange-400/20 relative overflow-hidden">
                 <div className="absolute top-0 right-0 p-10 opacity-10 text-9xl pointer-events-none translate-x-4"><i className="fas fa-utensils"></i></div>
                 <div className="relative z-10">
                   <p className="text-orange-200 text-[10px] font-black uppercase tracking-[0.3em] mb-2">Automated Planning</p>
                   <h3 className="text-4xl font-black tracking-tighter uppercase mb-1">{t.engine}</h3>
                   <p className="text-orange-100 italic text-sm opacity-80 font-medium">{plannedRecipes.length} recipes manually prioritized</p>
                 </div>
                 <button 
                   onClick={() => setShowConfig(true)} 
                   className="relative z-10 px-8 py-4 bg-white/20 hover:bg-white/30 rounded-[2rem] text-[10px] font-black uppercase tracking-widest border border-white/30 transition-all backdrop-blur-md"
                 >
                   <i className="fas fa-sliders mr-2"></i> {t.engine}
                 </button>
              </div>

              <div className="flex flex-col gap-6">
                <div className="flex overflow-x-auto gap-2 p-2 bg-slate-800/40 border border-white/5 rounded-[2rem] w-full no-scrollbar backdrop-blur-sm">
                  {Object.keys(weeklyPlan || {}).sort((a,b) => DAYS_DE.indexOf(a) - DAYS_DE.indexOf(b)).map(day => (
                    <button 
                      key={day} 
                      onClick={() => setSelectedDay(day)} 
                      className={`shrink-0 px-6 py-3.5 rounded-2xl font-black text-[11px] uppercase transition-all whitespace-nowrap ${selectedDay === day ? 'bg-orange-600 text-white shadow-xl shadow-orange-600/20' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      {day}
                    </button>
                  ))}
                  <div className="flex gap-2 ml-auto pr-2">
                    <button 
                      onClick={() => setShowShoppingList(true)} 
                      className="w-12 h-12 rounded-2xl text-slate-400 bg-white/5 border border-white/5 hover:bg-orange-600 hover:text-white transition-all flex items-center justify-center"
                    >
                      <i className="fas fa-shopping-basket"></i>
                    </button>
                  </div>
                </div>
                
                {dayTotals && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                      { label: 'kcal', val: Math.round(dayTotals.calories), color: 'text-white', bg: 'bg-slate-800/50' },
                      { label: 'Protein', val: `${Math.round(dayTotals.protein)}g`, color: 'text-orange-400', bg: 'bg-orange-500/10' },
                      { label: 'Carbs', val: `${Math.round(dayTotals.carbs)}g`, color: 'text-blue-400', bg: 'bg-blue-500/10' },
                      { label: 'Fats', val: `${Math.round(dayTotals.fats)}g`, color: 'text-amber-400', bg: 'bg-amber-500/10' },
                    ].map(stat => (
                      <div key={stat.label} className={`${stat.bg} p-5 rounded-[1.5rem] text-center border border-white/5 shadow-xl transition-transform hover:scale-[1.03]`}>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{stat.label}</p>
                        <p className={`text-xl font-black ${stat.color} tracking-tight`}>{stat.val}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {MEAL_TYPES.map((type) => {
                  const meal = weeklyPlan?.[selectedDay]?.[type];
                  if (!meal) return null;
                  const isLiked = profile?.likedRecipes?.some(r => r.name === meal.name);
                  return (
                    <div 
                      key={type} 
                      className="bg-[#1a1f26] p-6 rounded-[2.5rem] border border-white/5 hover:bg-slate-800/50 hover:border-white/10 hover:shadow-2xl transition-all relative group overflow-hidden cursor-pointer" 
                      onClick={() => setSelectedRecipe(meal)}
                    >
                      <button 
                        onClick={(e) => { e.stopPropagation(); toggleLike(meal); }}
                        className={`absolute top-6 right-6 w-10 h-10 rounded-2xl flex items-center justify-center transition-all z-10 border ${isLiked ? 'bg-red-500/10 border-red-500/20 text-red-500' : 'bg-white/5 border-white/5 text-slate-500 hover:text-red-400'}`}
                      >
                        <i className={`fa${isLiked ? 's' : 'r'} fa-heart text-sm`}></i>
                      </button>
                      <div className="flex items-center gap-4 mb-6">
                        <div className="w-12 h-12 bg-orange-600/10 text-orange-500 rounded-2xl flex items-center justify-center text-xl border border-orange-500/20 shadow-xl"><i className={`fas ${type === 'breakfast' ? 'fa-coffee' : type === 'lunch' ? 'fa-sun' : type === 'dinner' ? 'fa-moon' : 'fa-cookie-bite'}`}></i></div>
                        <div>
                          <p className="text-[9px] font-black uppercase text-slate-500 tracking-widest mb-1">{type}</p>
                          <h4 className="font-black text-white text-base leading-tight group-hover:text-orange-400 transition-colors line-clamp-2 h-11">{meal.name}</h4>
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-[10px] font-black tracking-widest uppercase border-t border-white/5 pt-4">
                        <span className="text-slate-500">{Math.round(meal.calories)} kcal</span>
                        <span className="text-orange-500 flex items-center gap-1.5"><i className="fas fa-dumbbell text-[8px]"></i> {Math.round(meal.protein)}g P</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-10 animate-fade-in">
          <div className="bg-[#1a1f26] rounded-[3rem] p-10 lg:p-14 border border-white/5 shadow-2xl relative overflow-hidden">
             <div className="absolute top-0 right-0 p-14 opacity-5 text-9xl pointer-events-none translate-x-4"><i className="fas fa-book-open text-white"></i></div>
             
             <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-10 mb-14 relative z-10">
               <div>
                 <p className="text-orange-500 text-[10px] font-black uppercase tracking-[0.3em] mb-2">Recipe Vault</p>
                 <h3 className="text-4xl font-black text-white tracking-tighter uppercase">{t.favorites}</h3>
               </div>
               <div className="relative w-full md:w-96 group">
                  <i className="fas fa-search absolute left-6 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-orange-500 transition-colors"></i>
                  <input 
                    type="text" 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)} 
                    placeholder={language === 'de' ? "Rezepte suchen..." : "Search recipes..."}
                    className="w-full pl-14 pr-6 py-5 bg-slate-800/50 border border-white/5 rounded-[2rem] font-bold text-sm text-white outline-none focus:ring-2 focus:ring-orange-500 transition-all placeholder:text-slate-600 shadow-xl"
                  />
               </div>
             </div>
             
             {profile?.likedRecipes?.length === 0 ? (
               <div className="h-60 w-full flex flex-col items-center justify-center text-slate-600 gap-6">
                 <i className="far fa-heart text-6xl opacity-10 text-orange-500"></i>
                 <p className="italic font-bold text-lg tracking-tight">No recipes in your vault yet.</p>
               </div>
             ) : sortedFavorites.length === 0 ? (
               <div className="h-60 w-full flex flex-col items-center justify-center text-slate-600 gap-6">
                 <i className="fas fa-search text-6xl opacity-10 text-orange-500"></i>
                 <p className="italic font-bold text-lg tracking-tight">No matching recipes found for "{searchTerm}".</p>
               </div>
             ) : (
               <div className="flex flex-col gap-4 relative z-10">
                 {sortedFavorites.map((fav, i) => (
                   <div 
                    key={i} 
                    className={`bg-slate-800/30 hover:bg-slate-800/60 p-5 rounded-[2.5rem] border transition-all flex items-center gap-6 group cursor-pointer ${fav.isPlannedForWeek ? 'border-orange-500/40 bg-orange-500/5' : 'border-white/5'}`} 
                    onClick={() => setSelectedRecipe(fav)}
                   >
                     <div className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center flex-shrink-0 text-2xl transition-all ${fav.isPlannedForWeek ? 'bg-orange-600 text-white shadow-xl shadow-orange-600/20' : 'bg-slate-700 text-slate-400 group-hover:bg-slate-900 group-hover:text-white'}`}>
                        <i className="fas fa-utensils"></i>
                     </div>
                     
                     <div className="flex-1 min-w-0">
                       <h4 className="font-black text-white text-lg truncate uppercase tracking-tight group-hover:text-orange-400 transition-colors">{fav.name}</h4>
                       <div className="flex flex-wrap items-center gap-6 mt-2">
                         <div className="flex items-center gap-2">
                           <span className="w-2 h-2 bg-orange-500 rounded-full shadow-[0_0_8px_rgba(249,115,22,0.8)]"></span>
                           <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{Math.round(fav.calories || 0)} kcal</span>
                         </div>
                         <div className="flex items-center gap-2">
                           <span className="w-2 h-2 bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.8)]"></span>
                           <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{Math.round(fav.protein || 0)}g P</span>
                         </div>
                         <div className="flex items-center gap-2">
                           <span className="w-2 h-2 bg-slate-600 rounded-full"></span>
                           <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">{fav.usageCount || 0}x Used</span>
                         </div>
                       </div>
                     </div>

                     <div className="flex items-center gap-3">
                        <button 
                          onClick={(e) => { e.stopPropagation(); togglePlanned(fav); }} 
                          className={`h-14 px-8 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-3 ${fav.isPlannedForWeek ? 'bg-orange-600 text-white shadow-xl shadow-orange-600/20' : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/5'}`}
                        >
                          <i className={`fas ${fav.isPlannedForWeek ? 'fa-check text-base' : 'fa-calendar-plus'}`}></i>
                          <span className="hidden sm:inline">{fav.isPlannedForWeek ? 'Planned' : t.planForWeek}</span>
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); toggleLike(fav); }} 
                          className="w-14 h-14 rounded-2xl bg-[#1a1f26] text-red-500 shadow-xl flex items-center justify-center border border-white/5 hover:bg-red-500/10 transition-all active:scale-95"
                        >
                          <i className="fas fa-heart text-xl"></i>
                        </button>
                     </div>
                   </div>
                 ))}
               </div>
             )}
          </div>
        </div>
      )}

      {selectedRecipe && (
        <div className="fixed inset-0 z-[250] bg-[#0f172a]/80 backdrop-blur-xl flex items-center justify-center p-6 animate-fade-in transition-all">
          <div className="bg-[#1a1f26] rounded-[3.5rem] p-10 lg:p-14 border border-white/10 shadow-[0_0_100px_rgba(0,0,0,0.5)] animate-scale-in max-w-5xl w-full max-h-[90vh] overflow-y-auto custom-scrollbar text-white">
             <div className="flex justify-between items-start border-b border-white/5 pb-10 mb-10">
               <div>
                  <p className="text-orange-500 text-[10px] font-black uppercase tracking-[0.3em] mb-2">Recipe Details</p>
                  <h3 className="text-4xl font-black uppercase tracking-tighter leading-none">{selectedRecipe.name}</h3>
               </div>
               <button 
                 onClick={() => setSelectedRecipe(null)} 
                 className="w-14 h-14 bg-white/5 hover:bg-red-500/20 rounded-2xl text-slate-400 hover:text-red-500 flex items-center justify-center transition-all border border-white/5"
               >
                 <i className="fas fa-times text-2xl"></i>
               </button>
             </div>
             <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                <div className="lg:col-span-5 space-y-10">
                  <div className="p-8 bg-slate-800/50 rounded-[2.5rem] border border-white/5 flex flex-wrap gap-8 justify-between">
                     <div className="text-center"><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Calories</p><p className="text-2xl font-black text-white">{Math.round(selectedRecipe.calories || 0)}</p></div>
                     <div className="text-center"><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Protein</p><p className="text-2xl font-black text-orange-400">{Math.round(selectedRecipe.protein || 0)}g</p></div>
                     <div className="text-center"><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Time</p><p className="text-2xl font-black text-blue-400">{selectedRecipe.prepTime}</p></div>
                  </div>
                  <div>
                    <h4 className="text-[11px] font-black text-slate-400 uppercase mb-6 tracking-[0.2em] flex items-center gap-3"><i className="fas fa-list-check text-orange-500"></i> {t.ingredients}</h4>
                    <ul className="space-y-4">
                      {(selectedRecipe.ingredients || []).map((ing, i) => (
                        <li key={i} className="text-sm font-bold text-slate-300 flex items-center gap-4 group p-1 transition-colors hover:text-white">
                          <span className="w-1.5 h-1.5 bg-orange-600 rounded-full shadow-[0_0_8px_rgba(234,88,12,0.6)] flex-shrink-0"></span>
                          {ing}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="lg:col-span-7">
                  <h4 className="text-[11px] font-black text-slate-400 uppercase mb-6 tracking-[0.2em] flex items-center gap-3"><i className="fas fa-fire-burner text-orange-500"></i> {t.instructions}</h4>
                  <div className="space-y-8">
                    {(selectedRecipe.instructions || []).map((step, i) => (
                      <div key={i} className="flex gap-6 group">
                        <div className="flex-shrink-0 w-10 h-10 bg-slate-800 text-white border border-white/10 rounded-2xl flex items-center justify-center text-sm font-black shadow-xl group-hover:bg-orange-600 transition-all">{i+1}</div>
                        <p className="text-sm text-slate-300 font-medium leading-relaxed pt-2 group-hover:text-white transition-colors">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>
             </div>
          </div>
        </div>
      )}

      {showShoppingList && (
        <div className="fixed inset-0 z-[300] bg-[#0f172a]/80 backdrop-blur-xl flex items-center justify-center p-6 animate-fade-in transition-all">
          <div className="bg-[#1a1f26] rounded-[3.5rem] w-full max-w-5xl max-h-[90vh] shadow-[0_0_100px_rgba(0,0,0,0.5)] border border-white/10 overflow-hidden flex flex-col animate-scale-in text-white">
            <div className="bg-[#0f172a] p-10 lg:p-14 border-b border-white/5 flex justify-between items-center relative overflow-hidden">
              <div className="absolute top-0 right-0 p-14 opacity-5 text-9xl pointer-events-none translate-x-4"><i className="fas fa-cart-shopping text-white"></i></div>
              <div className="relative z-10">
                <p className="text-orange-500 text-[10px] font-black uppercase tracking-[0.3em] mb-2">Groceries</p>
                <h3 className="text-4xl font-black uppercase tracking-tighter flex items-center gap-4">{t.shopping}</h3>
              </div>
              <button 
                onClick={() => setShowShoppingList(false)} 
                className="relative z-10 w-14 h-14 bg-white/5 hover:bg-white/10 rounded-2xl flex items-center justify-center transition-all border border-white/10 shadow-xl"
              >
                <i className="fas fa-times text-2xl"></i>
              </button>
            </div>
            <div className="flex-grow overflow-y-auto p-10 lg:p-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 no-scrollbar bg-slate-900/40">
              {shoppingList.map((ing, i) => (
                <label 
                  key={i} 
                  className="flex items-center gap-5 p-6 bg-slate-800/40 rounded-[2rem] border border-white/5 cursor-pointer hover:bg-slate-800/80 hover:border-white/10 transition-all group"
                >
                  <div className="relative">
                    <input type="checkbox" className="peer w-8 h-8 rounded-xl border-2 border-white/10 bg-transparent checked:bg-orange-600 checked:border-orange-500 appearance-none transition-all cursor-pointer" />
                    <i className="fas fa-check absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white text-xs opacity-0 peer-checked:opacity-100 pointer-events-none"></i>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest mb-1 group-peer-checked:line-through opacity-80">{ing.amount} {ing.unit}</span>
                    <span className="text-base font-black text-white tracking-tight group-peer-checked:opacity-40 group-peer-checked:line-through transition-all">{ing.name}</span>
                  </div>
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
