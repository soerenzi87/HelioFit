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
- **GitHub Actions:** Gibt es NICHT — der Server ist lokal, nicht von GitHub erreichbar
- Reihenfolge: Code ändern → `npx tsc --noEmit` → `python3 deploy.py` → git commit/push

## Datenbank (KRITISCH)
- **Tabelle:** `user_data` (id INTEGER, data JSONB) — eine Zeile, alle User in einem JSONB-Objekt
- **DB-Key:** IMMER `getDbKey(profile)` verwenden (= `profile.email || profile.name`)
  - NIEMALS `profile.name` direkt als Key nutzen — führt zu Datenverlust!
- **Zugriffspfad:** `data->'email@example.com'->'workoutLogs'` etc.
- **Connection:** DB: `heliofit_db`, User: `heliofit`, Container: `heliofit-db`
- **Save-Mechanismus:** 500ms debounced via `saveTimerRef` und `dbRef` in App.tsx
  - Bei State-Änderungen IMMER `setDb()` aufrufen, sonst gehen Daten verloren
- **Reset-Endpoint:** `/api/db/reset` für intentionales Löschen (umgeht Leer-Wert-Schutz)

### DB Safety Regeln
- **Vor jedem UPDATE/DELETE:** Erst SELECT ausführen und Ergebnis dem User zeigen
- **Niemals** nach Timestamp-Pattern löschen — immer nach exaktem Inhalt filtern
- **Bulk-Operationen:** Erst Dry-Run (SELECT mit Zählung), dann User bestätigen lassen
- Datenverlust ist der schlimmste Bug — lieber einmal zu viel fragen als Daten löschen

## Dateistruktur & Größe

### Große Dateien (Token-intensiv beim Lesen)
| Datei | Zeilen | Inhalt |
|---|---|---|
| `components/WorkoutTab.tsx` | ~2140 | Workout UI, Live-Tracking, Historie, Recovery |
| `components/NutritionTab.tsx` | ~1986 | Ernährungsplan, Mahlzeiten, Kalorien |
| `components/HealthTab.tsx` | ~1660 | Health-Metriken, Schlaf, Schritte, Graphen |
| `App.tsx` | ~1260 | State Management, Auth, DB Sync, Routing |
| `components/SettingsTab.tsx` | ~1066 | Profil, Push, HealthBridge-Einstellungen |
| `components/Dashboard.tsx` | ~760 | Übersicht, Tagesziele, Quick-Stats |

→ Bei Änderungen gezielt mit `offset`/`limit` lesen, nicht ganze Datei

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
- **Sprachen:** DE + EN, umschaltbar, über `t`-Objekte in jeder Komponente (kein i18n-Framework)
- **Design:** Dark Theme, Tailwind Utility Classes, abgerundete Karten
- **Mobile:** Optimiert für 375px (iPhone SE Mindestbreite)
- **Icons:** FontAwesome (`fas fa-*`)
- Bei neuen UI-Texten IMMER beide Sprachen im `t`-Objekt ergänzen

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
