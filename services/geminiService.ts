import { GoogleGenAI, Type, GenerateContentParameters, Modality } from "@google/genai";
import { UserProfile, AIAnalysis, WeeklyMealPlan, NutritionPreferences, WorkoutProgram, ExistingWorkout, WorkoutLog, HealthData, Language, Recipe, DailyMealPlan, HealthMetricEntry, HealthInsight, ProgressInsight, Exercise } from "../types";

let ai: any;
try {
  ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "dummy" });
} catch (e) {
  console.warn("Could not init GoogleGenAI:", e);
}

const getLangInstruction = (lang: Language) => 
  lang === 'de' 
    ? "WICHTIG: Die gesamte Antwort (alle Texte, Titel, Beschreibungen, Rezepte, Tipps) MUSS auf Deutsch sein." 
    : "IMPORTANT: The entire response (all texts, titles, descriptions, recipes, tips) MUST be in English.";

function extractJson(text: string): string {
  if (!text) return "{}";
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-z]*\n/, '').replace(/\n```$/, '');
  }
  const jsonMatch = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  return jsonMatch ? jsonMatch[0] : cleaned;
}

let _mockMode = false;
export function setMockMode(enabled: boolean) { _mockMode = enabled; }
export function isMockMode(): boolean { return _mockMode || process.env.USE_MOCK_GEMINI === 'true'; }

async function callGeminiWithRetry(params: GenerateContentParameters, maxRetries = 3, forceMock = false): Promise<any> {
  if (forceMock || isMockMode()) {
    const prompt = typeof params.contents === 'string' ? params.contents : JSON.stringify(params.contents);
    
    if (prompt.includes("Analysiere Gesundheitsprofil") || prompt.includes("targets")) {
       return { text: JSON.stringify({
         summary: "MOCK: Du bist auf einem sehr guten Weg! Bleib weiterhin aktiv und achte auf deine Ernährung.",
         recommendations: ["Trinke ausreichend Wasser", "Achte auf genügend Schlaf", "Integriere mehr Bewegung in deinen Alltag"],
         targets: { maintenanceCalories: 2500, calories: 2200, protein: 150, carbs: 200, fats: 70, water: 3000 }
       })};
    }
        if (prompt.includes("Erstelle genau") && prompt.includes("Tages-Templates")) {
        const mockRecipes = [
          { name: "Skyr mit Beeren & Nüssen", ingredients: ["250 g Skyr", "100 g Beeren", "30 g Mandeln"], instructions: ["Skyr in Schale geben", "Beeren waschen", "Nüsse hacken und drüberstreuen"], calories: 350, protein: 30, carbs: 20, fats: 15, prepTime: "5m", requiredAppliances: [] },
          { name: "Lachs-Curry mit Reis", ingredients: ["150 g Lachs", "100 g Basmatireis", "200 g Brokkoli", "50 ml Kokosmilch"], instructions: ["Reis kochen", "Lachs würfeln und anbraten", "Brokkoli und Kokosmilch zugeben"], calories: 650, protein: 35, carbs: 55, fats: 25, prepTime: "20m", requiredAppliances: ["Herd", "Pfanne"] },
          { name: "Vollkorn-Sandwich", ingredients: ["2 Scheiben Vollkornbrot", "50 g Putenbrust", "1/2 Avocado", "Tomaten"], instructions: ["Brot rösten", "Avocado zerdrücken", "Belegen"], calories: 450, protein: 20, carbs: 40, fats: 20, prepTime: "10m", requiredAppliances: ["Toaster"] },
          { name: "Linsen-Bolognese", ingredients: ["100 g rote Linsen", "80 g Vollkornnudeln", "200 ml Passata", "Karotten"], instructions: ["Nudeln kochen", "Linsen in Tomatensauce weich kochen", "Mischen"], calories: 580, protein: 25, carbs: 90, fats: 8, prepTime: "25m", requiredAppliances: ["Herd"] },
          { name: "Omelett mit Spinat", ingredients: ["3 Eier", "100 g Blattspinat", "20 g Feta"], instructions: ["Eier verquirlen", "Spinat in Pfanne zusammenfallen lassen", "Eier drübergeben"], calories: 400, protein: 28, carbs: 5, fats: 30, prepTime: "12m", requiredAppliances: ["Pfanne"] }
        ];

        return { text: JSON.stringify([
          { templateId: 1, plan: { breakfast: mockRecipes[0], lunch: mockRecipes[1], dinner: mockRecipes[2], snack: mockRecipes[4] } },
          { templateId: 2, plan: { breakfast: mockRecipes[4], lunch: mockRecipes[3], dinner: mockRecipes[1], snack: mockRecipes[2] } }
        ])};
     }
    
    if (prompt.includes("Trainingsplan für")) {
       return { text: JSON.stringify({
         title: "MOCK: Push/Pull/Legs Split",
         description: "Ein 3-Tage Push/Pull/Legs Trainingsplan mit progressivem Aufbau.",
         sessions: [{
           dayTitle: "Montag: Push (Brust, Schulter, Trizeps)",
           focus: "Push & Core",
           duration: "60m",
           exercises: [
             { name: "Bankdrücken", sets: 4, reps: "8-10", rest: 120, notes: "Kontrolliertes Absenken", suggestedWeight: "60kg", equipment: "Langhantel", instructions: ["Schulterblätter zusammen", "Stange zur Brust absenken", "Explosiv drücken"] },
             { name: "Schrägbankdrücken", sets: 3, reps: "10-12", rest: 90, notes: "30° Neigung", suggestedWeight: "20kg", equipment: "Kurzhanteln", instructions: ["Bank auf 30° einstellen", "Hanteln kontrolliert senken"] },
             { name: "Schulterdrücken", sets: 3, reps: "10-12", rest: 90, notes: "Nicht ins Hohlkreuz", suggestedWeight: "15kg", equipment: "Kurzhanteln", instructions: ["Stehend oder sitzend", "Hanteln über Kopf drücken"] },
             { name: "Seitheben", sets: 3, reps: "12-15", rest: 60, notes: "Leichtes Gewicht, saubere Form", suggestedWeight: "8kg", equipment: "Kurzhanteln", instructions: ["Leicht vorbeugen", "Arme bis Schulterhöhe heben"] },
             { name: "Trizeps Dips", sets: 3, reps: "10-12", rest: 60, notes: "Volle Streckung", suggestedWeight: "Körpergewicht", equipment: "Barren", instructions: ["Ellbogen eng am Körper", "Kontrolliert absenken"] }
           ]
         }, {
           dayTitle: "Mittwoch: Pull (Rücken, Bizeps)",
           focus: "Pull & Grip",
           duration: "55m",
           exercises: [
             { name: "Klimmzüge", sets: 4, reps: "6-8", rest: 120, notes: "Schulterbreiter Griff", suggestedWeight: "Körpergewicht", equipment: "Klimmzugstange", instructions: ["Hängen mit gestreckten Armen", "Kinn über die Stange ziehen"] },
             { name: "Langhantelrudern", sets: 4, reps: "8-10", rest: 90, notes: "Rücken gerade halten", suggestedWeight: "50kg", equipment: "Langhantel", instructions: ["45° Oberkörperneigung", "Stange zum Bauchnabel ziehen"] },
             { name: "Latzug", sets: 3, reps: "10-12", rest: 90, notes: "Breiter Griff", suggestedWeight: "45kg", equipment: "Kabelzug", instructions: ["Stange zur oberen Brust ziehen", "Kontrolliert zurücklassen"] },
             { name: "Bizeps Curls", sets: 3, reps: "10-12", rest: 60, notes: "Keine Schwungbewegung", suggestedWeight: "12kg", equipment: "Kurzhanteln", instructions: ["Ellbogen fixiert", "Volle Kontraktion oben"] },
             { name: "Face Pulls", sets: 3, reps: "15", rest: 60, notes: "Für Schulterstabilität", suggestedWeight: "15kg", equipment: "Kabelzug", instructions: ["Seil auf Gesichtshöhe ziehen", "Schulterblätter zusammen"] }
           ]
         }, {
           dayTitle: "Freitag: Legs (Beine & Core)",
           focus: "Lower Body & Core",
           duration: "65m",
           exercises: [
             { name: "Kniebeugen", sets: 4, reps: "8-10", rest: 120, notes: "Mindestens parallel", suggestedWeight: "70kg", equipment: "Langhantel", instructions: ["Schulterbreiter Stand", "Hüfte nach hinten/unten", "Knie über Zehenspitzen"] },
             { name: "Rumänisches Kreuzheben", sets: 4, reps: "8-10", rest: 90, notes: "Dehnung in der Beinrückseite spüren", suggestedWeight: "60kg", equipment: "Langhantel", instructions: ["Leicht gebeugte Knie", "Hüfte nach hinten schieben"] },
             { name: "Beinpresse", sets: 3, reps: "12-15", rest: 90, notes: "Voller Bewegungsumfang", suggestedWeight: "120kg", equipment: "Maschine", instructions: ["Füße schulterbreit", "Knie nicht durchdrücken"] },
             { name: "Wadenheben", sets: 4, reps: "15-20", rest: 60, notes: "Volle Streckung oben", suggestedWeight: "Körpergewicht", equipment: "Stufe", instructions: ["Auf Kante stellen", "Fersen maximal senken und heben"] },
             { name: "Plank", sets: 3, reps: "45-60s", rest: 45, notes: "Körperspannung halten", suggestedWeight: "Körpergewicht", equipment: "Ohne", instructions: ["Unterarmstütz", "Hüfte nicht durchhängen lassen"] }
           ]
         }],
         recoveryTips: ["Genug schlafen (7-9h)", "Aktiv erholen (Spaziergang, Dehnen)", "Ausreichend Protein (1.6-2.2g/kg)", "Mindestens 48h zwischen gleichen Muskelgruppen"]
       })};
    }
    
    if (prompt.includes("Analysiere Gesundheitstrends")) {
       return { text: JSON.stringify([
         { title: "MOCK: Schrittziel erreicht", detail: "Du bist in den letzten Tagen sehr aktiv gewesen.", category: "steps", impact: "positive" },
         { title: "MOCK: Herzfrequenz normal", detail: "Dein Ruhepuls ist konstant.", category: "vitals", impact: "neutral" },
         { title: "MOCK: Schlaf optimieren", detail: "Achte auf konstantere Schlafzeiten für bessere Regeneration.", category: "regeneration", impact: "neutral" }
       ])};
    }
    
    if (prompt.includes("ungeplante Mahlzeit")) {
       return { text: JSON.stringify({
         dinner: { name: "Angepasstes Mock Abendessen", ingredients: ["Salat", "Geringere Kohlenhydrate"], instructions: ["Zubereiten"], calories: 300, protein: 20, carbs: 10, fats: 15, prepTime: "10m", requiredAppliances: [] }
       })};
    }
    
    if (prompt.includes("Analysiere Trainingsfortschritt")) {
       return { text: "MOCK: Du hast dich in den letzten Einheiten gesteigert. Sehr gut!" };
    }
    
    if (prompt.includes("Trainingsfokus vor")) {
       return { text: JSON.stringify({ availableDays: ["Montag", "Mittwoch", "Freitag"], suggestion: "MOCK: 3-Tage Ganzkörperplan wird empfohlen." })};
    }
    
    if (prompt.includes("Analysiere den Gesamtfortschritt")) {
       return { text: JSON.stringify([
         { title: "MOCK: Gewicht stabil", summary: "Gute Entwicklung", detail: "Dein Gewicht hält sich im Zielbereich.", impact: "positive", category: "weight" }
       ])};
    }
    
    if (prompt.includes("alternative Übung") || prompt.includes("Alternative exercise")) {
       return { text: JSON.stringify({
         name: "MOCK: Kurzhantel Fliegende",
         sets: 4,
         reps: "10-12",
         rest: 90,
         notes: "Kontrollierte Bewegung, Dehnung in der unteren Position spüren",
         suggestedWeight: "14kg",
         equipment: "Kurzhanteln",
         instructions: ["Auf Flachbank legen", "Kurzhanteln mit leicht gebeugten Armen seitlich absenken", "Brustmuskeln zusammendrücken und Hanteln wieder nach oben führen"]
       })};
    }

    console.log("Mock Gemini: Unbekannter Prompt", prompt);
    return { text: "{}" };
  }

  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent(params);
      if (!response || !response.text) {
          throw new Error("Empty response from AI");
      }
      return response;
    } catch (error: any) {
      lastError = error;
      const errorMsg = error?.message || "";
      const isRateLimit = errorMsg.includes('429') || error?.status === 429;
      const isRpcError = errorMsg.includes('500') || errorMsg.includes('Rpc failed');
      
      if ((isRateLimit || isRpcError) && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
        console.warn(`Gemini API Error (${isRpcError ? '500' : '429'}). Retrying in ${Math.round(delay)}ms... (Attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export const analyzeHealthData = async (profile: UserProfile, healthData: HealthData | null, lang: Language): Promise<AIAnalysis> => {
  const goalsList = profile.goals.join(", ");
  const prompt = `Analysiere Gesundheitsprofil für ${profile.name}: Alter: ${profile.age}, Gewicht: ${profile.weight}kg, Ziele: ${goalsList}. Gib eine motivierende Zusammenfassung und tägliche Nährstoffziele zurück. ${getLangInstruction(lang)}`;

  const response = await callGeminiWithRetry({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
          targets: {
            type: Type.OBJECT,
            properties: {
              maintenanceCalories: { type: Type.NUMBER },
              calories: { type: Type.NUMBER },
              protein: { type: Type.NUMBER },
              carbs: { type: Type.NUMBER },
              fats: { type: Type.NUMBER },
              water: { type: Type.NUMBER }
            },
            required: ["maintenanceCalories", "calories", "protein", "carbs", "fats", "water"]
          }
        },
        required: ["summary", "recommendations", "targets"]
      }
    }
  }, 3, profile.mockMode);
  return JSON.parse(extractJson(response.text));
};

export const generateMealPlan = async (
  profile: UserProfile, 
  targets: any, 
  preferences: NutritionPreferences,
  lang: Language
): Promise<WeeklyMealPlan> => {
  const days = preferences.days && preferences.days.length > 0 ? preferences.days : ['Montag'];
  const numTemplates = preferences.planVariety === 'SAME_EVERY_DAY' ? 1 : (preferences.planVariety === 'TWO_DAY_ROTATION' ? 2 : Math.min(days.length, 7));

  const plannedRecipes = profile.likedRecipes?.filter(r => r.isPlannedForWeek) || [];

  const prompt = `Erstelle genau ${numTemplates} verschiedene Tages-Templates für einen Ernährungsplan.
  ZIELE PRO TAG: Kalorien: ${targets.calories}, Makros: ${targets.protein}g P, ${targets.carbs}g C, ${targets.fats}g F.
  WICHTIGE REGELN FÜR ZUTATEN: Jede Zutat MUSS im Format "Menge Einheit Name" angegeben werden (z.B. "200 g Skyr").
  PRÄFERENZEN: ${preferences.preferredIngredients.join(", ")}, AUSSCHLUSS: ${preferences.excludedIngredients.join(", ")}.
  VORHANDENE REZEPTE FÜR DIE WOCHE (Diese MÜSSEN im Wochenplan vorkommen): ${plannedRecipes.map(r => r.name).join(", ")}.
  ${getLangInstruction(lang)}`;

  const response = await callGeminiWithRetry({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      thinkingConfig: { thinkingBudget: 2000 },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            templateId: { type: Type.NUMBER },
            plan: {
              type: Type.OBJECT,
              properties: {
                breakfast: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, ingredients: { type: Type.ARRAY, items: { type: Type.STRING } }, instructions: { type: Type.ARRAY, items: { type: Type.STRING } }, calories: { type: Type.NUMBER }, protein: { type: Type.NUMBER }, carbs: { type: Type.NUMBER }, fats: { type: Type.NUMBER }, prepTime: { type: Type.STRING }, requiredAppliances: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ["name", "ingredients", "instructions", "calories", "protein", "carbs", "fats", "prepTime", "requiredAppliances"] },
                lunch: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, ingredients: { type: Type.ARRAY, items: { type: Type.STRING } }, instructions: { type: Type.ARRAY, items: { type: Type.STRING } }, calories: { type: Type.NUMBER }, protein: { type: Type.NUMBER }, carbs: { type: Type.NUMBER }, fats: { type: Type.NUMBER }, prepTime: { type: Type.STRING }, requiredAppliances: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ["name", "ingredients", "instructions", "calories", "protein", "carbs", "fats", "prepTime", "requiredAppliances"] },
                dinner: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, ingredients: { type: Type.ARRAY, items: { type: Type.STRING } }, instructions: { type: Type.ARRAY, items: { type: Type.STRING } }, calories: { type: Type.NUMBER }, protein: { type: Type.NUMBER }, carbs: { type: Type.NUMBER }, fats: { type: Type.NUMBER }, prepTime: { type: Type.STRING }, requiredAppliances: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ["name", "ingredients", "instructions", "calories", "protein", "carbs", "fats", "prepTime", "requiredAppliances"] },
                snack: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, ingredients: { type: Type.ARRAY, items: { type: Type.STRING } }, instructions: { type: Type.ARRAY, items: { type: Type.STRING } }, calories: { type: Type.NUMBER }, protein: { type: Type.NUMBER }, carbs: { type: Type.NUMBER }, fats: { type: Type.NUMBER }, prepTime: { type: Type.STRING }, requiredAppliances: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ["name", "ingredients", "instructions", "calories", "protein", "carbs", "fats", "prepTime", "requiredAppliances"] }
              },
              required: ["breakfast", "lunch", "dinner", "snack"]
            }
          },
          required: ["templateId", "plan"]
        }
      }
    }
  }, 3, profile.mockMode);

  const templates = JSON.parse(extractJson(response.text));
  const finalWeeklyPlan: WeeklyMealPlan = {};
  
  // Distribute planned recipes across days
  let pIdx = 0;
  days.forEach((day, index) => {
    let tIdx = (preferences.planVariety === 'SAME_EVERY_DAY') ? 0 : (preferences.planVariety === 'TWO_DAY_ROTATION' ? index % 2 : index % templates.length);
    const dayPlan = { ...(templates[tIdx] || templates[0]).plan };
    
    // Replace one meal per day with a planned recipe if available
    if (pIdx < plannedRecipes.length) {
      // Find suitable slot (dinner/lunch usually)
      const slot = index % 2 === 0 ? 'dinner' : 'lunch';
      dayPlan[slot] = plannedRecipes[pIdx];
      pIdx++;
    }
    
    finalWeeklyPlan[day] = dayPlan;
  });
  return finalWeeklyPlan;
};

export const generateWorkoutPlan = async (
  profile: UserProfile, 
  lang: Language, 
  availableDays: string[], 
  existing: ExistingWorkout[] = [], 
  logs: WorkoutLog[] = []
): Promise<WorkoutProgram> => {
  const lastLogs = logs.slice(-10);
  
  const prompt = `Erstelle einen personalisierten Trainingsplan für ${profile.name}.
  VERFÜGBARE TAGE: ${availableDays.join(", ")}.
  FESTE KURSE: ${existing.map(e => `${e.day}: ${e.activity}`).join("; ")}.
  
  PROGRESSIVE OVERLOAD REGELN:
  1. Analysiere diese Trainingslogs der letzten Sessions: ${JSON.stringify(lastLogs)}.
  2. Identifiziere Übungen, die der Nutzer bereits gemacht hat.
  3. Erhöhe für diese Übungen im neuen Plan entweder das Gewicht (um ca. 2.5kg) oder die Wiederholungen, um Fortschritt zu erzwingen.
  4. Falls keine Logs vorhanden sind, starte mit soliden Basiswerten für ein ${profile.goals.join("/")} Ziel.
  
  AUFBAU:
  - Erstelle genau eine Session für JEDEN verfügbaren Tag (${availableDays.length} Sessions).
  - Benutze die Wochentage (${availableDays.join("/")}) als Start des 'dayTitle' (z.B. "Montag: Push & Core").
  - Gib für jede Übung an, welches EQUIPMENT (z.B. Langhantel, Kurzhantel, Maschine, Körpergewicht) benötigt wird.
  - Gib für jede Übung eine kurze SCHRITT-FÜR-SCHRITT ANLEITUNG (instructions) an.
  - Gib für jede Übung die empfohlene PAUSE zwischen Sätzen als ZAHL IN SEKUNDEN an (z.B. 60, 90, 120).
  
  ${getLangInstruction(lang)}`;

  const response = await callGeminiWithRetry({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      thinkingConfig: { thinkingBudget: 2000 },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          sessions: { type: Type.ARRAY, items: {
            type: Type.OBJECT,
            properties: {
              dayTitle: { type: Type.STRING },
              focus: { type: Type.STRING },
              duration: { type: Type.STRING },
              exercises: { type: Type.ARRAY, items: {
                type: Type.OBJECT,
                properties: { 
                  name: { type: Type.STRING }, 
                  sets: { type: Type.NUMBER }, 
                  reps: { type: Type.STRING }, 
                  rest: { type: Type.NUMBER }, 
                  notes: { type: Type.STRING },
                  suggestedWeight: { type: Type.STRING },
                  equipment: { type: Type.STRING },
                  instructions: { type: Type.ARRAY, items: { type: Type.STRING } }
                },
                required: ["name", "sets", "reps", "rest", "notes", "equipment", "instructions"]
              }}
            },
            required: ["dayTitle", "focus", "duration", "exercises"]
          }},
          recoveryTips: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["title", "description", "sessions", "recoveryTips"]
      }
    }
  }, 3, profile.mockMode);

  const raw = JSON.parse(extractJson(response.text));
  return {
    ...raw,
    id: `plan_${Date.now()}`,
    dateGenerated: new Date().toISOString()
  };
};

export const suggestAlternativeExercise = async (profile: UserProfile, exercise: Exercise, lang: Language): Promise<Exercise> => {
  const prompt = `Schlage eine alternative Übung vor, die die GLEICHEN Muskelgruppen trainiert wie "${exercise.name}" (Equipment: ${exercise.equipment || 'unbekannt'}).

WICHTIGE REGELN:
1. Die Alternative MUSS ein ANDERES Equipment verwenden als "${exercise.equipment || 'unbekannt'}".
2. Die Alternative muss gleichwertig in Intensität und Trainingsvolumen sein.
3. Passe Gewicht, Sätze und Wiederholungen an das neue Equipment an (z.B. Langhantel 60kg → Kurzhantel 24kg/Seite).
4. Gib eine klare Schritt-für-Schritt Anleitung.
5. Die Übung soll im Fitnessstudio durchführbar sein.

Aktuelle Übung: ${exercise.name}, ${exercise.sets} Sätze × ${exercise.reps} Wdh, Gewicht: ${exercise.suggestedWeight || 'k.A.'}, Pause: ${exercise.rest}s
${getLangInstruction(lang)}`;

  const response = await callGeminiWithRetry({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          sets: { type: Type.NUMBER },
          reps: { type: Type.STRING },
          rest: { type: Type.NUMBER },
          notes: { type: Type.STRING },
          suggestedWeight: { type: Type.STRING },
          equipment: { type: Type.STRING },
          instructions: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
      }
    }
  }, 3, profile.mockMode);
  return JSON.parse(extractJson(response.text));
};

export const analyzeHealthTrends = async (healthData: HealthData, profile: UserProfile, lang: Language): Promise<HealthInsight[]> => {
  const prompt = `Analysiere Gesundheitstrends basierend auf diesen Daten: ${JSON.stringify(healthData.metrics.slice(-14))}. 
  Berücksichtige insbesondere Trends bei Schritten, Herzfrequenz, Schlaf, Gewicht und (falls vorhanden) Blutzucker sowie Körpertemperatur.
  Erstelle genau 5 unterschiedliche Insights, die dem Nutzer helfen, seine Gesundheit zu verbessern oder Fortschritte zu erkennen. 
  ${getLangInstruction(lang)}`;
  
  const response = await callGeminiWithRetry({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            detail: { type: Type.STRING },
            category: { type: Type.STRING, enum: ["steps", "vitals", "weight", "regeneration"] },
            impact: { type: Type.STRING, enum: ["positive", "neutral", "negative"] }
          },
      }
    }
  }, 3, profile.mockMode);
  return JSON.parse(extractJson(response.text));
};

export const adjustDailyPlanAfterException = async (profile: UserProfile, targets: any, exceptionDesc: string, remainingMeals: string[], lang: Language): Promise<Partial<DailyMealPlan>> => {
  const prompt = `Der Benutzer ${profile.name} hat eine ungeplante Mahlzeit gegessen: "${exceptionDesc}". Passe restliche Mahlzeiten an. ${getLangInstruction(lang)}`;
  const response = await callGeminiWithRetry({ model: 'gemini-3-flash-preview', contents: prompt }, 3, profile.mockMode);
  return JSON.parse(extractJson(response.text));
};

export const analyzeWorkoutProgress = async (profile: UserProfile, logs: WorkoutLog[], lang: Language): Promise<string> => {
  const prompt = `Analysiere Trainingsfortschritt: ${JSON.stringify(logs.slice(-10))}. ${getLangInstruction(lang)}`;
  const response = await callGeminiWithRetry({ model: 'gemini-3-flash-preview', contents: prompt }, 3, profile.mockMode);
  return response.text || "Analysefehler.";
};

export const suggestWorkoutPreferences = async (profile: UserProfile, existing: ExistingWorkout[], lang: Language): Promise<{ availableDays: string[], suggestion: string }> => {
  const prompt = `Basierend auf dem Profil von ${profile.name} (Ziele: ${profile.goals.join(", ")}, Aktivitätslevel: ${profile.activityLevel}) und den bereits FESTEN TERMINEN: ${existing.map(e => `${e.day}: ${e.activity}`).join("; ")}, schlage eine optimale Trainingsfrequenz (Wochentage) und einen Trainingsfokus vor. Berücksichtige die festen Termine unbedingt, damit keine Überschneidungen entstehen. ${getLangInstruction(lang)}`;
  
  const response = await callGeminiWithRetry({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          availableDays: { type: Type.ARRAY, items: { type: Type.STRING } },
          suggestion: { type: Type.STRING }
        },
        required: ["availableDays", "suggestion"]
      }
    }
  });
  return JSON.parse(extractJson(response.text));
};

export const analyzeOverallProgress = async (profile: UserProfile, healthData: HealthData | null, logs: WorkoutLog[], lang: Language): Promise<ProgressInsight[]> => {
  const prompt = `Analysiere den Gesamtfortschritt für ${profile.name} seit Beginn des Plans. 
  Profil: ${JSON.stringify(profile)}. 
  Gesundheitsdaten: ${JSON.stringify(healthData?.metrics.slice(-30))}. 
  Workouts: ${JSON.stringify(logs.slice(-10))}. 
  Vergleiche die aktuellen Werte mit den Startwerten. 
  Berücksichtige alle verfügbaren Vitalwerte inklusive Blutzucker und Körpertemperatur für eine ganzheitliche Analyse.
  Erstelle genau 4-5 prägnante Fortschritts-Bubbles (Insights). ${getLangInstruction(lang)}`;
  
  const response = await callGeminiWithRetry({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            summary: { type: Type.STRING, description: "Kurze Zusammenfassung für die Bubble" },
            detail: { type: Type.STRING, description: "Detaillierte Analyse für die Detailansicht" },
            impact: { type: Type.STRING, enum: ["positive", "neutral", "negative"] },
            category: { type: Type.STRING }
          },
      }
    }
  }, 3, profile.mockMode);
  return JSON.parse(extractJson(response.text));
};

export const generateWorkoutCue = async (text: string): Promise<string | undefined> => {
  if (isMockMode()) {
     console.log("Mock TTS prompt:", text);
     return undefined;
  }
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Sage motivierend: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Puck' },
          },
        },
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  } catch (error) {
    console.error("TTS Error:", error);
    return undefined;
  }
};
