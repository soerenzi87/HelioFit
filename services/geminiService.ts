
import { GoogleGenAI, Type, GenerateContentParameters, Modality } from "@google/genai";
import { UserProfile, AIAnalysis, WeeklyMealPlan, NutritionPreferences, WorkoutProgram, ExistingWorkout, WorkoutLog, HealthData, Language, Recipe, DailyMealPlan, HealthMetricEntry, HealthInsight, ProgressInsight } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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

async function callGeminiWithRetry(params: GenerateContentParameters, maxRetries = 3): Promise<any> {
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
  });
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

  const prompt = `Erstelle genau ${numTemplates} verschiedene Tages-Templates für einen Ernährungsplan.
  ZIELE PRO TAG: Kalorien: ${targets.calories}, Makros: ${targets.protein}g P, ${targets.carbs}g C, ${targets.fats}g F.
  WICHTIGE REGELN FÜR ZUTATEN: Jede Zutat MUSS im Format "Menge Einheit Name" angegeben werden (z.B. "200 g Skyr").
  PRÄFERENZEN: ${preferences.preferredIngredients.join(", ")}, AUSSCHLUSS: ${preferences.excludedIngredients.join(", ")}. ${getLangInstruction(lang)}`;

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
  });

  const templates = JSON.parse(extractJson(response.text));
  const finalWeeklyPlan: WeeklyMealPlan = {};
  days.forEach((day, index) => {
    let tIdx = (preferences.planVariety === 'SAME_EVERY_DAY') ? 0 : (preferences.planVariety === 'TWO_DAY_ROTATION' ? index % 2 : index % templates.length);
    finalWeeklyPlan[day] = (templates[tIdx] || templates[0]).plan;
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
                  rest: { type: Type.STRING }, 
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
  });

  const raw = JSON.parse(extractJson(response.text));
  return {
    ...raw,
    id: `plan_${Date.now()}`,
    dateGenerated: new Date().toISOString()
  };
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
          required: ["title", "detail", "category", "impact"]
        }
      }
    }
  });
  return JSON.parse(extractJson(response.text));
};

export const adjustDailyPlanAfterException = async (profile: UserProfile, targets: any, exceptionDesc: string, remainingMeals: string[], lang: Language): Promise<Partial<DailyMealPlan>> => {
  const prompt = `Der Benutzer ${profile.name} hat eine ungeplante Mahlzeit gegessen: "${exceptionDesc}". Passe restliche Mahlzeiten an. ${getLangInstruction(lang)}`;
  const response = await callGeminiWithRetry({ model: 'gemini-3-flash-preview', contents: prompt });
  return JSON.parse(extractJson(response.text));
};

export const analyzeWorkoutProgress = async (logs: WorkoutLog[], lang: Language): Promise<string> => {
  const prompt = `Analysiere Trainingsfortschritt: ${JSON.stringify(logs.slice(-10))}. ${getLangInstruction(lang)}`;
  const response = await callGeminiWithRetry({ model: 'gemini-3-flash-preview', contents: prompt });
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
          required: ["title", "summary", "detail", "impact", "category"]
        }
      }
    }
  });
  return JSON.parse(extractJson(response.text));
};

export const generateWorkoutCue = async (text: string): Promise<string | undefined> => {
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
