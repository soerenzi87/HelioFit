import { GoogleGenAI, Type, GenerateContentParameters, Modality } from "@google/genai";
import { UserProfile, AIAnalysis, WeeklyMealPlan, NutritionPreferences, WorkoutProgram, ExistingWorkout, WorkoutLog, HealthData, Language, Recipe, DailyMealPlan, HealthMetricEntry, HealthInsight, ProgressInsight, Exercise, ManualWorkoutHistoryInterpretation, AggregatedHealthSummary, AggregatedWorkoutSummary, AggregatedProfileSummary, CorrelationInsight } from "../types";
import { aggregateHealthMetrics, aggregateWorkoutLogs, aggregateProfile, getContextPreset, buildCorrelationDataset } from "./aggregationService";
import { callAI, resolveProvider, schemaToDescription, AIProvider } from "./aiProviderService";

function resolveGeminiApiKey(profile?: UserProfile): string | undefined {
  return profile?.aiConfig?.geminiKey || process.env.API_KEY || process.env.GEMINI_API_KEY;
}

function getAiClient(apiKey?: string): GoogleGenAI {
  const key = apiKey || process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("No Gemini API key found. Please add it in the settings.");
  }
  return new GoogleGenAI({ apiKey: key });
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

function parseNumericValue(value?: string): number {
  if (!value) return 0;
  const normalized = value.replace(',', '.');
  const match = normalized.match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function isBodyweightExercise(name: string): boolean {
  const lower = name.toLowerCase();
  return ['klimm', 'pull', 'chin', 'dip', 'plank', 'situp', 'sit-up', 'hanging leg raise', 'leg raise', 'crunch'].some(token => lower.includes(token));
}

function normalizeSet(weightValue: string | undefined, repsValue: string | undefined, exerciseName: string) {
  const weightText = weightValue || (isBodyweightExercise(exerciseName) ? 'BW' : undefined);
  const repsText = repsValue;
  return {
    weight: parseNumericValue(weightText),
    reps: parseNumericValue(repsText),
    weightText,
    repsText,
  };
}

function parseDetailExercise(detail: string) {
  const cleaned = detail.trim();
  const match = cleaned.match(/^(.+?)\s+(\d+)x([0-9]+s?|[0-9]+)$/i);
  if (!match) {
    return {
      exerciseName: cleaned,
      sets: [normalizeSet(undefined, undefined, cleaned)],
    };
  }
  const [, name, setsCountRaw, repsRaw] = match;
  const setsCount = Number(setsCountRaw) || 1;
  return {
    exerciseName: name.trim(),
    sets: Array.from({ length: setsCount }, () => normalizeSet(undefined, repsRaw, name.trim())),
  };
}

function buildWorkoutLogsFromStructuredHistory(historyText: string): WorkoutLog[] | null {
  try {
    const parsed = JSON.parse(historyText);
    if (!parsed || !Array.isArray(parsed.weeks)) return null;

    const logs: WorkoutLog[] = [];

    for (const week of parsed.weeks) {
      const days = week?.days || {};
      for (const [dayKey, dayValue] of Object.entries<any>(days)) {
        if (!dayValue || !dayValue.date) continue;

        const exercises = Array.isArray(dayValue.exercises) ? dayValue.exercises.flatMap((exercise: any) => {
          if (Array.isArray(exercise?.details) && exercise.details.length > 0) {
            return exercise.details.map((detail: string) => parseDetailExercise(detail));
          }

          const setValues = Array.isArray(exercise?.sets) ? exercise.sets : [];
          const weightValues = Array.isArray(exercise?.weight)
            ? exercise.weight
            : Array.from({ length: Math.max(setValues.length, 1) }, () => exercise?.weight);

          const normalizedSets = setValues.length > 0
            ? setValues.map((setRep: string, idx: number) => normalizeSet(weightValues[idx] || weightValues[0], setRep, exercise.name))
            : [normalizeSet(Array.isArray(exercise?.weight) ? exercise.weight[0] : exercise?.weight, undefined, exercise.name)];

          return [{
            exerciseName: exercise.name,
            sets: normalizedSets,
          }];
        }) : [];

        logs.push({
          date: new Date(dayValue.date).toISOString(),
          sessionTitle: `${String(dayKey).charAt(0).toUpperCase()}${String(dayKey).slice(1)}`,
          exercises,
        });
      }
    }

    return logs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  } catch {
    return null;
  }
}

let _mockMode = false;
export function setMockMode(enabled: boolean) { _mockMode = enabled; }
export function isMockMode(): boolean { return _mockMode || process.env.USE_MOCK_GEMINI === 'true'; }

async function callGeminiWithRetry(
  params: GenerateContentParameters,
  maxRetries = 3,
  forceMock = false,
  apiKey?: string,
  profile?: UserProfile
): Promise<any> {
  // ── Route to OpenAI / Claude if preferred ──
  if (!forceMock && !isMockMode() && profile) {
    try {
      const { provider } = resolveProvider(profile);
      if (provider !== 'gemini') {
        const prompt = typeof params.contents === 'string' ? params.contents : JSON.stringify(params.contents);
        const jsonSchema = params.config?.responseSchema;
        const result = await callAI({ prompt, jsonSchema, maxRetries, profile });
        return result; // { text: "..." }
      }
    } catch {
      // Fall through to Gemini if provider resolution fails
    }
  }

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
    
    if (prompt.includes("personalisierten Trainingsplan") || prompt.includes("Trainingsplan für")) {
       return { text: JSON.stringify({
         title: "MOCK: Push/Pull/Legs Split",
         description: "Ein 3-Tage Push/Pull/Legs Trainingsplan mit progressivem Aufbau.",
         sessions: [{
           dayTitle: "Montag: Push (Brust, Schulter, Trizeps)",
           focus: "Push & Core",
           duration: "60m",
           warmup: ["5 Min. leichtes Rudern oder Crosstrainer", "2x15 Arm-Kreisen (vorwärts & rückwärts)", "2x15 Band Pull-Aparts", "10 Liegestütze mit langsamer Ausführung"],
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
           warmup: ["5 Min. Ruderergometer leicht", "2x15 Schulter-Dislocates mit Band", "2x10 Cat-Cow Mobilisation", "Dead Hangs 2x20 Sek."],
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
           warmup: ["5 Min. Fahrrad-Ergometer leicht", "2x10 Hüftkreisen (jede Richtung)", "2x10 Goblet Squats mit leichtem Gewicht", "Beinpendeln frontal & seitlich je 10/Seite"],
           exercises: [
             { name: "Kniebeugen", sets: 4, reps: "8-10", rest: 120, notes: "Mindestens parallel", suggestedWeight: "70kg", equipment: "Langhantel", instructions: ["Schulterbreiter Stand", "Hüfte nach hinten/unten", "Knie über Zehenspitzen"] },
             { name: "Rumänisches Kreuzheben", sets: 4, reps: "8-10", rest: 90, notes: "Dehnung in der Beinrückseite spüren", suggestedWeight: "60kg", equipment: "Langhantel", instructions: ["Leicht gebeugte Knie", "Hüfte nach hinten schieben"] },
             { name: "Beinpresse", sets: 3, reps: "12-15", rest: 90, notes: "Voller Bewegungsumfang", suggestedWeight: "120kg", equipment: "Maschine", instructions: ["Füße schulterbreit", "Knie nicht durchdrücken"] },
             { name: "Wadenheben", sets: 4, reps: "15-20", rest: 60, notes: "Volle Streckung oben", suggestedWeight: "Körpergewicht", equipment: "Stufe", instructions: ["Auf Kante stellen", "Fersen maximal senken und heben"] },
             { name: "Plank", sets: 3, reps: "45-60s", rest: 45, notes: "Körperspannung halten", suggestedWeight: "Körpergewicht", equipment: "Ohne", instructions: ["Unterarmstütz", "Hüfte nicht durchhängen lassen"] }
           ]
         }],
         recoveryTips: ["Genug schlafen (7-9h)", "Aktiv erholen (Spaziergang, Dehnen)", "Ausreichend Protein (1.6-2.2g/kg)", "Mindestens 48h zwischen gleichen Muskelgruppen"],
         cardioRecommendations: ["2-3x/Woche 30 Min. LISS-Cardio (zügiges Gehen, leichtes Radfahren) an trainingsfreien Tagen für bessere Regeneration und Fettverbrennung.", "1x/Woche 20 Min. HIIT (z.B. Intervallsprints: 30s Sprint / 90s Gehen) nach dem Krafttraining oder separat.", "Tägliche 10.000 Schritte als Basis-Aktivität anstreben — nutze Treppen statt Aufzug.", "An Ruhetagen leichtes Schwimmen oder Yoga (30-45 Min.) für aktive Regeneration."]
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

    if (prompt.includes("Interpretiere die folgende manuell eingetragene Trainingshistorie")) {
      return { text: JSON.stringify({
        summary: "MOCK: Bisher wurde bereits regelmaessig mit Grunduebungen und Hypertrophie-Fokus trainiert.",
        inferredExperienceLevel: "Fortgeschritten",
        estimatedWeeklyFrequency: "3-4 Einheiten pro Woche",
        goalsDetected: ["Muskelaufbau", "Kraft"],
        focusAreas: ["Oberkoerper", "Grunduebungen"],
        limitations: ["Keine klaren Datumsangaben in allen Sessions"],
        parsedEntries: [
          {
            date: "2026-02-10",
            sessionTitle: "Push Session",
            exercise: "Bankdruecken",
            weight: "60 kg",
            reps: "8",
            sets: "3",
            notes: "Saubere Technik"
          }
        ],
        parsedSessions: [
          {
            approximateDate: "2026-02",
            title: "Push Session",
            exercises: ["Bankdruecken", "Schulterdruecken", "Dips"],
            notes: "Solider Volumenblock"
          }
        ],
        recommendations: ["Volumen progressiv steigern", "Unterkoerper-Frequenz im Blick behalten"]
      })};
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

    if (prompt.includes("Schätze die Nährwerte") || prompt.includes("Estimate the nutrition")) {
      return { text: JSON.stringify({
        calories: 520,
        protein: 42,
        carbs: 55,
        fats: 14,
        instructions: ["MOCK: Zutaten vorbereiten und portionieren", "In einer Pfanne bei mittlerer Hitze anbraten", "Mit Gewürzen abschmecken und servieren"]
      })};
    }

    if (prompt.includes("Lies die folgende manuell eingetragene Trainingshistorie") || prompt.includes("Read the following manually entered")) {
      return { text: JSON.stringify([
        {
          date: new Date(Date.now() - 7 * 86400000).toISOString(),
          sessionTitle: "MOCK: Importiertes Training",
          exercises: [
            { exerciseName: "Bankdrücken", sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }, { weight: 60, reps: 6 }] },
            { exerciseName: "Kniebeugen", sets: [{ weight: 80, reps: 5 }, { weight: 80, reps: 5 }, { weight: 80, reps: 5 }] }
          ]
        }
      ])};
    }

    console.log("Mock Gemini: Unbekannter Prompt", prompt);
    return { text: "{}" };
  }

  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const client = getAiClient(apiKey);
      const response = await client.models.generateContent(params);
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
  const ctx = getContextPreset(profile);
  const profileSum = aggregateProfile(profile);
  const healthSum = aggregateHealthMetrics(healthData, ctx.healthDays);

  const prompt = `Analysiere Gesundheitsprofil und berechne optimale Nährstoffziele.
  PROFIL: ${JSON.stringify(profileSum)}.
  GESUNDHEITSDATEN (${healthSum.periodDays} Tage): Schritte/Tag: ${healthSum.avgSteps}, Schlaf: ${healthSum.avgSleep}h, Ruhepuls: ${healthSum.avgRestingHR}, HRV: ${healthSum.avgHRV}${healthSum.weightCurrent ? `, Gewicht: ${healthSum.weightCurrent}kg` : ''}${healthSum.avgBodyFat ? `, KFA: ${healthSum.avgBodyFat}%` : ''}${healthSum.avgBloodGlucose ? `, Blutzucker: ${healthSum.avgBloodGlucose}` : ''}${healthSum.avgSpo2 ? `, SpO2: ${healthSum.avgSpo2}%` : ''}.
  Gib eine motivierende Zusammenfassung und tägliche Nährstoffziele zurück. ${getLangInstruction(lang)}`;

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
  }, 3, profile.mockMode, resolveGeminiApiKey(profile), profile);
  return JSON.parse(extractJson(response.text));
};

export const generateMealPlan = async (
  profile: UserProfile,
  targets: any,
  preferences: NutritionPreferences,
  lang: Language,
  modification?: string
): Promise<WeeklyMealPlan> => {
  const days = preferences.days && preferences.days.length > 0 ? preferences.days : ['Montag'];
  const numTemplates = preferences.planVariety === 'SAME_EVERY_DAY' ? 1 : (preferences.planVariety === 'TWO_DAY_ROTATION' ? 2 : Math.min(days.length, 7));

  const plannedRecipes = profile.likedRecipes?.filter(r => r.isPlannedForWeek) || [];

  // ── Build expanded exclusion list for validation ──
  const excludedList = preferences.excludedIngredients.filter(e => e.trim());
  const excludedLower = excludedList.map(e => e.toLowerCase().trim());

  const fishTerms = ['lachs', 'salmon', 'thunfisch', 'tuna', 'forelle', 'trout', 'kabeljau', 'cod', 'pangasius', 'zander', 'hering', 'makrele', 'sardine', 'dorade', 'barsch', 'heilbutt', 'scholle', 'rotbarsch', 'seelachs', 'sardelle', 'anchovi', 'sushi'];
  const seafoodTerms = ['garnele', 'garnelen', 'shrimp', 'shrimps', 'muschel', 'muscheln', 'krebs', 'hummer', 'tintenfisch', 'calamari', 'oktopus', 'langustine', 'austern', 'krabben', 'scampi'];
  const berryTerms = ['erdbeere', 'erdbeeren', 'himbeere', 'himbeeren', 'blaubeere', 'blaubeeren', 'heidelbeere', 'heidelbeeren', 'brombeere', 'brombeeren', 'johannisbeere', 'johannisbeeren', 'stachelbeere', 'cranberry', 'cranberries', 'acai', 'berry', 'berries'];
  const broccoliTerms = ['brokkoli', 'broccoli', 'brokoli'];

  const expandedExclusions = [...excludedLower];
  if (excludedLower.some(e => e.includes('fisch') || e === 'fish')) expandedExclusions.push(...fishTerms);
  if (excludedLower.some(e => e.includes('meeresfrüchte') || e.includes('meeresfruechte') || e === 'seafood')) expandedExclusions.push(...seafoodTerms);
  if (excludedLower.some(e => e.includes('beeren') || e === 'berries')) expandedExclusions.push(...berryTerms);
  if (excludedLower.some(e => e.includes('brokkoli') || e.includes('broccoli'))) expandedExclusions.push(...broccoliTerms);

  // Helper: check if a meal violates exclusions
  const mealViolatesExclusions = (meal: any): boolean => {
    if (!meal || expandedExclusions.length === 0) return false;
    const text = [meal.name || '', ...(meal.ingredients || [])].join(' ').toLowerCase();
    return expandedExclusions.some(ex => text.includes(ex));
  };

  // ── Build the detailed exclusion list for the prompt (with all expanded terms) ──
  const exclusionPromptLines: string[] = [];
  for (const ex of excludedList) {
    const exLow = ex.toLowerCase().trim();
    if (exLow.includes('fisch') || exLow === 'fish') {
      exclusionPromptLines.push(`- ${ex} (inkl. ALLE Fischarten: Lachs, Thunfisch, Forelle, Kabeljau, Pangasius, Zander, Hering, Makrele, Sardine, Dorade, Barsch, Heilbutt, Scholle, Seelachs, Sushi)`);
    } else if (exLow.includes('meeresfrüchte') || exLow.includes('meeresfruechte')) {
      exclusionPromptLines.push(`- ${ex} (inkl. Garnelen, Shrimps, Muscheln, Hummer, Krabben, Tintenfisch, Calamari, Scampi, Austern)`);
    } else if (exLow.includes('beeren') || exLow === 'berries') {
      exclusionPromptLines.push(`- ${ex} (inkl. Erdbeeren, Himbeeren, Blaubeeren, Heidelbeeren, Brombeeren, Johannisbeeren, Cranberries, Acai)`);
    } else if (exLow.includes('brokkoli') || exLow.includes('broccoli')) {
      exclusionPromptLines.push(`- ${ex} (auch geschrieben als Broccoli, Brokoli)`);
    } else {
      exclusionPromptLines.push(`- ${ex}`);
    }
  }

  const exclusionBlock = exclusionPromptLines.length > 0
    ? `

⛔⛔⛔ ABSOLUT VERBOTENE ZUTATEN — HÖCHSTE PRIORITÄT ⛔⛔⛔
Die folgenden Lebensmittel dürfen in KEINEM einzigen Rezept vorkommen.
Nicht als Hauptzutat, nicht als Beilage, nicht als Topping, nicht als Garnitur, nicht als Sauce-Bestandteil.
Ein Rezept das IRGENDEINE dieser Zutaten enthält ist UNGÜLTIG und wird abgelehnt:
${exclusionPromptLines.join('\n')}

PRÜFE JEDES REZEPT einzeln ob es eine verbotene Zutat enthält bevor du es in die Antwort aufnimmst!`
    : '';

  // ── Determine which slots are taken by planned recipes ──
  const mealTypeToSlot: Record<string, string> = { breakfast: 'breakfast', lunch: 'lunch', dinner: 'dinner', snack: 'snack' };
  // Group planned recipes by their target slot
  const plannedBySlot: Record<string, typeof plannedRecipes> = {};
  for (const r of plannedRecipes) {
    const slot = mealTypeToSlot[r.mealType || ''] || 'dinner';
    if (!plannedBySlot[slot]) plannedBySlot[slot] = [];
    plannedBySlot[slot].push(r);
  }

  // Tell AI which slots to skip
  const slotsToSkip = Object.keys(plannedBySlot);
  const plannedBlock = plannedRecipes.length > 0
    ? `\nFOLGENDE MAHLZEIT-SLOTS WERDEN VOM NUTZER SELBST BEFÜLLT — generiere für diese Slots trotzdem ein Rezept als Fallback, aber der Nutzer hat eigene Rezepte dafür:
${plannedRecipes.map(r => `- Slot "${r.mealType || 'dinner'}": "${r.name}"`).join('\n')}
Generiere für die ANDEREN Slots (${['breakfast', 'lunch', 'dinner', 'snack'].filter(s => !slotsToSkip.includes(s)).join(', ')}) besonders abwechslungsreiche Rezepte.`
    : '';

  const modBlock = modification ? `\n\n🔧 NUTZER-ANPASSUNG: ${modification}\nPasse den gesamten Plan entsprechend dieser Anweisung an. ABER: Die oben genannten VERBOTENEN ZUTATEN haben IMMER Vorrang — verwende NIEMALS verbotene Zutaten, auch nicht bei Anpassungswünschen!` : '';

  const prompt = `Erstelle genau ${numTemplates} verschiedene Tages-Templates für einen Ernährungsplan.
ZIELE PRO TAG: Kalorien: ${targets.calories}, Makros: ${targets.protein}g P, ${targets.carbs}g C, ${targets.fats}g F.
WICHTIGE REGELN FÜR ZUTATEN: Jede Zutat MUSS im Format "Menge Einheit Name" angegeben werden (z.B. "200 g Skyr").
BEVORZUGTE ZUTATEN (verwende diese häufig!): ${preferences.preferredIngredients.join(", ") || 'keine'}.${exclusionBlock}${plannedBlock}
WICHTIG: Jede Mahlzeit innerhalb eines Tages MUSS ein komplett anderes Gericht sein. Keine Wiederholungen!${modBlock}
${getLangInstruction(lang)}`;

  const mealSchema = { type: Type.OBJECT, properties: { name: { type: Type.STRING }, ingredients: { type: Type.ARRAY, items: { type: Type.STRING } }, instructions: { type: Type.ARRAY, items: { type: Type.STRING } }, calories: { type: Type.NUMBER }, protein: { type: Type.NUMBER }, carbs: { type: Type.NUMBER }, fats: { type: Type.NUMBER }, prepTime: { type: Type.STRING }, requiredAppliances: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ["name", "ingredients", "instructions", "calories", "protein", "carbs", "fats", "prepTime", "requiredAppliances"] };

  const response = await callGeminiWithRetry({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      thinkingConfig: { thinkingBudget: 4096 },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            templateId: { type: Type.NUMBER },
            plan: {
              type: Type.OBJECT,
              properties: { breakfast: mealSchema, lunch: mealSchema, dinner: mealSchema, snack: mealSchema },
              required: ["breakfast", "lunch", "dinner", "snack"]
            }
          },
          required: ["templateId", "plan"]
        }
      }
    }
  }, 3, profile.mockMode, resolveGeminiApiKey(profile), profile);

  const templates = JSON.parse(extractJson(response.text));
  const finalWeeklyPlan: WeeklyMealPlan = {};
  const allSlots = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

  // ── Assemble weekly plan ──
  days.forEach((day, index) => {
    const tIdx = (preferences.planVariety === 'SAME_EVERY_DAY') ? 0 : (preferences.planVariety === 'TWO_DAY_ROTATION' ? index % 2 : index % templates.length);
    const dayPlan = { ...(templates[tIdx] || templates[0]).plan };

    // Insert ALL planned recipes into their correct slots on EVERY day
    for (const slot of allSlots) {
      if (plannedBySlot[slot] && plannedBySlot[slot].length > 0) {
        // Cycle through planned recipes for this slot if multiple
        const recipe = plannedBySlot[slot][index % plannedBySlot[slot].length];
        dayPlan[slot] = { ...recipe };
      }
    }

    finalWeeklyPlan[day] = dayPlan;
  });

  // ── HARD VALIDATION: Replace any meal that violates exclusions ──
  if (expandedExclusions.length > 0) {
    // Collect all violation slots
    const violations: { day: string; slot: string; mealName: string }[] = [];
    for (const day of Object.keys(finalWeeklyPlan)) {
      const dayPlan = finalWeeklyPlan[day];
      for (const slot of allSlots) {
        const meal = dayPlan[slot];
        // Skip planned recipes (user's own recipes are exempt)
        if (meal && !plannedRecipes.some(r => r.name === meal.name) && mealViolatesExclusions(meal)) {
          violations.push({ day, slot, mealName: meal.name });
        }
      }
    }

    if (violations.length > 0) {
      console.warn(`[MealPlan] ${violations.length} exclusion violations detected, generating replacements...`, violations.map(v => `${v.day}/${v.slot}: ${v.mealName}`));

      // Generate replacement meals in a single AI call
      const replacementPrompt = `Erstelle ${violations.length} Ersatz-Rezepte für Mahlzeiten die verbotene Zutaten enthalten.

⛔ VERBOTENE ZUTATEN (DÜRFEN NICHT VORKOMMEN):
${exclusionPromptLines.join('\n')}

BEVORZUGTE ZUTATEN: ${preferences.preferredIngredients.join(", ") || 'keine'}
ZIELE PRO MAHLZEIT: Orientiere dich an den Tageszielen (${targets.calories} kcal, ${targets.protein}g P, ${targets.carbs}g C, ${targets.fats}g F) geteilt durch 4.
REGELN: Jede Zutat im Format "Menge Einheit Name" (z.B. "200 g Skyr").

Ersetze folgende Mahlzeiten durch neue Rezepte OHNE verbotene Zutaten:
${violations.map((v, i) => `${i + 1}. ${v.day} ${v.slot}: "${v.mealName}" (ERSETZEN!)`).join('\n')}

${getLangInstruction(lang)}`;

      try {
        const replResponse = await callGeminiWithRetry({
          model: 'gemini-3-flash-preview',
          contents: replacementPrompt,
          config: {
            thinkingConfig: { thinkingBudget: 2048 },
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: mealSchema
            }
          }
        }, 2, profile.mockMode, resolveGeminiApiKey(profile), profile);

        const replacements = JSON.parse(extractJson(replResponse.text));

        // Apply replacements — always fall back if replacement also violates
        violations.forEach((v, i) => {
          if (replacements[i] && !mealViolatesExclusions(replacements[i])) {
            (finalWeeklyPlan[v.day] as any)[v.slot] = replacements[i];
          } else {
            console.warn(`[MealPlan] Replacement for ${v.day}/${v.slot} missing or also violates exclusions, using fallback`);
            (finalWeeklyPlan[v.day] as any)[v.slot] = createSafeFallback(v.slot, targets, preferences.preferredIngredients, expandedExclusions);
          }
        });
      } catch (e) {
        console.error('[MealPlan] Failed to generate replacements, using fallbacks', e);
        // Use safe generic fallbacks for all violations
        violations.forEach(v => {
          (finalWeeklyPlan[v.day] as any)[v.slot] = createSafeFallback(v.slot, targets, preferences.preferredIngredients, expandedExclusions);
        });
      }
    }
  }

  return finalWeeklyPlan;
};

// Safe fallback meals that cannot contain excluded ingredients
function createSafeFallback(slot: string, targets: any, preferred: string[], exclusions: string[] = []): any {
  const cal = Math.round((targets?.calories || 2000) / 4);
  const p = Math.round((targets?.protein || 150) / 4);
  const c = Math.round((targets?.carbs || 200) / 4);
  const f = Math.round((targets?.fats || 60) / 4);
  const usePref = preferred.length > 0 ? preferred[0] : 'Hähnchenbrust';

  const isExcluded = (text: string) => exclusions.some(ex => text.toLowerCase().includes(ex));

  // Multiple options per slot — pick the first that doesn't violate exclusions
  const options: Record<string, any[]> = {
    breakfast: [
      { name: 'Haferflocken mit Skyr und Banane', ingredients: ['80 g Haferflocken', '200 g Skyr', '1 Stk Banane', '10 g Honig'], instructions: ['Haferflocken mit Skyr mischen', 'Banane in Scheiben schneiden und darauf legen', 'Mit Honig beträufeln'] },
      { name: 'Rührei mit Vollkorntoast', ingredients: ['3 Stk Eier', '2 Scheiben Vollkornbrot', '10 g Butter', '1 Prise Salz'], instructions: ['Eier verquirlen und in der Pfanne stocken lassen', 'Toast rösten', 'Zusammen servieren'] },
      { name: 'Naturjoghurt mit Banane und Haferflocken', ingredients: ['200 g Naturjoghurt', '1 Stk Banane', '50 g Haferflocken'], instructions: ['Joghurt in Schüssel geben', 'Banane schneiden', 'Haferflocken darüber streuen'] },
    ],
    lunch: [
      { name: `${usePref}-Reis-Bowl`, ingredients: [`200 g ${usePref}`, '150 g Reis', '100 g Paprika', '50 g Zwiebel', '10 ml Olivenöl'], instructions: ['Reis kochen', `${usePref} anbraten`, 'Gemüse kleinschneiden und dazugeben'] },
      { name: 'Kartoffel-Gemüse-Pfanne mit Ei', ingredients: ['300 g Kartoffeln', '100 g Zucchini', '100 g Paprika', '2 Stk Eier', '10 ml Olivenöl'], instructions: ['Kartoffeln würfeln und anbraten', 'Gemüse dazu', 'Eier unterrühren'] },
      { name: 'Hähnchen-Wrap mit Salat', ingredients: ['200 g Hähnchenbrust', '2 Stk Tortillas', '50 g Salat', '50 g Tomate', '30 g Joghurt-Dressing'], instructions: ['Hähnchen braten und schneiden', 'Wraps füllen und einrollen'] },
    ],
    dinner: [
      { name: `${usePref} mit Kartoffeln und Spinat`, ingredients: [`200 g ${usePref}`, '250 g Kartoffeln', '100 g Spinat', '10 ml Olivenöl'], instructions: ['Kartoffeln kochen', `${usePref} braten`, 'Spinat dünsten'] },
      { name: 'Putenbrust mit Süßkartoffel', ingredients: ['200 g Putenbrust', '250 g Süßkartoffel', '100 g Zucchini', '10 ml Olivenöl'], instructions: ['Süßkartoffel im Ofen backen', 'Putenbrust anbraten', 'Zucchini dünsten'] },
      { name: 'Rindfleisch-Reispfanne', ingredients: ['200 g Rindfleisch', '150 g Reis', '100 g Paprika', '50 g Mais', '10 ml Sojasoße'], instructions: ['Reis kochen', 'Rindfleisch anbraten', 'Gemüse und Soße dazugeben'] },
    ],
    snack: [
      { name: 'Magerquark mit Banane und Honig', ingredients: ['250 g Magerquark', '1 Stk Banane', '10 g Honig'], instructions: ['Quark in Schüssel geben', 'Banane schneiden', 'Honig darüber'] },
      { name: 'Reiswaffeln mit Hüttenkäse', ingredients: ['4 Stk Reiswaffeln', '100 g Hüttenkäse', '1 Prise Salz'], instructions: ['Hüttenkäse auf Reiswaffeln verteilen'] },
      { name: 'Gekochte Eier mit Gurke', ingredients: ['3 Stk Eier', '1 Stk Gurke', '1 Prise Salz'], instructions: ['Eier hart kochen', 'Gurke in Scheiben schneiden'] },
    ],
  };

  const slotOptions = options[slot] || options.lunch;
  const safe = slotOptions.find(opt => {
    const allText = [opt.name, ...opt.ingredients].join(' ');
    return !isExcluded(allText);
  }) || slotOptions[slotOptions.length - 1]; // last resort

  return { ...safe, calories: cal, protein: p, carbs: c, fats: f, prepTime: safe.instructions.length <= 2 ? '5 min' : '20 min', requiredAppliances: [] };
}

export const generateWorkoutPlan = async (
  profile: UserProfile,
  lang: Language,
  availableDays: string[],
  existing: ExistingWorkout[] = [],
  logs: WorkoutLog[] = [],
  sessionDurationMin?: number,
  modificationRequest?: string,
  currentPlan?: WorkoutProgram | null,
  completedSessionTitles?: string[]
): Promise<WorkoutProgram> => {
  const ctx = getContextPreset(profile);
  const workoutSum = aggregateWorkoutLogs(logs, ctx.workoutWeeks, ctx.topExercises);
  const profileSum = aggregateProfile(profile);

  const progressBlock = workoutSum.topExercises.length > 0
    ? `PROGRESSIVE OVERLOAD DATEN (${workoutSum.totalSessions} Sessions, ${workoutSum.periodWeeks} Wochen):
  ${workoutSum.topExercises.map(e => `- ${e.name}: Best ${e.bestWeight}kg, Letzt ${e.lastWeight}kg (${e.lastReps} Wdh), ${e.sessionCount}x trainiert, Trend: ${e.trend}`).join('\n  ')}
  Erhöhe für bekannte Übungen Gewicht (+2.5kg) oder Wiederholungen.`
    : `Keine bisherigen Logs vorhanden. Starte mit soliden Basiswerten für ein ${profile.goals.join("/")} Ziel.`;

  const durationConstraint = sessionDurationMin
    ? `\n  ZEITBUDGET: Jede Session soll ca. ${sessionDurationMin} Minuten dauern (inkl. Aufwärmen). Passe Übungsanzahl und Sätze entsprechend an.`
    : '';

  const modificationBlock = modificationRequest
    ? `\n\n  ÄNDERUNGSWÜNSCHE DES NUTZERS (haben höchste Priorität!):\n  "${modificationRequest}"\n  Berücksichtige diese Wünsche beim Erstellen des Plans.`
    : '';

  // ── Completed sessions context for modification mode ──
  const completedSessions = (completedSessionTitles || []).length > 0 && currentPlan
    ? currentPlan.sessions.filter(s => completedSessionTitles!.includes(s.dayTitle))
    : [];
  const remainingDays = completedSessions.length > 0
    ? availableDays.filter(day => !completedSessions.some(cs => cs.dayTitle.startsWith(day)))
    : availableDays;

  const completedBlock = completedSessions.length > 0
    ? `\n  BEREITS ABSOLVIERTE SESSIONS DIESE WOCHE (NICHT ändern, NICHT erneut generieren!):
  ${completedSessions.map(s => `- ${s.dayTitle} [Fokus: ${s.focus}] — Übungen: ${s.exercises.map(e => e.name).join(', ')}`).join('\n  ')}
  WICHTIG: Generiere NUR Sessions für die VERBLEIBENDEN Tage (${remainingDays.join(", ")}). Vermeide Muskelgruppen-Überschneidungen mit den bereits absolvierten Sessions.`
    : '';

  const daysToGenerate = remainingDays.length > 0 ? remainingDays : availableDays;
  const sessionCount = daysToGenerate.length;

  const prompt = `Erstelle einen personalisierten Trainingsplan.
  PROFIL: ${JSON.stringify(profileSum)}.
  VERFÜGBARE TAGE: ${availableDays.join(", ")}.
  FESTE KURSE: ${existing.map(e => `${e.day}: ${e.activity}`).join("; ")}.

  ${progressBlock}
  ${completedBlock}

  AUFBAU:
  - Erstelle genau eine Session für JEDEN zu generierenden Tag (${sessionCount} Sessions für: ${daysToGenerate.join(", ")}).
  - Benutze die Wochentage (${daysToGenerate.join("/")}) als Start des 'dayTitle' (z.B. "Montag: Push & Core").
  - Gib für jede Übung an, welches EQUIPMENT (z.B. Langhantel, Kurzhantel, Maschine, Körpergewicht) benötigt wird.
  - Gib für jede Übung eine kurze SCHRITT-FÜR-SCHRITT ANLEITUNG (instructions) an.
  - Gib für jede Übung die empfohlene PAUSE zwischen Sätzen als ZAHL IN SEKUNDEN an (z.B. 60, 90, 120).${durationConstraint}

  WARMUP:
  - Gib für jede Session ein kurzes Aufwärmprogramm (warmup) als String-Array an (3-5 Punkte).
  - Das Warmup soll zum jeweiligen Session-Fokus passen (z.B. Schulter-Mobilisation vor Push-Tag, Hüft-Mobilität vor Leg-Tag).
  - Jeder Punkt beschreibt eine Übung mit Dauer/Wiederholungen (z.B. "5 Min. leichtes Rudern", "2x15 Arm-Kreisen", "Band Pull-Aparts 2x15").

  CARDIO-EMPFEHLUNGEN:
  - Gib 3-5 konkrete Cardio-Empfehlungen passend zu den Zielen des Nutzers (${profileSum.goals.join(", ")}).
  - Berücksichtige die Trainingsfrequenz und empfehle Cardio an trainingsfreien Tagen oder als Ergänzung.
  - Nenne konkrete Formen (z.B. LISS, HIIT, Schwimmen, Radfahren) mit Dauer und Intensität.
  ${modificationBlock}
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
              warmup: { type: Type.ARRAY, items: { type: Type.STRING } },
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
            required: ["dayTitle", "focus", "duration", "warmup", "exercises"]
          }},
          recoveryTips: { type: Type.ARRAY, items: { type: Type.STRING } },
          cardioRecommendations: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["title", "description", "sessions", "recoveryTips", "cardioRecommendations"]
      }
    }
  }, 3, profile.mockMode, resolveGeminiApiKey(profile), profile);

  const raw = JSON.parse(extractJson(response.text));

  // Merge back completed sessions (they were excluded from generation)
  if (completedSessions.length > 0) {
    const DAYS_ORDER = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag',
                        'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const getDayOrder = (title: string) => {
      const dayName = title.split(':')[0].trim();
      const idx = DAYS_ORDER.indexOf(dayName);
      return idx >= 0 ? idx % 7 : 99;
    };
    const allSessions = [...completedSessions, ...(raw.sessions || [])];
    allSessions.sort((a: any, b: any) => getDayOrder(a.dayTitle) - getDayOrder(b.dayTitle));
    raw.sessions = allSessions;
  }

  return {
    ...raw,
    id: `plan_${Date.now()}`,
    dateGenerated: new Date().toISOString()
  };
};

export const interpretManualWorkoutHistory = async (
  profile: UserProfile,
  historyText: string,
  lang: Language
): Promise<ManualWorkoutHistoryInterpretation> => {
  const prompt = `Interpretiere die folgende manuell eingetragene Trainingshistorie fuer ${profile.name}.
  Extrahiere daraus Trainingsniveau, typische Frequenz, Ziele, Schwerpunkte, erkennbare Einschraenkungen, wichtige Sessions, einzelne strukturierte Trainingseintraege und konkrete Empfehlungen fuer die naechste Trainingsplanung.
  Formatiere die erkannten Trainingseintraege moeglichst sauber mit Datum, Session-Titel, Uebung, Gewicht, Wiederholungen und Saetzen.
  Wenn Informationen fehlen, kennzeichne Unsicherheiten klar statt zu raten.

  FREITEXT:
  ${historyText}

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
          summary: { type: Type.STRING },
          inferredExperienceLevel: { type: Type.STRING },
          estimatedWeeklyFrequency: { type: Type.STRING },
          goalsDetected: { type: Type.ARRAY, items: { type: Type.STRING } },
          focusAreas: { type: Type.ARRAY, items: { type: Type.STRING } },
          limitations: { type: Type.ARRAY, items: { type: Type.STRING } },
          parsedEntries: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                date: { type: Type.STRING },
                sessionTitle: { type: Type.STRING },
                exercise: { type: Type.STRING },
                weight: { type: Type.STRING },
                reps: { type: Type.STRING },
                sets: { type: Type.STRING },
                notes: { type: Type.STRING }
              },
              required: ["exercise"]
            }
          },
          parsedSessions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                approximateDate: { type: Type.STRING },
                title: { type: Type.STRING },
                exercises: { type: Type.ARRAY, items: { type: Type.STRING } },
                notes: { type: Type.STRING }
              },
              required: ["title", "exercises"]
            }
          },
          recommendations: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: [
          "summary",
          "inferredExperienceLevel",
          "estimatedWeeklyFrequency",
          "goalsDetected",
          "focusAreas",
          "limitations",
          "parsedEntries",
          "parsedSessions",
          "recommendations"
        ]
      }
    }
  }, 3, profile.mockMode, resolveGeminiApiKey(profile), profile);

  return JSON.parse(extractJson(response.text));
};

export const importManualWorkoutHistory = async (
  profile: UserProfile,
  historyText: string,
  lang: Language
): Promise<WorkoutLog[]> => {
  const directLogs = buildWorkoutLogsFromStructuredHistory(historyText);
  if (directLogs && directLogs.length > 0) {
    return directLogs;
  }

  const prompt = `Lies die folgende manuell eingetragene Trainingshistorie fuer ${profile.name} und ueberfuehre sie direkt in eine strukturierte Workout-Historie.
  WICHTIG:
  - Keine Analyse, keine Empfehlungen, keine Zusammenfassung.
  - Uebernimm nur die tatsaechlichen Trainingseinheiten aus dem Text.
  - Erzeuge eine Liste von abgeschlossenen Sessions mit Datum, Session-Titel, Uebungen und Set-Daten.
  - Wenn nur Satz/Wiederholungs-Schema genannt ist, mappe es direkt auf die einzelnen Sets.
  - Wenn Gewicht fehlt, lasse es leer statt zu raten.
  - Wenn das Training klar Bodyweight ist, darf "BW" als weightText verwendet werden.

  FREITEXT:
  ${historyText}

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
            date: { type: Type.STRING },
            sessionTitle: { type: Type.STRING },
            exercises: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  exerciseName: { type: Type.STRING },
                  sets: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        weight: { type: Type.NUMBER },
                        reps: { type: Type.NUMBER },
                        weightText: { type: Type.STRING },
                        repsText: { type: Type.STRING }
                      }
                    }
                  }
                },
                required: ["exerciseName", "sets"]
              }
            }
          },
          required: ["date", "sessionTitle", "exercises"]
        }
      }
    }
  }, 3, profile.mockMode, resolveGeminiApiKey(profile), profile);

  const parsedLogs = JSON.parse(extractJson(response.text)) as WorkoutLog[];
  return parsedLogs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
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
  }, 3, profile.mockMode, resolveGeminiApiKey(profile), profile);
  return JSON.parse(extractJson(response.text));
};

export const analyzeHealthTrends = async (healthData: HealthData, profile: UserProfile, lang: Language): Promise<HealthInsight[]> => {
  const ctx = getContextPreset(profile);
  const healthSum = aggregateHealthMetrics(healthData, ctx.healthDays);

  const prompt = `Analysiere Gesundheitstrends basierend auf aggregierten Daten (${healthSum.periodDays} Tage):
  Schritte/Tag: ${healthSum.avgSteps}, Schlaf: ${healthSum.avgSleep}h, Ruhepuls: ${healthSum.avgRestingHR}, HRV: ${healthSum.avgHRV}.
  Gewicht: ${healthSum.weightStart}kg → ${healthSum.weightCurrent}kg (${healthSum.weightDelta != null ? (healthSum.weightDelta > 0 ? '+' : '') + healthSum.weightDelta : '?'}kg).
  ${healthSum.avgBodyFat ? `KFA: ${healthSum.avgBodyFat}%` : ''}${healthSum.avgBloodGlucose ? `, Blutzucker: ${healthSum.avgBloodGlucose}` : ''}${healthSum.avgBodyTemp ? `, Temperatur: ${healthSum.avgBodyTemp}°C` : ''}${healthSum.avgSpo2 ? `, SpO2: ${healthSum.avgSpo2}%` : ''}${healthSum.avgBloodPressureSys ? `, Blutdruck: ${healthSum.avgBloodPressureSys}/${healthSum.avgBloodPressureDia}` : ''}.
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
    }
  }, 3, profile.mockMode, resolveGeminiApiKey(profile), profile);
  return JSON.parse(extractJson(response.text));
};

export const adjustDailyPlanAfterException = async (profile: UserProfile, targets: any, exceptionDesc: string, remainingMeals: string[], lang: Language): Promise<Partial<DailyMealPlan>> => {
  const prompt = `Der Benutzer ${profile.name} hat eine ungeplante Mahlzeit gegessen: "${exceptionDesc}". Passe restliche Mahlzeiten an. ${getLangInstruction(lang)}`;
  const response = await callGeminiWithRetry({ model: 'gemini-3-flash-preview', contents: prompt }, 3, profile.mockMode, resolveGeminiApiKey(profile), profile);
  return JSON.parse(extractJson(response.text));
};

export interface AdditionalFoodEstimate {
  items: { name: string; calories: number; protein: number; carbs: number; fats: number }[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFats: number;
  adjustedMeals?: Partial<DailyMealPlan>;
  advice?: string;
}

export const estimateAdditionalFood = async (
  profile: UserProfile,
  targets: any,
  foodDescription: string,
  currentDayPlan: DailyMealPlan | undefined,
  remainingMealTypes: string[],
  lang: Language,
): Promise<AdditionalFoodEstimate> => {
  const targetKcal = targets?.calories || 2000;
  const targetProtein = targets?.protein || 150;
  const targetCarbs = targets?.carbs || 200;
  const targetFats = targets?.fats || 60;

  const currentMeals = currentDayPlan ? MEAL_TYPES_CONST
    .filter(t => currentDayPlan[t])
    .map(t => `${t}: ${currentDayPlan[t]!.name} (${Math.round(currentDayPlan[t]!.calories)} kcal, ${Math.round(currentDayPlan[t]!.protein)}g P)`)
    .join(', ') : 'Kein Plan';

  const prompt = `Schätze die Nährwerte für folgendes zusätzlich gegessenes Essen:
"${foodDescription}"

TAGESZIEL: ${targetKcal} kcal, ${targetProtein}g Protein, ${targetCarbs}g Carbs, ${targetFats}g Fett.
BEREITS GEPLANT: ${currentMeals}.
NOCH NICHT GEGESSENE MAHLZEITEN: ${remainingMealTypes.join(', ') || 'alle bereits gegessen'}.

${remainingMealTypes.length > 0 ? `Passe die noch nicht gegessenen Mahlzeiten (${remainingMealTypes.join(', ')}) an, um das Tagesziel trotz des zusätzlichen Essens möglichst zu erreichen. Gib für jede angepasste Mahlzeit ein vollständiges Rezept zurück.` : ''}

Gib einen kurzen Hinweis (advice) wie sich das auf den Tagesplan auswirkt.
${getLangInstruction(lang)}`;

  const response = await callGeminiWithRetry({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                calories: { type: Type.NUMBER },
                protein: { type: Type.NUMBER },
                carbs: { type: Type.NUMBER },
                fats: { type: Type.NUMBER },
              },
              required: ['name', 'calories', 'protein', 'carbs', 'fats'],
            },
          },
          adjustedMeals: {
            type: Type.OBJECT,
            properties: Object.fromEntries(
              remainingMealTypes.map(t => [t, {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  ingredients: { type: Type.ARRAY, items: { type: Type.STRING } },
                  instructions: { type: Type.ARRAY, items: { type: Type.STRING } },
                  calories: { type: Type.NUMBER },
                  protein: { type: Type.NUMBER },
                  carbs: { type: Type.NUMBER },
                  fats: { type: Type.NUMBER },
                  prepTime: { type: Type.STRING },
                  requiredAppliances: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ['name', 'ingredients', 'instructions', 'calories', 'protein', 'carbs', 'fats', 'prepTime', 'requiredAppliances'],
              }])
            ),
          },
          advice: { type: Type.STRING },
        },
        required: ['items', 'advice'],
      },
    },
  }, 3, profile.mockMode, resolveGeminiApiKey(profile), profile);

  const parsed = JSON.parse(extractJson(response.text));
  return {
    items: parsed.items || [],
    totalCalories: (parsed.items || []).reduce((s: number, i: any) => s + (i.calories || 0), 0),
    totalProtein: (parsed.items || []).reduce((s: number, i: any) => s + (i.protein || 0), 0),
    totalCarbs: (parsed.items || []).reduce((s: number, i: any) => s + (i.carbs || 0), 0),
    totalFats: (parsed.items || []).reduce((s: number, i: any) => s + (i.fats || 0), 0),
    adjustedMeals: parsed.adjustedMeals,
    advice: parsed.advice,
  };
};

const MEAL_TYPES_CONST = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

export interface WorkoutAdjustmentDraft {
  exercises: Exercise[];
  summary: string;
}

export const adjustWorkoutSession = async (
  profile: UserProfile,
  currentExercises: Exercise[],
  instruction: string,
  lang: Language,
): Promise<WorkoutAdjustmentDraft> => {
  const exerciseList = currentExercises
    .map(e => `${e.name}: ${e.sets}x${e.reps} (Pause ${e.rest}s)${e.equipment ? `, Gerät: ${e.equipment}` : ''}`)
    .join('\n');

  const prompt = `Aktueller Trainingsplan für heute:
${exerciseList}

Anweisung des Benutzers: "${instruction}"

Passe den Trainingsplan entsprechend an. Du kannst:
- Übungen hinzufügen, entfernen oder ersetzen
- Sätze, Wiederholungen oder Gewicht ändern
- Pausenzeiten anpassen

Gib den KOMPLETTEN angepassten Trainingsplan zurück (alle Übungen, nicht nur die geänderten).
Gib auch eine kurze Zusammenfassung (summary) was geändert wurde.
${getLangInstruction(lang)}`;

  const response = await callGeminiWithRetry({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          exercises: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                sets: { type: Type.NUMBER },
                reps: { type: Type.STRING },
                rest: { type: Type.NUMBER },
                notes: { type: Type.STRING },
                suggestedWeight: { type: Type.STRING },
                equipment: { type: Type.STRING },
              },
              required: ['name', 'sets', 'reps', 'rest', 'notes'],
            },
          },
          summary: { type: Type.STRING },
        },
        required: ['exercises', 'summary'],
      },
    },
  }, 3, profile.mockMode, resolveGeminiApiKey(profile), profile);

  return JSON.parse(extractJson(response.text));
};

export const analyzeWorkoutProgress = async (profile: UserProfile, logs: WorkoutLog[], lang: Language): Promise<string> => {
  const ctx = getContextPreset(profile);
  const workoutSum = aggregateWorkoutLogs(logs, ctx.workoutWeeks, ctx.topExercises);
  const profileSum = aggregateProfile(profile);

  const prompt = `Analysiere Trainingsfortschritt.
  PROFIL: Ziele: ${profileSum.goals.join(', ')}, Aktivität: ${profileSum.activityLevel}.
  TRAINING (${workoutSum.totalSessions} Sessions, ${workoutSum.periodWeeks} Wochen, Ø Volumen: ${workoutSum.avgVolumePerSession}kg):
  ${workoutSum.topExercises.map(e => `- ${e.name}: Best ${e.bestWeight}kg, Letzt ${e.lastWeight}kg (${e.lastReps} Wdh), Trend: ${e.trend}`).join('\n  ')}
  ${getLangInstruction(lang)}`;
  const response = await callGeminiWithRetry({ model: 'gemini-3-flash-preview', contents: prompt }, 3, profile.mockMode, resolveGeminiApiKey(profile), profile);
  return response.text || "Analysefehler.";
};

export const suggestWorkoutPreferences = async (profile: UserProfile, existing: ExistingWorkout[], lang: Language): Promise<{ availableDays: string[], suggestion: string }> => {
  const profileSum = aggregateProfile(profile);
  const prompt = `Basierend auf dem Profil von ${profileSum.name} (Ziele: ${profileSum.goals.join(", ")}, Aktivitätslevel: ${profileSum.activityLevel}) und den bereits FESTEN TERMINEN: ${existing.map(e => `${e.day}: ${e.activity}`).join("; ")}, schlage eine optimale Trainingsfrequenz (Wochentage) und einen Trainingsfokus vor. Berücksichtige die festen Termine unbedingt, damit keine Überschneidungen entstehen. ${getLangInstruction(lang)}`;
  
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
  }, 3, profile.mockMode, resolveGeminiApiKey(profile), profile);
  return JSON.parse(extractJson(response.text));
};

export const analyzeOverallProgress = async (profile: UserProfile, healthData: HealthData | null, logs: WorkoutLog[], lang: Language): Promise<ProgressInsight[]> => {
  const ctx = getContextPreset(profile);
  const profileSum = aggregateProfile(profile);
  const healthSum = aggregateHealthMetrics(healthData, ctx.healthDays);
  const workoutSum = aggregateWorkoutLogs(logs, ctx.workoutWeeks, ctx.topExercises);

  const prompt = `Analysiere den Gesamtfortschritt.
  PROFIL: ${JSON.stringify(profileSum)}.
  GESUNDHEIT (${healthSum.periodDays} Tage): Schritte: ${healthSum.avgSteps}/Tag, Schlaf: ${healthSum.avgSleep}h, Ruhepuls: ${healthSum.avgRestingHR}, HRV: ${healthSum.avgHRV}, Gewicht: ${healthSum.weightStart}→${healthSum.weightCurrent}kg (${healthSum.weightDelta != null ? (healthSum.weightDelta > 0 ? '+' : '') + healthSum.weightDelta : '?'}kg)${healthSum.avgBodyFat ? `, KFA: ${healthSum.avgBodyFat}%` : ''}${healthSum.avgBloodGlucose ? `, Blutzucker: ${healthSum.avgBloodGlucose}` : ''}${healthSum.avgBodyTemp ? `, Temp: ${healthSum.avgBodyTemp}°C` : ''}${healthSum.avgSpo2 ? `, SpO2: ${healthSum.avgSpo2}%` : ''}${healthSum.avgBloodPressureSys ? `, RR: ${healthSum.avgBloodPressureSys}/${healthSum.avgBloodPressureDia}` : ''}.
  TRAINING (${workoutSum.totalSessions} Sessions, ${workoutSum.periodWeeks} Wochen, Ø Volumen: ${workoutSum.avgVolumePerSession}kg):
  ${workoutSum.topExercises.map(e => `- ${e.name}: Best ${e.bestWeight}kg → Letzt ${e.lastWeight}kg, Trend: ${e.trend}`).join('\n  ')}
  Vergleiche aktuelle Werte mit Startwerten. Erstelle genau 4-5 prägnante Fortschritts-Bubbles. ${getLangInstruction(lang)}`;
  
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
    }
  }, 3, profile.mockMode, resolveGeminiApiKey(profile), profile);
  return JSON.parse(extractJson(response.text));
};

export const generateWorkoutCue = async (text: string): Promise<string | undefined> => {
  if (isMockMode()) {
     console.log("Mock TTS prompt:", text);
     return undefined;
  }
  try {
    const response = await getAiClient().models.generateContent({
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

// ── Estimate nutrition for a manually created recipe ──
export const estimateRecipeNutrition = async (
  recipeName: string,
  ingredients: string[],
  lang: Language,
  profile?: UserProfile
): Promise<{ calories: number; protein: number; carbs: number; fats: number; instructions: string[] }> => {
  const prompt = `Schätze die Nährwerte für folgendes Rezept:
  NAME: ${recipeName}
  ZUTATEN: ${ingredients.join(", ")}

  Berechne die Gesamtkalorien und Makronährstoffe für EINE Portion (alle Zutaten zusammen).
  Erstelle außerdem eine kurze Zubereitungsanleitung (3-6 Schritte).
  ${getLangInstruction(lang)}`;

  try {
    const response = await callGeminiWithRetry({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 1024 },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            calories: { type: Type.NUMBER },
            protein: { type: Type.NUMBER },
            carbs: { type: Type.NUMBER },
            fats: { type: Type.NUMBER },
            instructions: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["calories", "protein", "carbs", "fats", "instructions"]
        }
      }
    }, 2, profile?.mockMode ?? false, resolveGeminiApiKey(profile), profile);

    const rawText = response.text;
    if (!rawText) {
      throw new Error("Empty response from AI model");
    }
    const parsed = JSON.parse(extractJson(rawText));
    if (!parsed || typeof parsed.calories !== 'number') {
      throw new Error(`Invalid nutrition response structure: ${rawText.substring(0, 200)}`);
    }
    return parsed;
  } catch (error: any) {
    console.error("estimateRecipeNutrition failed:", error);
    const detail = error?.message || String(error);
    throw new Error(`Nutrition estimation failed: ${detail}`);
  }
};

// ── Correlation Insights AI ───────────────────────────────────────────
export const analyzeCorrelations = async (
  healthData: HealthData,
  workoutLogs: WorkoutLog[],
  profile: UserProfile,
  lang: Language
): Promise<CorrelationInsight[]> => {
  // 1. Call buildCorrelationDataset to get pre-computed correlations
  const preset = getContextPreset(profile);
  const { pairs, dailyData } = buildCorrelationDataset(healthData, preset.healthDays);

  // 2. Filter pairs with |r| >= 0.2 and n >= 5
  const significant = pairs.filter(p => Math.abs(p.r) >= 0.2 && p.n >= 5);

  if (significant.length === 0) {
    return [];
  }

  // 3. Build prompt asking AI to interpret the top correlations
  const pairsSummary = significant
    .slice(0, 8)
    .map(p => `- ${p.nameA} ↔ ${p.nameB}: r=${p.r}, n=${p.n}`)
    .join('\n');

  const sampleData = dailyData.slice(-7).map(d =>
    `${d.date}: ${Object.entries(d).filter(([k]) => k !== 'date').map(([k, v]) => `${k}=${v ?? '-'}`).join(', ')}`
  ).join('\n');

  const prompt = `${getLangInstruction(lang)}

Du bist ein Gesundheits- und Fitness-Datenanalyst. Analysiere die folgenden vorberechneten Korrelationen zwischen Gesundheitsmetriken eines Nutzers.

KORRELATIONEN (Pearson r, vorberechnet):
${pairsSummary}

BEISPIEL-TAGESDATEN (letzte 7 Tage):
${sampleData}

NUTZERPROFIL: ${profile.name}, ${profile.age} Jahre, ${profile.gender}, Ziele: ${profile.goals.join(', ')}, Aktivitätslevel: ${profile.activityLevel}

Für JEDE Korrelation oben, erstelle eine Interpretation:
- title: kurzer, verständlicher Titel
- explanation: Was bedeutet diese Korrelation im Gesundheits-/Fitnesskontext?
- actionable: Konkreter, umsetzbarer Tipp basierend auf dieser Korrelation
- impact: Hat diese Korrelation einen "positive", "neutral" oder "negative" Einfluss auf die Gesundheit?
- strength: "strong" (|r| >= 0.6), "moderate" (|r| >= 0.4), "weak" (|r| >= 0.2)
- direction: "positive" oder "negative" basierend auf dem Vorzeichen von r

Antworte als JSON-Array.`;

  if (isMockMode() || profile.mockMode) {
    return significant.slice(0, 3).map(p => ({
      metricA: p.nameA,
      metricB: p.nameB,
      correlation: p.r,
      strength: Math.abs(p.r) >= 0.6 ? 'strong' as const : Math.abs(p.r) >= 0.4 ? 'moderate' as const : 'weak' as const,
      direction: p.r >= 0 ? 'positive' as const : 'negative' as const,
      title: `${p.nameA} & ${p.nameB} Korrelation`,
      explanation: `MOCK: ${p.nameA} und ${p.nameB} zeigen eine ${p.r >= 0 ? 'positive' : 'negative'} Korrelation (r=${p.r}).`,
      actionable: `MOCK: Achte auf den Zusammenhang zwischen ${p.nameA} und ${p.nameB}.`,
      impact: 'neutral' as const,
    }));
  }

  try {
    // 4. Use callGeminiWithRetry with JSON schema for CorrelationInsight[]
    const response = await callGeminiWithRetry({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 4096 },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              metricA: { type: Type.STRING },
              metricB: { type: Type.STRING },
              title: { type: Type.STRING },
              explanation: { type: Type.STRING },
              actionable: { type: Type.STRING },
              impact: { type: Type.STRING },
              strength: { type: Type.STRING },
              direction: { type: Type.STRING },
            },
            required: ["metricA", "metricB", "title", "explanation", "actionable", "impact", "strength", "direction"],
          },
        },
      },
    }, 3, false, resolveGeminiApiKey(profile), profile);

    const rawText = response.text;
    if (!rawText) return [];

    const parsed: any[] = JSON.parse(extractJson(rawText));

    // 5. Return parsed results, enriching with the computed r values
    return parsed.map((item, idx) => {
      const matchedPair = significant.find(p => p.nameA === item.metricA && p.nameB === item.metricB) || significant[idx];
      return {
        metricA: item.metricA,
        metricB: item.metricB,
        correlation: matchedPair?.r ?? 0,
        strength: item.strength as CorrelationInsight['strength'],
        direction: item.direction as CorrelationInsight['direction'],
        title: item.title,
        explanation: item.explanation,
        actionable: item.actionable,
        impact: item.impact as CorrelationInsight['impact'],
      };
    });
  } catch (error: any) {
    console.error("analyzeCorrelations failed:", error);
    return [];
  }
};

// ── Training Recovery AI Analysis ─────────────────────────────────────
export const analyzeTrainingRecovery = async (
  recoveryEntries: { workoutDate: string; workoutTitle: string; trainingLoad: number; recoveryScore: number; recoveryStatus: string; nextDayHRV?: number; baselineHRV?: number; nextDaySleepHours?: number }[],
  avgRecoveryScore: number,
  avgTrainingLoad: number,
  trend: string,
  profile: UserProfile,
  lang: Language
): Promise<string> => {
  const entriesSummary = recoveryEntries
    .slice(-10)
    .map(e => `${e.workoutDate} | ${e.workoutTitle} | Load: ${e.trainingLoad} | Recovery: ${e.recoveryScore} (${e.recoveryStatus})${e.nextDayHRV != null ? ` | HRV: ${e.nextDayHRV}${e.baselineHRV != null ? `/${e.baselineHRV}` : ''}` : ''}${e.nextDaySleepHours != null ? ` | Sleep: ${e.nextDaySleepHours}h` : ''}`)
    .join('\n');

  const prompt = `${getLangInstruction(lang)}

Du bist ein erfahrener Sportwissenschaftler und Regenerationsexperte. Analysiere die folgenden Trainings- und Erholungsdaten und gib eine detaillierte Einschätzung.

ERHOLUNGSDATEN (letzte Einträge):
${entriesSummary}

ZUSAMMENFASSUNG:
- Durchschnittlicher Recovery Score: ${avgRecoveryScore.toFixed(1)}/100
- Durchschnittliche Trainingsbelastung: ${avgTrainingLoad.toFixed(0)}
- Trend: ${trend}

NUTZERPROFIL: ${profile.name}, ${profile.age} Jahre, ${profile.gender}, Ziele: ${profile.goals.join(', ')}, Aktivitätslevel: ${profile.activityLevel}

Erstelle eine Analyse mit:
1. Bewertung des aktuellen Trainings-Erholungs-Verhältnisses
2. Erkannte Muster (z.B. schlechte Erholung nach bestimmten Trainingsarten)
3. Konkrete Empfehlungen zur Trainingssteuerung
4. Tipps zur Verbesserung der Regeneration
5. Warnzeichen falls Übertraining droht

Antworte als zusammenhängender Fließtext (kein JSON), gut strukturiert mit Absätzen.`;

  if (isMockMode() || profile.mockMode) {
    return lang === 'de'
      ? `MOCK: Dein durchschnittlicher Recovery Score von ${avgRecoveryScore.toFixed(1)} deutet auf eine ${avgRecoveryScore >= 70 ? 'gute' : avgRecoveryScore >= 50 ? 'moderate' : 'verbesserungswürdige'} Erholung hin. Der Trend ist ${trend}. Achte darauf, nach intensiven Einheiten ausreichend Schlaf und Erholung einzuplanen. Deine Trainingsbelastung von durchschnittlich ${avgTrainingLoad.toFixed(0)} ist ${avgTrainingLoad > 500 ? 'hoch — plane regelmäßige Deload-Wochen ein' : 'im normalen Bereich'}.`
      : `MOCK: Your average recovery score of ${avgRecoveryScore.toFixed(1)} indicates ${avgRecoveryScore >= 70 ? 'good' : avgRecoveryScore >= 50 ? 'moderate' : 'room for improvement in'} recovery. The trend is ${trend}. Make sure to get enough sleep and rest after intense sessions. Your average training load of ${avgTrainingLoad.toFixed(0)} is ${avgTrainingLoad > 500 ? 'high — consider regular deload weeks' : 'within normal range'}.`;
  }

  try {
    const response = await callGeminiWithRetry({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 4096 },
      },
    }, 3, false, resolveGeminiApiKey(profile), profile);

    const rawText = response.text;
    if (!rawText) {
      throw new Error("Empty response from AI model");
    }
    return rawText.trim();
  } catch (error: any) {
    console.error("analyzeTrainingRecovery failed:", error);
    const detail = error?.message || String(error);
    throw new Error(`Training recovery analysis failed: ${detail}`);
  }
};
