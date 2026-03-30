import { Language } from '../../types';

const de = {
  engine: 'Food Engine', configSub: 'Algorithmus konfigurieren', daysSelect: 'Tage für den Plan wählen', run: 'Wochenplan erstellen', exception: 'Ausnahme loggen', appliances: 'Geräte', protein: 'Protein', carbs: 'Carbs', fats: 'Fette', ingredients: 'Zutaten', instructions: 'Zubereitung', shopping: 'Einkaufsliste', noPlan: 'Kein Plan vorhanden', preferred: 'Bevorzugte Zutaten', excluded: 'Ausschlüsse (Allergien/Abneigungen)', add: 'Hinzufügen', export: 'In Kalender exportieren', varietyTitle: 'Wiederholungsmuster', shoppingSub: 'Aggregierte Mengen für die Woche',
  errorNoAnalysis: 'Bitte führe zuerst eine KI-Analyse im Dashboard (Overview) durch, um deine Kalorienziele zu berechnen.',
  favorites: 'Rezepte', weeklyPlan: 'Food Engine', planForWeek: 'Für die Woche einplanen', liked: 'Favorit', activeRecipes: 'Eingeplante Rezepte',
  createRecipe: 'Rezept erstellen', recipeName: 'Rezeptname', addIngredient: 'Zutat hinzufügen', prepTime: 'Zubereitungszeit', mealType: 'Mahlzeit-Typ',
  breakfast: 'Frühstück', lunch: 'Mittagessen', dinner: 'Abendessen', snack: 'Snack',
  estimateNutrition: 'Nährwerte berechnen & speichern', estimating: 'Nährwerte werden berechnet...',
  ingredientPlaceholder: 'z.B. 200g Hähnchenbrust', recipeNamePlaceholder: 'z.B. Protein Bowl',
} as const;

const en = {
  engine: 'Food Engine', configSub: 'Configure algorithm', daysSelect: 'Select days', run: 'Generate Weekly Plan', exception: 'Log Exception', appliances: 'Tools', protein: 'Protein', carbs: 'Carbs', fats: 'Fats', ingredients: 'Ingredients', instructions: 'Instructions', shopping: 'Shopping List', noPlan: 'No plan available', preferred: 'Preferred Ingredients', excluded: 'Excluded (Allergies/Dislikes)', add: 'Add', export: 'Export', varietyTitle: 'Repetition Pattern', shoppingSub: 'Weekly aggregated totals',
  errorNoAnalysis: 'Please perform an AI analysis in the Dashboard (Overview) first to calculate your calorie targets.',
  favorites: 'Recipes', weeklyPlan: 'Food Engine', planForWeek: 'Plan for Week', liked: 'Favorite', activeRecipes: 'Planned Recipes',
  createRecipe: 'Create Recipe', recipeName: 'Recipe Name', addIngredient: 'Add Ingredient', prepTime: 'Prep Time', mealType: 'Meal Type',
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack',
  estimateNutrition: 'Estimate Nutrition & Save', estimating: 'Estimating nutrition...',
  ingredientPlaceholder: 'e.g. 200g chicken breast', recipeNamePlaceholder: 'e.g. Protein Bowl',
} as const;

export type NutritionTranslations = Record<keyof typeof de, string>;

export const getNutritionTranslations = (language: Language): NutritionTranslations =>
  language === 'de' ? de : en;
