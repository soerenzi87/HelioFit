import React from 'react';
import { WeeklyMealPlan, Recipe, Language } from '../../types';
import { AggregatedIngredient, DAYS_DE, SHORT_DAYS_DE, MEAL_TYPES } from './nutritionHelpers';
import { NutritionTranslations } from './nutritionTranslations';

interface NutritionModalsProps {
  language: Language;
  t: NutritionTranslations;
  // Recipe detail modal
  selectedRecipe: Recipe | null;
  setSelectedRecipe: (r: Recipe | null) => void;
  // Create recipe modal
  showCreateRecipe: boolean;
  setShowCreateRecipe: (v: boolean) => void;
  newRecipeName: string;
  setNewRecipeName: (v: string) => void;
  newRecipeIngredients: string[];
  setNewRecipeIngredients: (v: string[]) => void;
  newIngInput: string;
  setNewIngInput: (v: string) => void;
  newRecipePrepTime: string;
  setNewRecipePrepTime: (v: string) => void;
  newRecipeMealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  setNewRecipeMealType: (v: 'breakfast' | 'lunch' | 'dinner' | 'snack') => void;
  isEstimatingNutrition: boolean;
  handleCreateRecipe: () => void;
  // Shopping list modal
  showShoppingList: boolean;
  setShowShoppingList: (v: boolean) => void;
  shoppingList: AggregatedIngredient[];
  // Food prep modal
  showFoodPrep: boolean;
  setShowFoodPrep: (v: boolean) => void;
  weeklyPlan: WeeklyMealPlan | null;
  // Draft meal modal
  draftMeal: { day: string; mealType: string; recipe: Recipe } | null;
  acceptDraft: () => void;
  discardDraft: () => void;
}

const NutritionModals: React.FC<NutritionModalsProps> = (props) => {
  const { language, t } = props;

  return (
    <>
      {/* Recipe Detail Modal */}
      {props.selectedRecipe && (
        <div className="fixed inset-0 z-[250] bg-[#0f172a]/80 backdrop-blur-xl flex items-end sm:items-center justify-center sm:p-6 animate-fade-in transition-all" onClick={() => props.setSelectedRecipe(null)}>
          <div className="bg-[#1a1f26] rounded-t-[2.5rem] sm:rounded-[3rem] w-full sm:max-w-5xl max-h-[92vh] sm:max-h-[90vh] border border-white/10 shadow-[0_0_100px_rgba(0,0,0,0.5)] animate-scale-in text-white flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }} onClick={e => e.stopPropagation()}>
             <div className="flex justify-between items-start p-5 sm:p-10 lg:p-14 pb-4 sm:pb-8 border-b border-white/5 flex-shrink-0">
               <div className="min-w-0 flex-1 mr-4">
                  <p className="text-orange-500 text-[10px] font-black uppercase tracking-[0.3em] mb-2">Recipe Details</p>
                  <h3 className="text-2xl sm:text-4xl font-black uppercase tracking-tighter leading-none truncate">{props.selectedRecipe.name}</h3>
               </div>
               <button onClick={() => props.setSelectedRecipe(null)} className="w-11 h-11 sm:w-14 sm:h-14 bg-white/5 hover:bg-red-500/20 rounded-xl sm:rounded-2xl text-slate-400 hover:text-red-500 flex items-center justify-center transition-all border border-white/5 flex-shrink-0">
                 <i className="fas fa-times text-lg sm:text-2xl"></i>
               </button>
             </div>
             <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-10 lg:p-14 pt-4 sm:pt-8" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
             <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 sm:gap-12">
                <div className="lg:col-span-5 space-y-6 sm:space-y-10">
                  <div className="p-5 sm:p-8 bg-slate-800/50 rounded-2xl sm:rounded-[2.5rem] border border-white/5 flex flex-wrap gap-4 sm:gap-8 justify-between">
                     <div className="text-center"><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Calories</p><p className="text-2xl font-black text-white">{Math.round(props.selectedRecipe.calories || 0)}</p></div>
                     <div className="text-center"><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Protein</p><p className="text-2xl font-black text-orange-400">{Math.round(props.selectedRecipe.protein || 0)}g</p></div>
                     <div className="text-center"><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Time</p><p className="text-2xl font-black text-blue-400">{props.selectedRecipe.prepTime}</p></div>
                  </div>
                  <div>
                    <h4 className="text-[11px] font-black text-slate-400 uppercase mb-6 tracking-[0.2em] flex items-center gap-3"><i className="fas fa-list-check text-orange-500"></i> {t.ingredients}</h4>
                    <ul className="space-y-4">
                      {(props.selectedRecipe.ingredients || []).map((ing, i) => (
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
                    {(props.selectedRecipe.instructions || []).map((step, i) => (
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
        </div>
      )}

      {/* Create Recipe Modal */}
      {props.showCreateRecipe && (
        <div className="fixed inset-0 z-[300] bg-[#0f172a]/80 backdrop-blur-xl flex items-center justify-center p-4 sm:p-6 animate-fade-in">
          <div className="bg-[#1a1f26] rounded-[2rem] sm:rounded-[3.5rem] p-6 sm:p-10 border border-white/10 shadow-[0_0_100px_rgba(0,0,0,0.5)] max-w-2xl w-full max-h-[90vh] overflow-y-auto text-white animate-scale-in">
            <div className="flex justify-between items-start mb-8">
              <div>
                <p className="text-orange-500 text-[10px] font-black uppercase tracking-[0.3em] mb-2">{t.createRecipe}</p>
                <h3 className="text-2xl sm:text-3xl font-black uppercase tracking-tighter">{t.createRecipe}</h3>
              </div>
              <button onClick={() => props.setShowCreateRecipe(false)} className="w-12 h-12 rounded-2xl bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-500 flex items-center justify-center transition-all border border-white/5">
                <i className="fas fa-times text-xl"></i>
              </button>
            </div>
            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">{t.recipeName}</label>
                <input type="text" value={props.newRecipeName} onChange={e => props.setNewRecipeName(e.target.value)} placeholder={t.recipeNamePlaceholder} className="w-full p-4 bg-slate-800/50 rounded-2xl border border-white/5 font-bold text-sm text-white outline-none focus:ring-2 focus:ring-orange-500 placeholder:text-slate-600" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 block">{t.mealType}</label>
                <div className="flex flex-wrap gap-2">
                  {([
                    { id: 'breakfast' as const, label: t.breakfast, icon: 'fa-mug-hot' },
                    { id: 'lunch' as const, label: t.lunch, icon: 'fa-sun' },
                    { id: 'dinner' as const, label: t.dinner, icon: 'fa-moon' },
                    { id: 'snack' as const, label: t.snack, icon: 'fa-cookie-bite' },
                  ]).map(mt => (
                    <button key={mt.id} onClick={() => props.setNewRecipeMealType(mt.id)} className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${props.newRecipeMealType === mt.id ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/20' : 'bg-white/5 text-slate-400 border border-white/5 hover:bg-white/10'}`}>
                      <i className={`fas ${mt.icon} text-xs`}></i> {mt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">{t.prepTime}</label>
                <input type="text" value={props.newRecipePrepTime} onChange={e => props.setNewRecipePrepTime(e.target.value)} placeholder="15 min" className="w-full p-4 bg-slate-800/50 rounded-2xl border border-white/5 font-bold text-sm text-white outline-none focus:ring-2 focus:ring-orange-500 placeholder:text-slate-600" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">{t.ingredients}</label>
                <div className="flex gap-2 mb-3">
                  <input type="text" value={props.newIngInput} onChange={e => props.setNewIngInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && props.newIngInput.trim()) { props.setNewRecipeIngredients([...props.newRecipeIngredients, props.newIngInput.trim()]); props.setNewIngInput(''); } }} placeholder={t.ingredientPlaceholder} className="flex-1 p-4 bg-slate-800/50 rounded-2xl border border-white/5 font-bold text-sm text-white outline-none focus:ring-2 focus:ring-orange-500 placeholder:text-slate-600" />
                  <button onClick={() => { if (props.newIngInput.trim()) { props.setNewRecipeIngredients([...props.newRecipeIngredients, props.newIngInput.trim()]); props.setNewIngInput(''); } }} className="px-5 py-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl border border-white/5 font-black uppercase text-[10px] tracking-widest"><i className="fas fa-plus"></i></button>
                </div>
                {props.newRecipeIngredients.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {props.newRecipeIngredients.map((ing, i) => (
                      <span key={i} className="px-3 py-2 bg-orange-500/10 border border-orange-500/20 rounded-xl text-xs font-bold text-slate-300 flex items-center gap-2">
                        {ing}
                        <button onClick={() => props.setNewRecipeIngredients(props.newRecipeIngredients.filter((_, j) => j !== i))} className="text-slate-500 hover:text-red-400 transition-colors"><i className="fas fa-times text-[8px]"></i></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={props.handleCreateRecipe} disabled={!props.newRecipeName.trim() || props.newRecipeIngredients.length === 0 || props.isEstimatingNutrition} className="w-full py-5 bg-orange-600 hover:bg-orange-500 disabled:bg-slate-700 disabled:text-slate-400 text-white rounded-2xl font-black uppercase text-sm tracking-widest transition-all border border-orange-400/20 flex items-center justify-center gap-3">
                {props.isEstimatingNutrition ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> {t.estimating}</>) : (<><i className="fas fa-wand-magic-sparkles"></i> {t.estimateNutrition}</>)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shopping List Modal */}
      {props.showShoppingList && (
        <div className="fixed inset-0 z-[300] bg-[#0f172a]/80 backdrop-blur-xl flex items-end sm:items-center justify-center sm:p-6 animate-fade-in transition-all" onClick={() => props.setShowShoppingList(false)}>
          <div className="bg-[#1a1f26] rounded-t-[2.5rem] sm:rounded-[3rem] w-full max-w-5xl max-h-[92vh] sm:max-h-[90vh] shadow-[0_0_100px_rgba(0,0,0,0.5)] border border-white/10 flex flex-col animate-scale-in text-white" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }} onClick={e => e.stopPropagation()}>
            <div className="bg-[#0f172a] p-5 sm:p-10 lg:p-14 border-b border-white/5 flex justify-between items-center relative overflow-hidden flex-shrink-0">
              <div className="absolute top-0 right-0 p-14 opacity-5 text-9xl pointer-events-none translate-x-4"><i className="fas fa-cart-shopping text-white"></i></div>
              <div className="relative z-10">
                <p className="text-orange-500 text-[10px] font-black uppercase tracking-[0.3em] mb-1 sm:mb-2">Groceries</p>
                <h3 className="text-2xl sm:text-4xl font-black uppercase tracking-tighter flex items-center gap-4">{t.shopping}</h3>
              </div>
              <button onClick={() => props.setShowShoppingList(false)} className="relative z-10 w-11 h-11 sm:w-14 sm:h-14 bg-white/5 hover:bg-white/10 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all border border-white/10 shadow-xl">
                <i className="fas fa-times text-lg sm:text-2xl"></i>
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain -webkit-overflow-scrolling-touch p-4 sm:p-10 lg:p-14 bg-slate-900/40" style={{ WebkitOverflowScrolling: 'touch' }}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 pb-6">
                {props.shoppingList.map((ing, i) => (
                  <label key={i} className="flex items-center gap-4 sm:gap-5 p-4 sm:p-6 bg-slate-800/40 rounded-2xl sm:rounded-[2rem] border border-white/5 cursor-pointer hover:bg-slate-800/80 hover:border-white/10 transition-all group">
                    <div className="relative flex-shrink-0">
                      <input type="checkbox" className="peer w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl border-2 border-white/10 bg-transparent checked:bg-orange-600 checked:border-orange-500 appearance-none transition-all cursor-pointer" />
                      <i className="fas fa-check absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white text-xs opacity-0 peer-checked:opacity-100 pointer-events-none"></i>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest mb-0.5 sm:mb-1 opacity-80">{ing.amount} {ing.unit}</span>
                      <span className="text-sm sm:text-base font-black text-white tracking-tight truncate">{ing.name}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Food Prep Modal */}
      {props.showFoodPrep && props.weeklyPlan && (
        <div className="fixed inset-0 z-[300] bg-[#0f172a]/80 backdrop-blur-xl flex items-end sm:items-center justify-center sm:p-6 animate-fade-in transition-all" onClick={() => props.setShowFoodPrep(false)}>
          <div className="bg-[#1a1f26] rounded-t-[2.5rem] sm:rounded-[3rem] w-full max-w-5xl max-h-[92vh] sm:max-h-[90vh] shadow-[0_0_100px_rgba(0,0,0,0.5)] border border-white/10 flex flex-col animate-scale-in text-white" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }} onClick={e => e.stopPropagation()}>
            <div className="bg-[#0f172a] p-5 sm:p-10 lg:p-14 border-b border-white/5 flex justify-between items-center relative overflow-hidden flex-shrink-0">
              <div className="absolute top-0 right-0 p-14 opacity-5 text-9xl pointer-events-none translate-x-4"><i className="fas fa-kitchen-set text-white"></i></div>
              <div className="relative z-10">
                <p className="text-orange-500 text-[10px] font-black uppercase tracking-[0.3em] mb-1 sm:mb-2">Batch Cooking</p>
                <h3 className="text-2xl sm:text-4xl font-black uppercase tracking-tighter">Meal Prep</h3>
                <p className="text-xs text-slate-400 mt-1">{language === 'de' ? 'Alle Rezepte der Woche nach Zubereitungsart gruppiert' : 'All weekly recipes grouped by preparation'}</p>
              </div>
              <button onClick={() => props.setShowFoodPrep(false)} className="relative z-10 w-11 h-11 sm:w-14 sm:h-14 bg-white/5 hover:bg-white/10 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all border border-white/10 shadow-xl">
                <i className="fas fa-times text-lg sm:text-2xl"></i>
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-10 lg:p-14 bg-slate-900/40" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
              <FoodPrepContent weeklyPlan={props.weeklyPlan} shoppingList={props.shoppingList} language={language} />
            </div>
          </div>
        </div>
      )}

      {/* Draft Meal Preview Modal */}
      {props.draftMeal && (
        <div className="fixed inset-0 z-[300] bg-[#0f172a]/80 backdrop-blur-xl flex items-end sm:items-center justify-center sm:p-6 animate-fade-in" onClick={props.discardDraft}>
          <div className="bg-[#1a1f26] rounded-t-[2.5rem] sm:rounded-[3rem] w-full max-w-lg border border-white/10 shadow-[0_0_100px_rgba(0,0,0,0.5)] animate-scale-in text-white" onClick={e => e.stopPropagation()}>
            <div className="p-6 sm:p-8 border-b border-white/5">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/15 flex items-center justify-center">
                  <i className="fas fa-wand-magic-sparkles text-amber-400 text-sm"></i>
                </div>
                <p className="text-[10px] font-black text-amber-400 uppercase tracking-[0.2em]">
                  {language === 'de' ? 'KI-Vorschlag (Entwurf)' : 'AI Suggestion (Draft)'}
                </p>
              </div>
              <h3 className="text-xl font-black uppercase tracking-tight">{props.draftMeal.recipe.name}</h3>
            </div>
            <div className="p-6 sm:p-8 space-y-4">
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'kcal', val: Math.round(props.draftMeal.recipe.calories || 0), color: 'text-white' },
                  { label: 'Protein', val: `${Math.round(props.draftMeal.recipe.protein || 0)}g`, color: 'text-orange-400' },
                  { label: 'Carbs', val: `${Math.round(props.draftMeal.recipe.carbs || 0)}g`, color: 'text-blue-400' },
                  { label: 'Fats', val: `${Math.round(props.draftMeal.recipe.fats || 0)}g`, color: 'text-amber-400' },
                ].map(s => (
                  <div key={s.label} className="bg-slate-800/50 p-3 rounded-xl text-center border border-white/5">
                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">{s.label}</p>
                    <p className={`text-sm font-black ${s.color}`}>{s.val}</p>
                  </div>
                ))}
              </div>
              {props.draftMeal.recipe.ingredients && props.draftMeal.recipe.ingredients.length > 0 && (
                <div>
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">{t.ingredients}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {props.draftMeal.recipe.ingredients.map((ing, i) => (
                      <span key={i} className="px-2.5 py-1 bg-slate-800/50 border border-white/5 rounded-lg text-[10px] font-bold text-slate-300">{ing}</span>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-3 pt-4">
                <button onClick={props.discardDraft} className="flex-1 py-4 bg-white/5 hover:bg-red-500/10 text-slate-400 hover:text-red-400 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all border border-white/5 flex items-center justify-center gap-2">
                  <i className="fas fa-xmark"></i> {language === 'de' ? 'Verwerfen' : 'Discard'}
                </button>
                <button onClick={props.acceptDraft} className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-emerald-600/20 border border-emerald-400/20 flex items-center justify-center gap-2">
                  <i className="fas fa-check"></i> {language === 'de' ? 'Übernehmen' : 'Accept'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// Extracted food prep content to keep the modal clean
const FoodPrepContent: React.FC<{ weeklyPlan: WeeklyMealPlan; shoppingList: AggregatedIngredient[]; language: Language }> = ({ weeklyPlan, shoppingList, language }) => {
  const recipeMap = new Map<string, { recipe: Recipe; days: string[]; mealType: string; count: number }>();
  const sortedDays = Object.keys(weeklyPlan).sort((a, b) => DAYS_DE.indexOf(a) - DAYS_DE.indexOf(b));
  sortedDays.forEach(day => {
    const dayPlan = weeklyPlan[day];
    if (!dayPlan) return;
    MEAL_TYPES.forEach(mt => {
      const meal = dayPlan[mt] as Recipe | undefined;
      if (!meal?.name) return;
      const key = meal.name;
      if (recipeMap.has(key)) {
        const existing = recipeMap.get(key)!;
        existing.days.push(SHORT_DAYS_DE[day] || day.slice(0, 2));
        existing.count++;
      } else {
        recipeMap.set(key, { recipe: meal, days: [SHORT_DAYS_DE[day] || day.slice(0, 2)], mealType: mt, count: 1 });
      }
    });
  });

  const recipes = Array.from(recipeMap.values());
  const quickMeals = recipes.filter(r => { const mins = parseInt(r.recipe.prepTime || '0'); return mins > 0 && mins <= 15; });
  const mediumMeals = recipes.filter(r => { const mins = parseInt(r.recipe.prepTime || '0'); return mins > 15 && mins <= 30; });
  const longMeals = recipes.filter(r => { const mins = parseInt(r.recipe.prepTime || '0'); return mins > 30 || mins === 0; });

  const renderGroup = (title: string, icon: string, items: typeof recipes, color: string) => items.length > 0 ? (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-xl ${color} flex items-center justify-center`}><i className={`fas ${icon} text-sm`}></i></div>
        <h4 className="text-sm font-black uppercase tracking-widest text-white">{title}</h4>
        <span className="text-[10px] text-slate-500 font-bold">{items.length} {language === 'de' ? 'Rezepte' : 'recipes'}</span>
      </div>
      <div className="space-y-3">
        {items.map(({ recipe, days, count }) => (
          <div key={recipe.name} className="bg-slate-800/40 rounded-2xl border border-white/5 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0 flex-1">
                <h5 className="text-sm font-black text-white truncate">{recipe.name}</h5>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">{recipe.prepTime}</span>
                  <span className="text-slate-700">·</span>
                  <span className="text-[10px] font-bold text-orange-400">{Math.round(recipe.calories || 0)} kcal</span>
                  {count > 1 && (<><span className="text-slate-700">·</span><span className="text-[10px] font-bold text-emerald-400">{count}x {language === 'de' ? 'Portionen' : 'servings'}</span></>)}
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                {days.map(d => (<span key={d} className="px-2 py-0.5 bg-orange-600/15 text-orange-400 rounded-lg text-[9px] font-black">{d}</span>))}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(recipe.ingredients || []).map((ing, i) => (<span key={i} className="text-[10px] px-2 py-0.5 bg-slate-700/50 text-slate-400 rounded-lg font-medium">{count > 1 ? `${count}x ` : ''}{ing}</span>))}
            </div>
            {recipe.instructions && recipe.instructions.length > 0 && (
              <details className="mt-3">
                <summary className="text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-orange-400 transition-colors">{language === 'de' ? 'Zubereitung anzeigen' : 'Show instructions'}</summary>
                <ol className="mt-2 space-y-1.5 ml-4 list-decimal">
                  {recipe.instructions.map((step, i) => (<li key={i} className="text-xs text-slate-400 leading-relaxed">{step}</li>))}
                </ol>
              </details>
            )}
          </div>
        ))}
      </div>
    </div>
  ) : null;

  return (
    <div className="space-y-10 pb-6">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-emerald-500/10 border border-emerald-500/15 rounded-2xl p-4 text-center">
          <p className="text-2xl font-black text-emerald-400">{recipes.length}</p>
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{language === 'de' ? 'Rezepte' : 'Recipes'}</p>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/15 rounded-2xl p-4 text-center">
          <p className="text-2xl font-black text-amber-400">{recipes.reduce((a, r) => a + r.count, 0)}</p>
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{language === 'de' ? 'Portionen' : 'Servings'}</p>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/15 rounded-2xl p-4 text-center">
          <p className="text-2xl font-black text-blue-400">{shoppingList.length}</p>
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{language === 'de' ? 'Zutaten' : 'Ingredients'}</p>
        </div>
      </div>
      {renderGroup(language === 'de' ? 'Schnell (≤ 15 min)' : 'Quick (≤ 15 min)', 'fa-bolt', quickMeals, 'bg-emerald-500/15 text-emerald-400')}
      {renderGroup(language === 'de' ? 'Mittel (15–30 min)' : 'Medium (15–30 min)', 'fa-clock', mediumMeals, 'bg-amber-500/15 text-amber-400')}
      {renderGroup(language === 'de' ? 'Aufwändig (> 30 min)' : 'Complex (> 30 min)', 'fa-fire', longMeals, 'bg-red-500/15 text-red-400')}
    </div>
  );
};

export default NutritionModals;
