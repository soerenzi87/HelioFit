# HelioFit - Claude Code Regeln

## Git Workflow (KRITISCH)
- **NIEMALS direkt auf `main` pushen oder committen**
- Arbeite IMMER auf dem `dev` Branch
- Vor jeder Arbeit: `git checkout dev && git pull origin dev`
- Wenn fertig: Push auf `dev`, dann PR erstellen (`dev` → `main`)
- PRs erstellen mit: `gh pr create --base main --head dev`

## Deployment
- Production-Deployment passiert automatisch via GitHub Actions wenn ein PR nach `main` gemerged wird
- Der Dev-Docker auf dieser VM ist zum Testen: `docker compose up` im Projektverzeichnis
- Prod-Server: 192.168.68.132:8080 (nicht direkt ändern!)

## Architektur
- Frontend: React + TypeScript + Vite + Tailwind CSS
- Backend: Express.js (server.ts) mit PostgreSQL
- AI: Google Gemini API (services/geminiService.ts)
- Health-Daten: HealthBridge Connector App + Google Fit
- Auth: Session-basiert mit bcrypt Passwörter

## Sprache
- Code & Kommentare: Englisch
- UI: Deutsch & Englisch (i18n über `t` Objekte in jeder Komponente)
- Kommunikation mit dem User: Deutsch

## Wichtige Dateien
- `App.tsx` - Hauptkomponente, State Management, Routing
- `server.ts` - Express Backend mit allen API-Routes
- `types.ts` - Alle TypeScript Interfaces
- `services/` - Business Logic (Gemini, HealthBridge, Recovery, etc.)
- `components/` - UI Komponenten (Dashboard, HealthTab, NutritionTab, etc.)
- `deploy.py` - Legacy Deploy-Script (nicht mehr nutzen, GitHub Actions stattdessen)

## Sicherheitsregeln
- Keine Secrets in Code oder Commits (.env, API Keys, Passwörter)
- Passwörter nur gehasht (bcrypt) speichern
- API-Endpunkte müssen Session-Auth prüfen
- Keine beliebigen URLs in HealthBridge Proxy (SSRF-Schutz)
