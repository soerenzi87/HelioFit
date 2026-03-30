
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { WeeklyMealPlan, DailyMealPlan, Recipe, NutritionPreferences, Language, UserProfile } from '../types';
import { adjustDailyPlanAfterException, estimateRecipeNutrition, estimateAdditionalFood, AdditionalFoodEstimate } from '../services/geminiService';
import { exportMealPlanToICS } from '../services/calendarService';
import { apiFetch } from '../services/apiFetch';
import { APPLIANCES_BASE, VARIETY_OPTIONS, DAYS_DE, SHORT_DAYS_DE, MEAL_TYPES, AggregatedIngredient, getTodayDE } from './nutrition/nutritionHelpers';
import { getNutritionTranslations } from './nutrition/nutritionTranslations';
import NutritionHistory from './nutrition/NutritionHistory';
import NutritionModals from './nutrition/NutritionModals';

interface NutritionTabProps {
  weeklyPlan: WeeklyMealPlan | null;
  onGeneratePlan: (prefs: NutritionPreferences, modification?: string) => void;
  onUpdateWeeklyPlan: (day: string, dailyPlan: DailyMealPlan) => void;
  onCompleteWeek: () => void;
  isLoading: boolean;
  language: Language;
  profile: UserProfile | null;
  targets: any;
  onUpdateProfile: (updated: UserProfile) => void;
}

// Constants, helpers, and translations imported from nutrition/ sub-modules

const NutritionTab: React.FC<NutritionTabProps> = ({ weeklyPlan, onGeneratePlan, onUpdateWeeklyPlan, onCompleteWeek, isLoading, language, profile, targets, onUpdateProfile }) => {
  // Auto-select today if a meal plan exists for today
  const todayDE = getTodayDE();
  const initialDay = weeklyPlan && weeklyPlan[todayDE] ? todayDE : DAYS_DE[0];
  const [selectedDay, setSelectedDay] = useState<string>(initialDay);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [activeTab, setActiveTab] = useState<'engine' | 'recipes' | 'history'>('engine');
  const [showConfig, setShowConfig] = useState(false);

  // Track eaten meals: key = "day|mealType", value = ISO date string when eaten
  const [eatenMeals, setEatenMeals] = useState<Record<string, string>>(() => {
    return profile?.eatenMeals || {};
  });

  // Auto-select today when weeklyPlan loads/changes and today exists in the plan
  const hasAutoSelectedRef = useRef(false);
  useEffect(() => {
    if (weeklyPlan && weeklyPlan[todayDE] && !hasAutoSelectedRef.current) {
      setSelectedDay(todayDE);
      hasAutoSelectedRef.current = true;
    }
  }, [weeklyPlan, todayDE]);

  // Sync eatenMeals from profile
  useEffect(() => {
    if (profile?.eatenMeals) {
      setEatenMeals(prev => {
        const incoming = profile.eatenMeals!;
        return JSON.stringify(prev) !== JSON.stringify(incoming) ? incoming : prev;
      });
    }
  }, [profile?.eatenMeals]);

  const toggleMealEaten = (day: string, mealType: string) => {
    const key = `${day}|${mealType}`;
    setEatenMeals(prev => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
      } else {
        next[key] = new Date().toISOString();
      }
      // Persist to profile
      if (profile) {
        const updatedProfile = { ...profile, eatenMeals: next };
        onUpdateProfile(updatedProfile);
      }
      return next;
    });
  };

  const isMealEaten = (day: string, mealType: string): boolean => {
    return !!eatenMeals[`${day}|${mealType}`];
  };
  const [showShoppingList, setShowShoppingList] = useState(false);
  const [showFoodPrep, setShowFoodPrep] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [preferredTags, setPreferredTags] = useState<string[]>(profile?.nutritionPreferences?.preferredIngredients || []);
  const [excludedTags, setExcludedTags] = useState<string[]>(profile?.nutritionPreferences?.excludedIngredients || []);
  const [selectedAppliances, setSelectedAppliances] = useState<string[]>(profile?.nutritionPreferences?.appliances || ['stove', 'oven']);
  const [selectedDays, setSelectedDays] = useState<string[]>(profile?.nutritionPreferences?.days || ['Montag', 'Mittwoch', 'Freitag']);
  const [planVariety, setPlanVariety] = useState<'SAME_EVERY_DAY' | 'TWO_DAY_ROTATION' | 'DAILY_VARIETY'>(profile?.nutritionPreferences?.planVariety || 'DAILY_VARIETY');

  // Sync local state when profile changes from outside (reload, server sync, other tab)
  useEffect(() => {
    const prefs = profile?.nutritionPreferences;
    if (prefs) {
      setPreferredTags(prev => {
        const saved = prefs.preferredIngredients || [];
        return JSON.stringify(prev) !== JSON.stringify(saved) ? saved : prev;
      });
      setExcludedTags(prev => {
        const saved = prefs.excludedIngredients || [];
        return JSON.stringify(prev) !== JSON.stringify(saved) ? saved : prev;
      });
      setSelectedAppliances(prev => {
        const saved = prefs.appliances || ['stove', 'oven'];
        return JSON.stringify(prev) !== JSON.stringify(saved) ? saved : prev;
      });
      setSelectedDays(prev => {
        const saved = prefs.days || ['Montag', 'Mittwoch', 'Freitag'];
        return JSON.stringify(prev) !== JSON.stringify(saved) ? saved : prev;
      });
      if (prefs.planVariety) setPlanVariety(prefs.planVariety);
    }
  }, [profile?.nutritionPreferences]);
  
  const [prefInput, setPrefInput] = useState('');
  const [exclInput, setExclInput] = useState('');
  const [exceptionInput, setExceptionInput] = useState<{meal: string, text: string} | null>(null);
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [showModifyPlan, setShowModifyPlan] = useState(false);
  const [modifyPlanText, setModifyPlanText] = useState('');
  // Draft mode: AI generates a proposal, user confirms or discards
  const [draftMeal, setDraftMeal] = useState<{day: string, mealType: string, recipe: Recipe} | null>(null);

  // Per-day additional food log: key = day name, value = { text, estimate }
  const [additionalFood, setAdditionalFood] = useState<Record<string, { text: string; estimate?: AdditionalFoodEstimate }>>(() => {
    return profile?.additionalFood || {};
  });
  const [additionalFoodInput, setAdditionalFoodInput] = useState('');
  const [additionalFoodDraft, setAdditionalFoodDraft] = useState<{ day: string; estimate: AdditionalFoodEstimate } | null>(null);
  const [isEstimatingFood, setIsEstimatingFood] = useState(false);

  // Sync additionalFood from profile
  useEffect(() => {
    if (profile?.additionalFood) {
      setAdditionalFood(prev => {
        const incoming = profile.additionalFood!;
        return JSON.stringify(prev) !== JSON.stringify(incoming) ? incoming : prev;
      });
    }
  }, [profile?.additionalFood]);

  // Sync replacedMeals from profile
  useEffect(() => {
    if (profile?.replacedMeals) {
      setReplacedMeals(prev => {
        const incoming = profile.replacedMeals!;
        return JSON.stringify(prev) !== JSON.stringify(incoming) ? incoming : prev;
      });
    }
  }, [profile?.replacedMeals]);

  // Pre-fill input from saved data when switching days
  useEffect(() => {
    setAdditionalFoodInput(additionalFood[selectedDay]?.text || '');
  }, [selectedDay]);

  const handleEstimateAdditionalFood = async () => {
    if (!profile || !additionalFoodInput.trim()) return;
    setIsEstimatingFood(true);
    try {
      const currentDayPlan = weeklyPlan?.[selectedDay];
      const remainingMealTypes = MEAL_TYPES
        .filter(t => currentDayPlan?.[t] && !isMealEaten(selectedDay, t))
        .map(t => t as string);
      const estimate = await estimateAdditionalFood(
        profile, targets, additionalFoodInput, currentDayPlan, remainingMealTypes, language
      );
      setAdditionalFoodDraft({ day: selectedDay, estimate });
    } catch (e) {
      console.error('Food estimation failed:', e);
      alert(language === 'de' ? 'Schätzung fehlgeschlagen. Versuche es erneut.' : 'Estimation failed. Please try again.');
    } finally {
      setIsEstimatingFood(false);
    }
  };

  // Track which meals were replaced by the AI chat (day|mealType -> old recipe)
  const [replacedMeals, setReplacedMeals] = useState<Record<string, Recipe>>(() => {
    return profile?.replacedMeals || {};
  });

  const acceptAdditionalFoodDraft = () => {
    if (!additionalFoodDraft) return;
    const { day, estimate } = additionalFoodDraft;

    const hasAdjustedMeals = estimate.adjustedMeals && Object.keys(estimate.adjustedMeals).length > 0;

    if (hasAdjustedMeals && weeklyPlan?.[day]) {
      // ── REPLAN MODE: AI adjusted existing meals + added new food as a meal ──
      const currentDay = weeklyPlan[day];
      const updatedDay = { ...currentDay };
      const newReplaced = { ...replacedMeals };

      // Find which meal slot the new food should go into
      // Use the first item's type hint, or infer from context
      const newFoodItem = estimate.items[0];
      let targetSlot: string | null = null;

      // Check if any adjusted meal has a DIFFERENT name than the current plan → that slot was changed
      for (const [mealType, adjustedMeal] of Object.entries(estimate.adjustedMeals) as [string, any][]) {
        if (!adjustedMeal) continue;
        const currentMeal = currentDay[mealType as keyof DailyMealPlan] as Recipe | undefined;
        if (currentMeal && currentMeal.name !== adjustedMeal.name) {
          // This meal was changed → save old as replaced, put new in plan
          newReplaced[`${day}|${mealType}`] = currentMeal;
        }
        // Apply the adjusted meal to the plan
        (updatedDay as any)[mealType] = adjustedMeal;
      }

      // Put the additional food item into the plan as a meal
      // Find the best slot: prefer dinner for evening food, or the slot most closely matching
      const mealSlotPriority = ['dinner', 'lunch', 'snack', 'breakfast'];
      for (const slot of mealSlotPriority) {
        const currentMeal = currentDay[slot as keyof DailyMealPlan] as Recipe | undefined;
        // If the slot's current meal was NOT in adjustedMeals, it's a candidate for the new food
        if (currentMeal && !(estimate.adjustedMeals as any)[slot]) {
          targetSlot = slot;
          break;
        }
      }

      if (targetSlot && newFoodItem) {
        const currentMeal = currentDay[targetSlot as keyof DailyMealPlan] as Recipe | undefined;
        if (currentMeal) {
          newReplaced[`${day}|${targetSlot}`] = currentMeal;
        }
        (updatedDay as any)[targetSlot] = {
          name: newFoodItem.name,
          ingredients: [],
          instructions: [],
          calories: newFoodItem.calories,
          protein: newFoodItem.protein,
          carbs: newFoodItem.carbs,
          fats: newFoodItem.fats,
          prepTime: '-',
          requiredAppliances: [],
        } as Recipe;
      }

      setReplacedMeals(newReplaced);
      onUpdateWeeklyPlan(day, updatedDay);

      // Clear eaten status for replaced slots & persist replacedMeals
      const eatenNext = { ...eatenMeals };
      for (const key of Object.keys(newReplaced)) {
        if (key.startsWith(`${day}|`) && eatenNext[key]) {
          delete eatenNext[key];
        }
      }
      setEatenMeals(eatenNext);
      if (profile) onUpdateProfile({ ...profile, eatenMeals: eatenNext, replacedMeals: newReplaced });
    } else {
      // ── ADD MODE: Just extra food, no meal replacements ──
      const next = { ...additionalFood, [day]: { text: additionalFoodInput, estimate } };
      setAdditionalFood(next);
      if (profile) {
        onUpdateProfile({ ...profile, additionalFood: next });
      }
    }

    setAdditionalFoodDraft(null);
    setAdditionalFoodInput('');
  };

  const discardAdditionalFoodDraft = () => {
    setAdditionalFoodDraft(null);
  };

  // Handle AI meal adjustment — generates a DRAFT first
  const handleMealAdjust = async (day: string, mealType: string, instruction: string) => {
    if (!profile || !weeklyPlan || !instruction.trim()) return;
    setIsAdjusting(true);
    try {
      const currentDay = weeklyPlan[day];
      if (!currentDay) return;
      const remainingMeals = MEAL_TYPES.filter(t => t !== mealType && currentDay[t]).map(t => t);
      const adjusted = await adjustDailyPlanAfterException(
        profile, targets,
        `Ändere ${mealType} (${currentDay[mealType]?.name}): ${instruction}`,
        remainingMeals, language
      );
      // Show as draft instead of applying immediately
      const newRecipe = adjusted[mealType] || Object.values(adjusted)[0];
      if (newRecipe) {
        setDraftMeal({ day, mealType, recipe: newRecipe as Recipe });
      }
      setExceptionInput(null);
    } catch (e) {
      console.error('Meal adjustment failed:', e);
      alert(language === 'de' ? 'Anpassung fehlgeschlagen. Versuche es erneut.' : 'Adjustment failed. Please try again.');
    } finally {
      setIsAdjusting(false);
    }
  };

  const acceptDraft = () => {
    if (!draftMeal || !weeklyPlan) return;
    const currentDay = weeklyPlan[draftMeal.day];
    if (!currentDay) return;
    const updatedDay = { ...currentDay, [draftMeal.mealType]: draftMeal.recipe };
    onUpdateWeeklyPlan(draftMeal.day, updatedDay);
    // Reset eaten status for this slot since it's a new recipe
    const key = `${draftMeal.day}|${draftMeal.mealType}`;
    setEatenMeals(prev => {
      const next = { ...prev };
      delete next[key];
      if (profile) onUpdateProfile({ ...profile, eatenMeals: next });
      return next;
    });
    setDraftMeal(null);
  };

  const discardDraft = () => {
    setDraftMeal(null);
  };

  // Manual recipe creation
  const [showCreateRecipe, setShowCreateRecipe] = useState(false);
  const [newRecipeName, setNewRecipeName] = useState('');
  const [newRecipeIngredients, setNewRecipeIngredients] = useState<string[]>([]);
  const [newIngInput, setNewIngInput] = useState('');
  const [newRecipePrepTime, setNewRecipePrepTime] = useState('15 min');
  const [newRecipeMealType, setNewRecipeMealType] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('lunch');
  const [isEstimatingNutrition, setIsEstimatingNutrition] = useState(false);

  // Persist nutrition preferences — writes directly to profile AND triggers immediate server save
  const updatePrefs = (updates: Partial<NutritionPreferences>) => {
    if (!profile) return;
    // Build the FULL preferences object using the LATEST values from the updates
    // and falling back to current local state for unchanged fields
    const newPrefs: NutritionPreferences = {
      preferredIngredients: updates.preferredIngredients ?? preferredTags,
      excludedIngredients: updates.excludedIngredients ?? excludedTags,
      appliances: updates.appliances ?? selectedAppliances,
      days: updates.days ?? selectedDays,
      planVariety: updates.planVariety ?? planVariety,
    };
    const updatedProfile = {
      ...profile,
      nutritionPreferences: newPrefs
    };
    // 1. Update React state (for immediate UI feedback + db save via useEffect)
    onUpdateProfile(updatedProfile);
    // 2. ALSO save directly to server as a safety net (belt + suspenders approach)
    //    This ensures preferences survive even if the useEffect chain fails
    try {
      const dbKey = profile.email || profile.name;
      apiFetch('/api/db/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userKey: dbKey, nutritionPreferences: newPrefs })
      }).catch(e => console.warn('Direct pref save failed (will retry via db sync):', e));
    } catch (e) { /* ignore — the useEffect chain is the fallback */ }
  };

  const t = getNutritionTranslations(language);

  const dayTotals = useMemo(() => {
    if (!weeklyPlan || !weeklyPlan[selectedDay]) return null;
    const plan = weeklyPlan[selectedDay];
    const total = { calories: 0, protein: 0, carbs: 0, fats: 0 };
    const consumed = { calories: 0, protein: 0, carbs: 0, fats: 0 };
    MEAL_TYPES.forEach(type => {
      const meal = plan[type];
      if (!meal) return;
      total.calories += meal.calories || 0;
      total.protein += meal.protein || 0;
      total.carbs += meal.carbs || 0;
      total.fats += meal.fats || 0;
      if (isMealEaten(selectedDay, type)) {
        consumed.calories += meal.calories || 0;
        consumed.protein += meal.protein || 0;
        consumed.carbs += meal.carbs || 0;
        consumed.fats += meal.fats || 0;
      }
    });
    // Add additional food estimate to consumed totals
    const addFood = additionalFood[selectedDay]?.estimate;
    if (addFood) {
      consumed.calories += addFood.totalCalories || 0;
      consumed.protein += addFood.totalProtein || 0;
      consumed.carbs += addFood.totalCarbs || 0;
      consumed.fats += addFood.totalFats || 0;
      total.calories += addFood.totalCalories || 0;
      total.protein += addFood.totalProtein || 0;
      total.carbs += addFood.totalCarbs || 0;
      total.fats += addFood.totalFats || 0;
    }
    const eatenCount = MEAL_TYPES.filter(t => plan[t] && isMealEaten(selectedDay, t)).length;
    const totalCount = MEAL_TYPES.filter(t => plan[t]).length;
    const hasAdditional = !!addFood;
    return { total, consumed, eatenCount, totalCount, hasAdditional };
  }, [weeklyPlan, selectedDay, eatenMeals, additionalFood]);

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

  const toggleLike = (recipe: Recipe, skipConfirm?: boolean) => {
    if (!profile) return;
    const liked = profile.likedRecipes || [];
    const isLiked = liked.some(r => r.name === recipe.name);
    if (isLiked && !skipConfirm) {
      if (!window.confirm(language === 'de' ? `"${recipe.name}" wirklich löschen?` : `Delete "${recipe.name}"?`)) return;
    }
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

  const handleCreateRecipe = async () => {
    if (!newRecipeName.trim() || newRecipeIngredients.length === 0 || !profile) return;
    setIsEstimatingNutrition(true);
    try {
      const nutrition = await estimateRecipeNutrition(newRecipeName, newRecipeIngredients, language, profile);
      const newRecipe: Recipe = {
        name: newRecipeName.trim(),
        ingredients: newRecipeIngredients,
        instructions: nutrition.instructions || [],
        calories: nutrition.calories,
        protein: nutrition.protein,
        carbs: nutrition.carbs,
        fats: nutrition.fats,
        prepTime: newRecipePrepTime,
        requiredAppliances: [],
        usageCount: 0,
        isPlannedForWeek: false,
        mealType: newRecipeMealType,
      };
      const liked = [...(profile.likedRecipes || []), newRecipe];
      onUpdateProfile({ ...profile, likedRecipes: liked });
      // Reset form
      setNewRecipeName('');
      setNewRecipeIngredients([]);
      setNewIngInput('');
      setNewRecipePrepTime('15 min');
      setNewRecipeMealType('lunch');
      setShowCreateRecipe(false);
    } catch (e: any) {
      console.error('Failed to estimate nutrition:', e);
      const detail = e?.message || String(e);
      alert(language === 'de'
        ? `Nährwertberechnung fehlgeschlagen:\n${detail}`
        : `Nutrition estimation failed:\n${detail}`);
    } finally {
      setIsEstimatingNutrition(false);
    }
  };

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center min-h-[500px]">
      <div className="w-20 h-20 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-8 shadow-xl shadow-orange-500/20"></div>
      <p className="font-black uppercase tracking-[0.3em] text-[10px] text-slate-400 animate-pulse">Masterchef Engine...</p>
    </div>
  );

  const renderConfig = () => (
    <div className="bg-[#1a1f26] rounded-[1.5rem] sm:rounded-[3rem] shadow-2xl p-5 sm:p-8 lg:p-12 border border-white/5 space-y-12 animate-fade-in mb-10 overflow-hidden flex flex-col relative">
      <div className="absolute top-0 right-0 p-12 opacity-5 text-9xl pointer-events-none translate-x-4"><i className="fas fa-gears text-white"></i></div>
      
      <div className="flex items-center justify-between shrink-0 relative z-10">
        <div>
          <p className="text-orange-500 text-[10px] font-black uppercase tracking-[0.3em] mb-2">Algorithm Settings</p>
          <h3 className="text-2xl sm:text-4xl font-black text-white tracking-tighter uppercase">{t.engine}</h3>
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
      
      <div className="space-y-6 sm:space-y-12 pr-2 custom-scrollbar relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-12">
          <div className="space-y-6 sm:space-y-10">
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
                  placeholder={language === 'de' ? "z.B. Skyr, Hähnchen..." : "e.g. Skyr, chicken..."}
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
                  placeholder={language === 'de' ? "z.B. Fisch, Koriander..." : "e.g. Fish, cilantro..."}
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

          <div className="space-y-6 sm:space-y-10">
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

        <div className="space-y-8 pt-6 sm:pt-10 border-t border-white/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-orange-500 text-[10px] font-black uppercase tracking-[0.2em] mb-1">Curation</p>
              <h4 className="text-xl font-black text-white tracking-tighter uppercase">{t.activeRecipes}</h4>
            </div>
            <div className="px-4 py-2 bg-white/5 border border-white/5 rounded-xl text-[10px] font-black text-slate-400 uppercase tracking-widest">{plannedRecipes.length} Active</div>
          </div>
          
          {plannedRecipes.length === 0 ? (
            <div className="p-6 sm:p-12 bg-slate-800/20 rounded-[1.5rem] sm:rounded-[2.5rem] border-2 border-dashed border-white/5 text-center transition-all hover:bg-slate-800/30">
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

      <div className="pt-6 sm:pt-10 shrink-0 relative z-10">
        <button 
          onClick={handleGenerateClick} 
          className="w-full py-5 sm:py-7 bg-orange-600 hover:bg-orange-500 text-white rounded-[2.5rem] font-black text-lg sm:text-2xl uppercase tracking-[0.1em] shadow-[0_20px_50px_rgba(234,88,12,0.3)] transition-all active:scale-[0.98] border border-orange-400/20"
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
          className={`px-4 sm:px-8 py-3 rounded-xl font-black text-xs uppercase transition-all ${activeTab === 'engine' ? 'bg-orange-600 text-white shadow-xl shadow-orange-600/20' : 'text-slate-500 hover:text-slate-300'}`}
        >
          {t.weeklyPlan}
        </button>
        <button
          onClick={() => setActiveTab('recipes')}
          className={`px-4 sm:px-8 py-3 rounded-xl font-black text-xs uppercase transition-all ${activeTab === 'recipes' ? 'bg-orange-600 text-white shadow-xl shadow-orange-600/20' : 'text-slate-500 hover:text-slate-300'}`}
        >
          {t.favorites}
        </button>
        {(profile?.nutritionHistory?.length || 0) > 0 && (
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 sm:px-8 py-3 rounded-xl font-black text-xs uppercase transition-all ${activeTab === 'history' ? 'bg-orange-600 text-white shadow-xl shadow-orange-600/20' : 'text-slate-500 hover:text-slate-300'}`}
          >
            {language === 'de' ? 'Historie' : 'History'}
          </button>
        )}
      </div>

      {activeTab === 'engine' && (
        <div className="space-y-8">
          {!weeklyPlan || showConfig ? (
            renderConfig()
          ) : (
            <div className="space-y-8 animate-fade-in">
              <div className="bg-gradient-to-br from-orange-600 to-orange-700 rounded-[1.5rem] sm:rounded-[3rem] p-5 sm:p-10 text-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 shadow-2xl border border-orange-400/20 relative overflow-hidden">
                 <div className="absolute top-0 right-0 p-10 opacity-10 text-9xl pointer-events-none translate-x-4"><i className="fas fa-utensils"></i></div>
                 <div className="relative z-10">
                   <p className="text-orange-200 text-[10px] font-black uppercase tracking-[0.3em] mb-2">Automated Planning</p>
                   <h3 className="text-2xl sm:text-4xl font-black tracking-tighter uppercase mb-1">{t.engine}</h3>
                   <p className="text-orange-100 italic text-sm opacity-80 font-medium">{plannedRecipes.length} recipes manually prioritized</p>
                 </div>
                 <div className="relative z-10 flex flex-wrap gap-2 sm:gap-3 w-full sm:w-auto">
                   <button
                     onClick={onCompleteWeek}
                     className="px-4 sm:px-8 py-2.5 sm:py-4 bg-white/20 hover:bg-white/30 rounded-xl sm:rounded-[2rem] text-[9px] sm:text-[10px] font-black uppercase tracking-widest border border-white/30 transition-all backdrop-blur-md flex items-center justify-center gap-2"
                   >
                     <i className="fas fa-flag-checkered"></i> {language === 'de' ? 'Woche abschließen' : 'Complete Week'}
                   </button>
                   <button
                     onClick={() => setShowFoodPrep(true)}
                     className="px-4 sm:px-8 py-2.5 sm:py-4 bg-white/20 hover:bg-white/30 rounded-xl sm:rounded-[2rem] text-[9px] sm:text-[10px] font-black uppercase tracking-widest border border-white/30 transition-all backdrop-blur-md flex items-center justify-center gap-2"
                   >
                     <i className="fas fa-kitchen-set"></i> Meal Prep
                   </button>
                   <button
                     onClick={() => setShowModifyPlan(!showModifyPlan)}
                     className={`px-4 sm:px-8 py-2.5 sm:py-4 ${showModifyPlan ? 'bg-white/40 shadow-inner' : 'bg-white/20 hover:bg-white/30'} rounded-xl sm:rounded-[2rem] text-[9px] sm:text-[10px] font-black uppercase tracking-widest border border-white/30 transition-all backdrop-blur-md flex items-center justify-center gap-2`}
                   >
                     <i className="fas fa-pen-to-square"></i> {language === 'de' ? 'Plan anpassen' : 'Modify Plan'}
                   </button>
                   <button
                     onClick={() => setShowConfig(true)}
                     className="px-4 sm:px-8 py-2.5 sm:py-4 bg-white/20 hover:bg-white/30 rounded-xl sm:rounded-[2rem] text-[9px] sm:text-[10px] font-black uppercase tracking-widest border border-white/30 transition-all backdrop-blur-md flex items-center justify-center gap-2"
                   >
                     <i className="fas fa-sliders"></i> {language === 'de' ? 'Engine öffnen' : 'Open Engine'}
                   </button>
                 </div>
              </div>

              {showModifyPlan && (
                <div className="bg-[#1a1f26] rounded-[2rem] p-6 sm:p-8 border border-orange-500/20 shadow-xl space-y-4 animate-fade-in">
                  <textarea
                    value={modifyPlanText}
                    onChange={e => setModifyPlanText(e.target.value)}
                    placeholder={language === 'de' ? 'Beschreibe deine Änderungswünsche... z.B. "Mehr vegane Gerichte", "Kein Fisch", "Mehr Protein zum Frühstück"' : 'Describe your changes... e.g. "More vegan meals", "No fish", "More protein at breakfast"'}
                    className="w-full min-h-[100px] rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-sm text-white outline-none focus:border-orange-500 placeholder:text-slate-600 resize-none"
                  />
                  <button
                    onClick={() => {
                      onGeneratePlan(profile?.nutritionPreferences || {} as any, modifyPlanText.trim() || undefined);
                      setShowModifyPlan(false);
                      setModifyPlanText('');
                    }}
                    disabled={!modifyPlanText.trim() || isLoading}
                    className="w-full py-4 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-2xl text-white font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-3"
                  >
                    <i className="fas fa-wand-magic-sparkles"></i> {language === 'de' ? 'Plan mit KI anpassen' : 'Modify Plan with AI'}
                  </button>
                </div>
              )}

              <div className="flex flex-col gap-6">
                <div className="grid grid-cols-8 gap-1.5 sm:gap-2 p-2 bg-slate-800/40 border border-white/5 rounded-[2rem] w-full backdrop-blur-sm">
                  {Object.keys(weeklyPlan || {}).sort((a,b) => DAYS_DE.indexOf(a) - DAYS_DE.indexOf(b)).map(day => {
                    const isToday = day === todayDE;
                    const dayMeals = weeklyPlan?.[day];
                    const dayEatenCount = dayMeals ? MEAL_TYPES.filter(t => dayMeals[t] && isMealEaten(day, t)).length : 0;
                    const dayTotalMeals = dayMeals ? MEAL_TYPES.filter(t => dayMeals[t]).length : 0;
                    const allEaten = dayEatenCount > 0 && dayEatenCount === dayTotalMeals;
                    return (
                      <button
                        key={day}
                        onClick={() => setSelectedDay(day)}
                        className={`flex flex-col items-center gap-1 py-3 sm:py-4 rounded-2xl font-black text-[10px] sm:text-xs uppercase transition-all relative ${
                          selectedDay === day
                            ? 'bg-orange-600 text-white shadow-xl shadow-orange-600/20'
                            : isToday
                              ? 'text-orange-400 bg-orange-500/10 border border-orange-500/20'
                              : 'text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        <span>{SHORT_DAYS_DE[day] || day.slice(0, 2)}</span>
                        {allEaten ? (
                          <div className="bg-emerald-500 text-[7px] w-3.5 h-3.5 rounded-full flex items-center justify-center text-white"><i className="fas fa-check"></i></div>
                        ) : dayEatenCount > 0 ? (
                          <span className="flex gap-0.5">
                            {MEAL_TYPES.map(mt => dayMeals?.[mt] ? (
                              <span key={mt} className={`w-1 h-1 rounded-full ${isMealEaten(day, mt) ? 'bg-emerald-500' : 'bg-slate-600'}`}></span>
                            ) : null)}
                          </span>
                        ) : (
                          <i className="fas fa-utensils text-[8px] opacity-40"></i>
                        )}
                        {isToday && selectedDay !== day && <span className="absolute -top-1 -right-1 w-2 h-2 bg-orange-500 rounded-full"></span>}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setShowShoppingList(true)}
                    className="flex flex-col items-center justify-center gap-1 py-3 sm:py-4 rounded-2xl text-slate-400 bg-white/5 border border-white/5 hover:bg-orange-600 hover:text-white transition-all"
                  >
                    <i className="fas fa-shopping-basket text-sm"></i>
                    <span className="text-[8px] font-bold opacity-60 hidden sm:block">{language === 'de' ? 'Liste' : 'List'}</span>
                  </button>
                </div>
                
                {dayTotals && (() => {
                  // Color coding: compare consumed vs targets
                  const targetKcal = targets?.calories || 0;
                  const targetProtein = targets?.protein || 0;
                  const targetCarbs = targets?.carbs || 0;
                  const targetFats = targets?.fats || 0;
                  const hasTargets = targetKcal > 0;
                  const hasConsumed = dayTotals.eatenCount > 0 || dayTotals.hasAdditional;

                  // Status: ratio of consumed/target. <0.85 = low, 0.85-1.1 = ok, >1.1 = over
                  const getStatus = (consumed: number, target: number, inverted = false): { color: string; label: string; borderColor: string } => {
                    if (!hasTargets || target === 0 || !hasConsumed) return { color: 'text-slate-400', label: '', borderColor: 'border-white/5' };
                    const ratio = consumed / target;
                    if (inverted) {
                      // For kcal/fats: under = good, over = bad
                      if (ratio < 0.85) return { color: 'text-blue-400', label: language === 'de' ? 'Niedrig' : 'Low', borderColor: 'border-blue-500/20' };
                      if (ratio <= 1.1) return { color: 'text-emerald-400', label: 'OK', borderColor: 'border-emerald-500/20' };
                      return { color: 'text-red-400', label: language === 'de' ? 'Zu viel' : 'Over', borderColor: 'border-red-500/20' };
                    }
                    // For protein: more = better
                    if (ratio < 0.85) return { color: 'text-amber-400', label: language === 'de' ? 'Zu wenig' : 'Low', borderColor: 'border-amber-500/20' };
                    if (ratio <= 1.1) return { color: 'text-emerald-400', label: 'OK', borderColor: 'border-emerald-500/20' };
                    return { color: 'text-emerald-400', label: language === 'de' ? 'Super' : 'Great', borderColor: 'border-emerald-500/20' };
                  };

                  const stats = [
                    { label: 'kcal', consumed: Math.round(dayTotals.consumed.calories), target: targetKcal, planned: Math.round(dayTotals.total.calories), defaultColor: 'text-white', bg: 'bg-slate-800/50', status: getStatus(dayTotals.consumed.calories, targetKcal, true) },
                    { label: 'Protein', consumed: Math.round(dayTotals.consumed.protein), target: targetProtein, planned: Math.round(dayTotals.total.protein), defaultColor: 'text-orange-400', bg: 'bg-orange-500/10', status: getStatus(dayTotals.consumed.protein, targetProtein, false) },
                    { label: 'Carbs', consumed: Math.round(dayTotals.consumed.carbs), target: targetCarbs, planned: Math.round(dayTotals.total.carbs), defaultColor: 'text-blue-400', bg: 'bg-blue-500/10', status: getStatus(dayTotals.consumed.carbs, targetCarbs, true) },
                    { label: language === 'de' ? 'Fett' : 'Fats', consumed: Math.round(dayTotals.consumed.fats), target: targetFats, planned: Math.round(dayTotals.total.fats), defaultColor: 'text-amber-400', bg: 'bg-amber-500/10', status: getStatus(dayTotals.consumed.fats, targetFats, true) },
                  ];

                  return (
                    <div className="space-y-3">
                      {/* Progress bar */}
                      {dayTotals.eatenCount > 0 && (
                        <div className="flex items-center gap-3 px-2">
                          <div className="flex-1 h-2 bg-slate-800/60 rounded-full overflow-hidden border border-white/5">
                            <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-500"
                              style={{ width: `${Math.round(dayTotals.eatenCount / dayTotals.totalCount * 100)}%` }} />
                          </div>
                          <span className="text-[10px] font-black text-emerald-500 tracking-widest whitespace-nowrap">
                            {dayTotals.eatenCount}/{dayTotals.totalCount} ✓
                          </span>
                        </div>
                      )}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                        {stats.map(stat => {
                          const showConsumed = hasConsumed;
                          const displayColor = showConsumed ? stat.status.color : stat.defaultColor;
                          const borderClass = showConsumed ? stat.status.borderColor : 'border-white/5';
                          // Progress ring for consumed vs target
                          const pct = hasTargets && stat.target > 0 ? Math.min((showConsumed ? stat.consumed : stat.planned) / stat.target * 100, 100) : 0;

                          return (
                            <div key={stat.label} className={`${stat.bg} p-4 sm:p-5 rounded-[1.5rem] text-center border ${borderClass} shadow-xl transition-all`}>
                              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{stat.label}</p>
                              {showConsumed ? (
                                <div>
                                  <p className={`text-lg font-black ${displayColor} tracking-tight leading-none`}>
                                    {stat.consumed}{stat.label !== 'kcal' && 'g'}
                                  </p>
                                  {hasTargets && stat.target > 0 && (
                                    <>
                                      <p className="text-[10px] font-bold text-slate-500 mt-1">/ {stat.target}{stat.label !== 'kcal' && 'g'}</p>
                                      {/* Mini progress bar */}
                                      <div className="mt-2 h-1.5 bg-slate-800/60 rounded-full overflow-hidden border border-white/5">
                                        <div className={`h-full rounded-full transition-all duration-700`}
                                          style={{
                                            width: `${pct}%`,
                                            backgroundColor: stat.status.color === 'text-emerald-400' ? '#34d399'
                                              : stat.status.color === 'text-red-400' ? '#f87171'
                                              : stat.status.color === 'text-amber-400' ? '#fbbf24'
                                              : '#60a5fa'
                                          }}
                                        />
                                      </div>
                                      {stat.status.label && (
                                        <p className={`text-[8px] font-black uppercase tracking-widest mt-1 ${displayColor}`}>{stat.status.label}</p>
                                      )}
                                    </>
                                  )}
                                </div>
                              ) : (
                                <div>
                                  <p className={`text-xl font-black ${stat.defaultColor} tracking-tight`}>
                                    {stat.planned}{stat.label !== 'kcal' && 'g'}
                                  </p>
                                  {hasTargets && stat.target > 0 && (
                                    <p className="text-[10px] font-bold text-slate-600 mt-1">{language === 'de' ? 'Ziel' : 'Target'}: {stat.target}{stat.label !== 'kcal' && 'g'}</p>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {MEAL_TYPES.map((type) => {
                  const meal = weeklyPlan?.[selectedDay]?.[type];
                  if (!meal) return null;
                  const isLiked = profile?.likedRecipes?.some(r => r.name === meal.name);
                  const eaten = isMealEaten(selectedDay, type);
                  const isBeingReplaced = draftMeal?.day === selectedDay && draftMeal?.mealType === type;
                  return (
                    <div
                      key={type}
                      className={`bg-[#1a1f26] p-6 rounded-[2.5rem] border hover:shadow-2xl transition-all relative group overflow-hidden cursor-pointer ${isBeingReplaced ? 'border-amber-500/30 bg-amber-950/10 opacity-60' : eaten ? 'border-emerald-500/30 bg-emerald-950/20' : 'border-white/5 hover:bg-slate-800/50 hover:border-white/10'}`}
                      onClick={() => setSelectedRecipe(meal)}
                    >
                      {/* Header: icon + type + action buttons */}
                      <div className="flex items-start gap-3 mb-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg border shadow-lg flex-shrink-0 ${eaten ? 'bg-emerald-600/10 text-emerald-500 border-emerald-500/20' : 'bg-orange-600/10 text-orange-500 border-orange-500/20'}`}>
                          <i className={`fas ${type === 'breakfast' ? 'fa-coffee' : type === 'lunch' ? 'fa-sun' : type === 'dinner' ? 'fa-moon' : 'fa-cookie-bite'}`}></i>
                        </div>
                        <div className="flex-1 min-w-0 pt-1">
                          <div className="flex items-center gap-2">
                            <p className="text-[9px] font-black uppercase text-slate-500 tracking-widest">{type}</p>
                            {eaten && <span className="text-[8px] font-black uppercase tracking-widest text-emerald-500">✓</span>}
                          </div>
                        </div>
                        <div className="flex gap-1.5 flex-shrink-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleMealEaten(selectedDay, type); }}
                            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all border ${eaten ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-white/5 border-white/5 text-slate-600 hover:text-emerald-400 hover:border-emerald-500/20'}`}
                            title={eaten ? (language === 'de' ? 'Als nicht gegessen markieren' : 'Mark as not eaten') : (language === 'de' ? 'Als gegessen markieren' : 'Mark as eaten')}
                          >
                            <i className={`fas ${eaten ? 'fa-check-circle' : 'fa-circle'} text-xs`}></i>
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleLike(meal); }}
                            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all border ${isLiked ? 'bg-red-500/10 border-red-500/20 text-red-500' : 'bg-white/5 border-white/5 text-slate-500 hover:text-red-400'}`}
                          >
                            <i className={`fa${isLiked ? 's' : 'r'} fa-heart text-xs`}></i>
                          </button>
                        </div>
                      </div>
                      {/* Meal name */}
                      {isBeingReplaced && (
                        <div className="mb-2 flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-amber-500/20 border border-amber-500/30 rounded-lg text-[8px] font-black uppercase tracking-widest text-amber-400">
                            <i className="fas fa-arrow-right-arrow-left mr-1"></i>{language === 'de' ? 'Wird ersetzt' : 'Being replaced'}
                          </span>
                        </div>
                      )}
                      <h4 className={`font-black text-sm leading-snug transition-colors line-clamp-2 mb-4 ${isBeingReplaced ? 'line-through text-slate-500' : eaten ? 'text-emerald-300/80' : 'text-white group-hover:text-orange-400'}`}>{meal.name}</h4>
                      <div className="flex justify-between items-center text-[10px] font-black tracking-widest uppercase border-t border-white/5 pt-4">
                        <span className={eaten ? 'text-emerald-500/60' : 'text-slate-500'}>{Math.round(meal.calories)} kcal</span>
                        <span className={`flex items-center gap-1.5 ${eaten ? 'text-emerald-500/60' : 'text-orange-500'}`}><i className="fas fa-dumbbell text-[8px]"></i> {Math.round(meal.protein)}g P</span>
                      </div>
                      {/* Adjust button */}
                      <button
                        onClick={(e) => { e.stopPropagation(); setExceptionInput(exceptionInput?.meal === `${selectedDay}|${type}` ? null : { meal: `${selectedDay}|${type}`, text: '' }); }}
                        className="mt-3 w-full py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest bg-white/5 border border-white/5 text-slate-500 hover:text-orange-400 hover:border-orange-500/20 hover:bg-orange-500/5 transition-all flex items-center justify-center gap-2"
                      >
                        <i className="fas fa-wand-magic-sparkles text-[8px]"></i>
                        {language === 'de' ? 'Anpassen' : 'Adjust'}
                      </button>
                      {/* Inline adjust input */}
                      {exceptionInput?.meal === `${selectedDay}|${type}` && (
                        <div className="mt-3 space-y-2" onClick={e => e.stopPropagation()}>
                          <textarea
                            value={exceptionInput.text}
                            onChange={e => setExceptionInput({ ...exceptionInput, text: e.target.value })}
                            placeholder={language === 'de' ? 'z.B. Ohne Reis, mehr Gemüse...' : 'e.g. No rice, more veggies...'}
                            className="w-full px-4 py-3 bg-slate-800/60 border border-white/10 rounded-xl text-xs text-white placeholder:text-slate-600 outline-none focus:ring-2 focus:ring-orange-500/50 resize-none font-medium"
                            rows={2}
                            autoFocus
                          />
                          <button
                            onClick={() => handleMealAdjust(selectedDay, type, exceptionInput.text)}
                            disabled={isAdjusting || !exceptionInput.text.trim()}
                            className="w-full py-2.5 bg-orange-600 hover:bg-orange-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                          >
                            {isAdjusting ? (
                              <><i className="fas fa-spinner fa-spin text-[8px]"></i> {language === 'de' ? 'Wird angepasst...' : 'Adjusting...'}</>
                            ) : (
                              <><i className="fas fa-bolt text-[8px]"></i> {language === 'de' ? 'KI-Anpassung' : 'AI Adjust'}</>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* ── Replaced meals (greyed out old meals) ── */}
              {(() => {
                const dayReplaced = (Object.entries(replacedMeals) as [string, Recipe][]).filter(([key]) => key.startsWith(`${selectedDay}|`));
                if (dayReplaced.length === 0) return null;
                return (
                  <div className="mt-4 space-y-2">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                      <i className="fas fa-arrow-right-arrow-left text-slate-600"></i>
                      {language === 'de' ? 'Ersetzte Mahlzeiten (vorher)' : 'Replaced meals (before)'}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {dayReplaced.map(([key, oldMeal]) => {
                        const mealType = key.split('|')[1];
                        return (
                          <div key={key} className="bg-[#1a1f26] p-4 rounded-2xl border border-white/5 opacity-40 relative">
                            <div className="absolute top-3 right-3">
                              <button
                                onClick={() => {
                                  // Undo: restore old meal and remove from replacedMeals
                                  if (weeklyPlan?.[selectedDay]) {
                                    const restored = { ...weeklyPlan[selectedDay], [mealType]: oldMeal };
                                    onUpdateWeeklyPlan(selectedDay, restored);
                                    const nextReplaced = { ...replacedMeals };
                                    delete nextReplaced[key];
                                    setReplacedMeals(nextReplaced);
                                    if (profile) onUpdateProfile({ ...profile, replacedMeals: nextReplaced });
                                  }
                                }}
                                className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-slate-500 hover:text-amber-400 hover:border-amber-500/20 transition-all"
                                title={language === 'de' ? 'Wiederherstellen' : 'Restore'}
                              >
                                <i className="fas fa-undo text-[9px]"></i>
                              </button>
                            </div>
                            <p className="text-[8px] font-black uppercase text-slate-600 tracking-widest mb-1">{mealType}</p>
                            <h4 className="font-black text-sm text-slate-500 line-through leading-snug mb-2">{oldMeal.name}</h4>
                            <div className="flex gap-3 text-[9px] font-black text-slate-600">
                              <span>{Math.round(oldMeal.calories)} kcal</span>
                              <span>{Math.round(oldMeal.protein)}g P</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* ── Additional Food Log (AI-powered, per day) ── */}
              <div className="mt-6 bg-[#1a1f26] p-5 sm:p-6 rounded-[2rem] border border-white/5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                    <i className="fas fa-wand-magic-sparkles text-violet-400 text-sm"></i>
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      {language === 'de' ? 'KI-Planer' : 'AI Planner'}
                    </p>
                    <p className="text-[8px] font-bold text-slate-600 tracking-wide">
                      {language === 'de' ? 'Umplanen, hinzufügen oder anpassen per Chat' : 'Replan, add or adjust meals via chat'}
                    </p>
                  </div>
                </div>

                {/* Saved additional food summary */}
                {additionalFood[selectedDay]?.text && !additionalFoodDraft && (
                  <div className="mb-3 p-4 bg-violet-500/5 border border-violet-500/10 rounded-xl">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-bold text-violet-300 mb-1">{additionalFood[selectedDay].text}</p>
                        {additionalFood[selectedDay].estimate && (
                          <div className="flex flex-wrap gap-3 mt-2">
                            {additionalFood[selectedDay].estimate!.items.map((item, i) => (
                              <span key={i} className="text-[9px] font-bold text-slate-400 bg-slate-800/60 px-2 py-1 rounded-lg">
                                {item.name}: {Math.round(item.calories)} kcal, {Math.round(item.protein)}g P
                              </span>
                            ))}
                          </div>
                        )}
                        {additionalFood[selectedDay].estimate && (
                          <div className="flex gap-4 mt-2 text-[10px] font-black">
                            <span className="text-white">{Math.round(additionalFood[selectedDay].estimate!.totalCalories)} kcal</span>
                            <span className="text-orange-400">{Math.round(additionalFood[selectedDay].estimate!.totalProtein)}g P</span>
                            <span className="text-blue-400">{Math.round(additionalFood[selectedDay].estimate!.totalCarbs)}g C</span>
                            <span className="text-amber-400">{Math.round(additionalFood[selectedDay].estimate!.totalFats)}g F</span>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          const next = { ...additionalFood };
                          delete next[selectedDay];
                          setAdditionalFood(next);
                          setAdditionalFoodInput('');
                          if (profile) onUpdateProfile({ ...profile, additionalFood: next });
                        }}
                        className="w-8 h-8 rounded-lg bg-white/5 border border-white/5 flex items-center justify-center text-slate-500 hover:text-red-400 hover:border-red-500/20 transition-all flex-shrink-0"
                      >
                        <i className="fas fa-times text-xs"></i>
                      </button>
                    </div>
                  </div>
                )}

                {/* Input field */}
                {!additionalFoodDraft && (
                  <div className="space-y-2">
                    <textarea
                      value={additionalFoodInput}
                      onChange={e => setAdditionalFoodInput(e.target.value)}
                      placeholder={language === 'de'
                        ? 'z.B. "Abends Flammkuchen mit Freunden, plane den Tag" oder "Ich hatte ein Eis extra"...'
                        : 'e.g. "Having pizza tonight, replan the day" or "I had an extra ice cream"...'}
                      className="w-full px-4 py-3 bg-slate-800/40 border border-white/5 rounded-xl text-sm text-white placeholder:text-slate-600 outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/20 resize-none font-medium transition-all"
                      rows={2}
                    />
                    {additionalFoodInput.trim() && (
                      <button
                        onClick={handleEstimateAdditionalFood}
                        disabled={isEstimatingFood}
                        className="w-full py-3 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg shadow-violet-600/20"
                      >
                        {isEstimatingFood ? (
                          <><i className="fas fa-spinner fa-spin text-xs"></i> {language === 'de' ? 'KI plant...' : 'AI planning...'}</>
                        ) : (
                          <><i className="fas fa-bolt text-xs"></i> {language === 'de' ? 'Mit KI anpassen' : 'Adjust with AI'}</>
                        )}
                      </button>
                    )}
                  </div>
                )}

                {/* ── DRAFT: AI estimation result ── */}
                {additionalFoodDraft && additionalFoodDraft.day === selectedDay && (
                  <div className="space-y-4 animate-fade-in">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-3 py-1 bg-amber-500/20 text-amber-400 text-[9px] font-black uppercase tracking-widest rounded-lg border border-amber-500/20">
                        <i className="fas fa-file-pen mr-1.5"></i>Draft
                      </span>
                    </div>

                    {/* Item breakdown */}
                    <div className="space-y-2">
                      {additionalFoodDraft.estimate.items.map((item, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-slate-800/40 rounded-xl border border-white/5">
                          <span className="text-sm font-bold text-white">{item.name}</span>
                          <div className="flex gap-3 text-[10px] font-black">
                            <span className="text-white">{Math.round(item.calories)}<span className="text-slate-500 ml-0.5">kcal</span></span>
                            <span className="text-orange-400">{Math.round(item.protein)}g<span className="text-slate-500 ml-0.5">P</span></span>
                            <span className="text-blue-400">{Math.round(item.carbs)}g<span className="text-slate-500 ml-0.5">C</span></span>
                            <span className="text-amber-400">{Math.round(item.fats)}g<span className="text-slate-500 ml-0.5">F</span></span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Totals */}
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { label: 'kcal', val: Math.round(additionalFoodDraft.estimate.totalCalories), color: 'text-white', bg: 'bg-slate-800/50' },
                        { label: 'Protein', val: `${Math.round(additionalFoodDraft.estimate.totalProtein)}g`, color: 'text-orange-400', bg: 'bg-orange-500/10' },
                        { label: 'Carbs', val: `${Math.round(additionalFoodDraft.estimate.totalCarbs)}g`, color: 'text-blue-400', bg: 'bg-blue-500/10' },
                        { label: 'Fett', val: `${Math.round(additionalFoodDraft.estimate.totalFats)}g`, color: 'text-amber-400', bg: 'bg-amber-500/10' },
                      ].map(s => (
                        <div key={s.label} className={`${s.bg} p-3 rounded-xl text-center border border-white/5`}>
                          <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">{s.label}</p>
                          <p className={`text-base font-black ${s.color}`}>{s.val}</p>
                        </div>
                      ))}
                    </div>

                    {/* Adjusted meals preview — show old vs new */}
                    {additionalFoodDraft.estimate.adjustedMeals && Object.keys(additionalFoodDraft.estimate.adjustedMeals).length > 0 && (
                      <div className="p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-xl">
                        <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-3">
                          <i className="fas fa-arrows-rotate mr-1.5"></i>
                          {language === 'de' ? 'Angepasste Mahlzeiten (vorher → nachher)' : 'Adjusted Meals (before → after)'}
                        </p>
                        {Object.entries(additionalFoodDraft.estimate.adjustedMeals).map(([mealType, meal]: [string, any]) => {
                          if (!meal) return null;
                          const currentMeal = weeklyPlan?.[selectedDay]?.[mealType as keyof DailyMealPlan] as Recipe | undefined;
                          const isChanged = currentMeal && currentMeal.name !== meal.name;
                          return (
                            <div key={mealType} className="py-2 border-b border-white/5 last:border-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest w-16">{mealType}</span>
                                {isChanged && currentMeal && (
                                  <span className="text-xs text-slate-500 line-through">{currentMeal.name}</span>
                                )}
                              </div>
                              <div className="flex items-center justify-between ml-8 sm:ml-[4.5rem]">
                                <span className="text-sm font-bold text-white flex items-center gap-2">
                                  {isChanged && <i className="fas fa-arrow-right text-indigo-400 text-[8px]"></i>}
                                  {meal.name}
                                </span>
                                <span className="text-[10px] font-black text-slate-400">{Math.round(meal.calories)} kcal</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* AI advice */}
                    {additionalFoodDraft.estimate.advice && (
                      <div className="p-4 bg-slate-800/30 rounded-xl border border-white/5">
                        <p className="text-xs font-medium text-slate-300 leading-relaxed">
                          <i className="fas fa-lightbulb text-amber-400 mr-2"></i>
                          {additionalFoodDraft.estimate.advice}
                        </p>
                      </div>
                    )}

                    {/* Accept / Discard */}
                    <div className="flex gap-3">
                      <button
                        onClick={acceptAdditionalFoodDraft}
                        className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20"
                      >
                        <i className="fas fa-check"></i> {language === 'de' ? 'Übernehmen' : 'Accept'}
                      </button>
                      <button
                        onClick={discardAdditionalFoodDraft}
                        className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                      >
                        <i className="fas fa-times"></i> {language === 'de' ? 'Verwerfen' : 'Discard'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      {activeTab === 'recipes' && (
        <div className="space-y-10 animate-fade-in">
          <div className="bg-[#1a1f26] rounded-[1.5rem] sm:rounded-[3rem] p-5 sm:p-10 lg:p-14 border border-white/5 shadow-2xl relative overflow-hidden">
             <div className="absolute top-0 right-0 p-14 opacity-5 text-9xl pointer-events-none translate-x-4"><i className="fas fa-book-open text-white"></i></div>
             
             <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8 sm:mb-14 relative z-10">
               <div>
                 <p className="text-orange-500 text-[10px] font-black uppercase tracking-[0.3em] mb-2">Recipe Vault</p>
                 <h3 className="text-2xl sm:text-4xl font-black text-white tracking-tighter uppercase">{t.favorites}</h3>
               </div>
               <div className="flex items-center gap-3 w-full md:w-auto">
                 <div className="relative flex-1 md:w-72 group">
                    <i className="fas fa-search absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-orange-500 transition-colors"></i>
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      placeholder={language === 'de' ? "Suchen..." : "Search..."}
                      className="w-full pl-12 pr-4 py-4 bg-slate-800/50 border border-white/5 rounded-2xl font-bold text-sm text-white outline-none focus:ring-2 focus:ring-orange-500 transition-all placeholder:text-slate-600 shadow-xl"
                    />
                 </div>
                 <button
                   onClick={() => setShowCreateRecipe(true)}
                   className="shrink-0 px-5 py-4 bg-orange-600 hover:bg-orange-500 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all flex items-center gap-2 shadow-xl shadow-orange-600/20 border border-orange-400/20"
                 >
                   <i className="fas fa-plus"></i> <span className="hidden sm:inline">{t.createRecipe}</span>
                 </button>
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
                    className={`bg-slate-800/30 hover:bg-slate-800/60 p-3 sm:p-5 rounded-[1.5rem] sm:rounded-[2.5rem] border transition-all flex items-center gap-3 sm:gap-6 group cursor-pointer ${fav.isPlannedForWeek ? 'border-orange-500/40 bg-orange-500/5' : 'border-white/5'}`} 
                    onClick={() => setSelectedRecipe(fav)}
                   >
                     <div className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center flex-shrink-0 text-2xl transition-all ${fav.isPlannedForWeek ? 'bg-orange-600 text-white shadow-xl shadow-orange-600/20' : 'bg-slate-700 text-slate-400 group-hover:bg-slate-900 group-hover:text-white'}`}>
                        <i className="fas fa-utensils"></i>
                     </div>
                     
                     <div className="flex-1 min-w-0">
                       <div className="flex items-center gap-2">
                         <h4 className="font-black text-white text-lg truncate uppercase tracking-tight group-hover:text-orange-400 transition-colors">{fav.name}</h4>
                         {fav.mealType && (
                           <span className="shrink-0 px-2 py-0.5 bg-white/5 border border-white/5 rounded-lg text-[8px] font-black uppercase tracking-widest text-slate-500">
                             {fav.mealType === 'breakfast' ? t.breakfast : fav.mealType === 'lunch' ? t.lunch : fav.mealType === 'dinner' ? t.dinner : t.snack}
                           </span>
                         )}
                       </div>
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
                          className={`h-12 sm:h-14 px-4 sm:px-8 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-3 ${fav.isPlannedForWeek ? 'bg-orange-600 text-white shadow-xl shadow-orange-600/20' : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/5'}`}
                        >
                          <i className={`fas ${fav.isPlannedForWeek ? 'fa-check text-base' : 'fa-calendar-plus'}`}></i>
                          <span className="hidden sm:inline">{fav.isPlannedForWeek ? 'Planned' : t.planForWeek}</span>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleLike(fav); }}
                          className="w-14 h-14 rounded-2xl bg-[#1a1f26] text-red-500 shadow-xl flex items-center justify-center border border-white/5 hover:bg-red-500/10 transition-all active:scale-95"
                          title={language === 'de' ? 'Rezept löschen' : 'Delete recipe'}
                        >
                          <i className="fas fa-trash-can text-lg"></i>
                        </button>
                     </div>
                   </div>
                 ))}
               </div>
             )}
          </div>
        </div>
      )}

      <NutritionModals
        language={language}
        t={t}
        selectedRecipe={selectedRecipe}
        setSelectedRecipe={setSelectedRecipe}
        showCreateRecipe={showCreateRecipe}
        setShowCreateRecipe={setShowCreateRecipe}
        newRecipeName={newRecipeName}
        setNewRecipeName={setNewRecipeName}
        newRecipeIngredients={newRecipeIngredients}
        setNewRecipeIngredients={setNewRecipeIngredients}
        newIngInput={newIngInput}
        setNewIngInput={setNewIngInput}
        newRecipePrepTime={newRecipePrepTime}
        setNewRecipePrepTime={setNewRecipePrepTime}
        newRecipeMealType={newRecipeMealType}
        setNewRecipeMealType={setNewRecipeMealType}
        isEstimatingNutrition={isEstimatingNutrition}
        handleCreateRecipe={handleCreateRecipe}
        showShoppingList={showShoppingList}
        setShowShoppingList={setShowShoppingList}
        shoppingList={shoppingList}
        showFoodPrep={showFoodPrep}
        setShowFoodPrep={setShowFoodPrep}
        weeklyPlan={weeklyPlan}
        draftMeal={draftMeal}
        acceptDraft={acceptDraft}
        discardDraft={discardDraft}
      />
      {activeTab === 'history' && <NutritionHistory profile={profile} language={language} />}
    </div>
  );
};

export default NutritionTab;
