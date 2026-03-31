# HelioFit — Claude Code Projektregeln

## Stack
- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS
- **Backend:** Express.js (`server.ts`) mit PostgreSQL (JSONB)
- **AI:** Google Gemini API (`services/geminiService.ts`)
- **Health-Daten:** Zepp (Amazfit), Xiaomi Waage, HealthBridge Connector
- **Auth:** Session-basiert mit bcrypt Passwörter
- **Hosting:** Docker auf Proxmox (lokal), Cloudflare HTTPS (health.soerenzieger.de)
- **Repo:** https://github.com/soerenzi87/HelioFit

## Deployment (KRITISCH)
- **Deploy-Befehl:** `python3 deploy.py` — baut Docker Image remote und startet Container
- **Prod-Server:** 192.168.68.132:8080 (nur lokal erreichbar, via Cloudflare nach außen)
- **Vor jedem Deploy:** `npx tsc --noEmit` ausführen — nie deployen wenn Types fehlschlagen
- **Pre-push Hook:** `.git/hooks/pre-push` blockiert Push bei Type-Fehlern automatisch
- **GitHub Actions:** Gibt es NICHT — der Server ist lokal, nicht von GitHub erreichbar
- Reihenfolge: Code ändern → `npx tsc --noEmit` → `python3 deploy.py` → git commit/push

## Datenbank (KRITISCH)
- **Tabelle:** `user_data` (id INTEGER, data JSONB) — eine Zeile, alle User in einem JSONB-Objekt
- **DB-Key:** IMMER `getDbKey(profile)` verwenden (= `profile.email || profile.name`)
  - NIEMALS `profile.name` direkt als Key nutzen — führt zu Datenverlust!
- **Zugriffspfad:** `data->'email@example.com'->'workoutLogs'` etc.
- **Connection:** DB: `heliofit_db`, User: `heliofit`, Container: `heliofit-db`
- **Save-Mechanismus:** 500ms debounced via `useDbSave()` Hook (`hooks/useDatabase.ts`)
  - Bei State-Änderungen IMMER `setDb()` aufrufen, sonst gehen Daten verloren
- **Reset-Endpoint:** `/api/db/reset` für intentionales Löschen (umgeht Leer-Wert-Schutz)
- **Backup:** Täglicher pg_dump Cronjob um 3:00 Uhr auf Proxmox, 14-Tage-Rotation
  - Script: `/opt/heliofit/backup.sh`, Backups: `/opt/heliofit/backups/`

### DB Safety Regeln
- **Vor jedem UPDATE/DELETE:** Erst SELECT ausführen und Ergebnis dem User zeigen
- **Niemals** nach Timestamp-Pattern löschen — immer nach exaktem Inhalt filtern
- **Bulk-Operationen:** Erst Dry-Run (SELECT mit Zählung), dann User bestätigen lassen
- Datenverlust ist der schlimmste Bug — lieber einmal zu viel fragen als Daten löschen

## Architektur & Modulare Entwicklung

### Prinzip: Kleine, fokussierte Dateien
Neue Features IMMER modular aufbauen — nicht in bestehende große Dateien reinschreiben:
- **Translations** in eigene Datei: `components/<tab>/tabTranslations.ts`
- **Helpers/Constants** extrahieren: `components/<tab>/tabHelpers.ts`
- **Sub-Components** für abgrenzbare UI-Bereiche: `components/<tab>/SubComponent.tsx`
- **Hooks** für wiederverwendbare Logik: `hooks/useXyz.ts`
- **Shared Components** für wiederkehrende Patterns: `components/shared/`

### Warum modular?
- Jede Datei >500 Zeilen kostet bei jeder Änderung tausende Tokens zum Lesen
- Kleine Dateien können gezielt gelesen und geändert werden
- Translations und Helpers ändern sich selten → müssen nicht mitgelesen werden

### Split-Pattern (bewährt)
1. Translations raus → `*Translations.ts` (Record<keyof typeof de, string> Pattern)
2. Constants/Helpers raus → `*Helpers.ts`
3. Abgrenzbare Sub-Components raus (nur wenn Props-Interface übersichtlich bleibt)
4. Thin Container behält State + Wiring, importiert alles andere

### Wann NICHT splitten
- Wenn Sub-Component >10 Props aus Parent-Closures braucht → besser inline lassen
- Beispiel: `BodyCompositionVisual` in HealthTab (zu viele Abhängigkeiten)

## Dateistruktur & Größe

### Hauptdateien
| Datei | Zeilen | Inhalt |
|---|---|---|
| `App.tsx` | ~390 | State-Deklarationen, Hook-Wiring, JSX-Shell |
| `components/WorkoutTab.tsx` | ~720 | Workout Container (Sub-Components in `workout/`) |
| `components/NutritionTab.tsx` | ~1430 | Ernährungsplan Container (Sub-Components in `nutrition/`) |
| `components/HealthTab.tsx` | ~1475 | Health-Metriken, Graphen (Translations extrahiert) |
| `components/SettingsTab.tsx` | ~870 | Profil, Push, HealthBridge (Translations extrahiert) |
| `components/Dashboard.tsx` | ~760 | Übersicht, Tagesziele, Quick-Stats |

→ Bei Änderungen gezielt mit `offset`/`limit` lesen, nicht ganze Datei

### Hooks (aus App.tsx extrahiert)
| Hook | Zweck |
|---|---|
| `hooks/useAuth.ts` | Session Restore, Login, Register, Logout |
| `hooks/useDatabase.ts` | `getDbKey()`, debounced DB-Save |
| `hooks/useAppHandlers.ts` | Alle Handler (Health Sync, Workout, Nutrition, Recovery) |

### Sub-Component Verzeichnisse
| Verzeichnis | Inhalt |
|---|---|
| `components/workout/` | LiveSession, WorkoutHistory, WorkoutEngine, Translations, Helpers |
| `components/nutrition/` | NutritionHistory, NutritionModals, Translations, Helpers |
| `components/health/` | healthTranslations |
| `components/settings/` | settingsTranslations |
| `components/shared/` | ModalWrapper (wiederverwendbarer Modal-Overlay) |

### Services (Business Logic)
| Service | Zweck |
|---|---|
| `geminiService.ts` | Alle AI-Aufrufe (Workout, Nutrition, Recovery, Korrelation) |
| `recoveryService.ts` | Recovery Score Berechnung (HRV, Schlaf, Ruhepuls) |
| `aggregationService.ts` | Pearson-R Korrelationen |
| `healthBridgeService.ts` | Zepp/Xiaomi Sync |
| `pushNotificationService.ts` | PWA Push Notifications |
| `calendarService.ts` | ICS Export |
| `authService.ts` | Login/Logout/Session |

### Routes
- `routes/healthbridge/` — HealthBridge API (sync, tokens, scale, query)

## UI & i18n
- **Sprachen:** DE + EN, umschaltbar, über `t`-Objekte (kein i18n-Framework)
- **Translation-Pattern:** `const t = getXyzTranslations(language)` aus separater Datei
  - Type: `Record<keyof typeof de, string>` — vermeidet Literal-Type-Konflikte zwischen DE/EN
  - Maps (sourcesMap, goalsMap etc.) als `Record<string, string>` typen
- **Design:** Dark Theme, Tailwind Utility Classes, abgerundete Karten
- **Mobile:** Optimiert für 375px (iPhone SE Mindestbreite)
- **Icons:** FontAwesome (`fas fa-*`)
- Bei neuen UI-Texten IMMER beide Sprachen im `t`-Objekt ergänzen

## Code-Splitting & Performance
- **React.lazy** für alle Tab-Components (Dashboard, Nutrition, Workout, Health, Settings, Admin, UserProfileForm)
- `<Suspense>` Wrapper mit Spinner-Fallback um jeden lazy-loaded Bereich
- **WorkoutTab** bleibt immer mounted (`display: block/none`) — Timer-State darf nicht verloren gehen
- **Bundle:** Initial ~770 kB, Tabs werden on-demand nachgeladen (je 8-84 kB)
- Neue Tabs/große Komponenten IMMER als lazy-loaded Component anlegen

## Bekannte Patterns & Konventionen
- **Bodyweight-Übungen:** Erkennung über `suggestedWeight` ("Körpergewicht"/"BW"), `equipment` ("Ohne"), oder Übungsname
- **Ad-hoc Aktivitäten:** `isAdHoc: true` im WorkoutLog, `exercises: []`, Kalorien via AI geschätzt
- **Recovery Score:** Berechnet aus HRV/Schlaf/Ruhepuls vom Folgetag vs. 7-Tage-Baseline. `pending` wenn Health-Daten fehlen
- **Meal Replacement:** `replacedMeals`-Objekt im Profil für getauschte Mahlzeiten
- **Korrelationen:** Standardmäßig eingeklappt (HealthTab)
- **Exercise Swap:** 3 AI-generierte Alternativen als Draft-Overlay

## Design System
- **Theme:** Dark (bg `#0f172a` → `#1a1f26`), keine Light-Mode-Unterstützung
- **Karten:** `bg-[#1a1f26]` oder `bg-slate-800/30`, Border `border-white/5` bis `border-white/10`
- **Rundungen:** Große Karten `rounded-[2rem] sm:rounded-[3.5rem]`, kleine Elemente `rounded-xl` bis `rounded-2xl`
- **Akzentfarben:**
  - Indigo (`indigo-500/600`) — Primär-Aktionen, Links, Hauptnavigation
  - Emerald (`emerald-500`) — Erfolg, abgeschlossene Sätze, Bodyweight
  - Orange (`orange-500`) — Kalorien, Training Load
  - Violet (`violet-500`) — AI-Features, History
  - Red (`red-500`) — Fehler, übersprungene Sätze
  - Amber (`amber-500`) — Vorschläge, Warnungen
- **Labels/Überschriften:** `text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500`
- **Große Zahlen:** `text-3xl font-black text-white`
- **Buttons:** `font-black uppercase text-[10px] tracking-widest`, Padding `px-6 py-4` bis `px-8 py-4`
- **Modals:** Fixed overlay `z-[300] bg-[#0f172a]/80 backdrop-blur-xl`, zentrierte Karte

## Mobile First (KRITISCH)
- **Mindestbreite:** 375px (iPhone SE) — JEDE neue UI-Komponente muss dort funktionieren
- **Inputs:** Mindestens `text-base` (16px) auf Mobile — verhindert iOS Auto-Zoom beim Fokussieren
- **Input-Felder mit Einheit (kg, min etc.):** Rechts-Padding für Einheit reservieren (`pr-8 sm:pr-10`), Einheit absolut positioniert
- **Grids:** Maximal `sm:grid-cols-2` für interaktive Elemente (Inputs, Karten mit Eingaben). `grid-cols-3` nur für reine Anzeige-Elemente (Stats, Badges)
- **Text:** Lange deutsche Wörter abkürzen oder umbrechen ("Benachrichtigungen" → "Push")
- **Padding/Margins:** `p-3 sm:p-6` oder `p-4 sm:p-8` — auf Mobile immer kompakter
- **Touch Targets:** Mindestens 44×44px für klickbare Elemente
- **Tailwind Breakpoints:** `sm:` (640px), `md:` (768px), `lg:` (1024px) — Default-Styles sind immer Mobile

## Code-Stil
- Code & Kommentare: Englisch
- Kommunikation mit dem User: Deutsch
- Keine unnötigen Kommentare, Docstrings oder Type-Annotations hinzufügen
- Bestehende Patterns folgen statt neue erfinden
- `npm run lint` = `tsc --noEmit`

## Häufige Fehlerquellen (aus Erfahrung)
1. `profile.name` statt `getDbKey(profile)` → Daten in falschem DB-Key
2. `setDb()` vergessen nach State-Änderung → Daten gehen beim Reload verloren
3. "Woche abschließen" darf KEINE Fake-Logs generieren — nur Plan archivieren
4. Tailwind `p-3 pr-9 sm:p-4` → Shorthand überschreibt spezifisches Padding auf Breakpoints. Lieber `py-3 pl-3 pr-9 sm:py-4 sm:pl-4 sm:pr-10`
5. `suggestedWeight.replace(/[^0-9.]/g, '')` macht "2x14kg" zu "214" → `parseSuggestedWeight()` nutzen
6. Grid `md:grid-cols-3` ist auf Mobile zu eng für Inputs → max `sm:grid-cols-2`
