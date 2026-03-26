<div align="center">

<img src="logo.svg" alt="HelioFit Logo" width="140" />

# HelioFit

**AI-Powered Health & Fitness Dashboard**

Ganzheitliches Gesundheitstracking mit KI-Analyse, Ernaehrungsplanung und Trainingssteuerung.

[![Deploy](https://img.shields.io/badge/deploy-Docker-blue?logo=docker)](docker-compose.prod.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev/)

</div>

---

<!-- Screenshot der App hier einfuegen:
     1. Screenshot von https://health.soerenzieger.de machen (Dashboard-Ansicht)
     2. Als docs/screenshot.png speichern oder auf GitHub hochladen
     3. Zeile unten einkommentieren:
-->
<!-- ![HelioFit Dashboard](docs/screenshot.png) -->

## Features

### Health Tracking
- **Multi-Source Sync** — Google Fit, HealthBridge (Xiaomi/Zepp), Xiaomi Smart Scale
- **Schlafanalyse** — Schlafdauer, Deep Sleep, REM, Light Sleep mit Trendcharts
- **Vitalwerte** — Ruhepuls, HRV, SpO2, Atemfrequenz, Blutdruck
- **Schritte & Aktivitaet** — Tagesschritte, Distanz, aktive Kalorien
- **Koerperkomposition** — Gewicht, BMI, Koerperfett, Muskelmasse, Viszeralfett
- **Korrelations-Insights** — KI-gestuetzte Analyse von Zusammenhaengen (z.B. Schlaf vs. HRV)

### Ernaehrung
- **KI-Ernaehrungsplaene** — Personalisierte Wochenplaene basierend auf Zielen & Praeferenzen
- **Ausschluss-Lebensmittel** — Allergien und Unvertraeglichkeiten werden beruecksichtigt
- **Chat-Umplanung** — Mahlzeiten per KI-Chat umplanen oder hinzufuegen
- **Makro-Tracking** — Kalorien, Protein, Kohlenhydrate, Fett pro Tag
- **Rezepte mit Naehrwerten** — Detaillierte Rezeptanweisungen pro Mahlzeit

### Training
- **KI-Trainingsplaene** — Personalisierte Workout-Programme
- **Uebungstausch** — Einzelne Uebungen per KI austauschen lassen
- **Set-Tracking** — Saetze, Wiederholungen, Gewicht protokollieren
- **Recovery Score** — Erholungsanalyse basierend auf HRV, Schlaf & Ruhepuls
- **Training-Recovery-Verknuepfung** — Trainingsbelastung vs. Erholung Timeline

### System
- **PWA Push-Notifications** — Anomalie-Warnungen, Sync-Erinnerungen, Wochenberichte
- **Multi-User** — Mehrere Profile mit Admin-Verwaltung
- **Mock-Modus** — Demo-Daten fuer Praesentationen
- **Zweisprachig** — Deutsch / Englisch
- **Session-Auth** — Sichere Authentifizierung mit bcrypt & Server-Sessions

## Tech Stack

| Bereich | Technologie |
|---------|-------------|
| Frontend | React 18, TypeScript, Tailwind CSS, Recharts |
| Backend | Node.js, Express, tsx |
| Datenbank | PostgreSQL 15 (JSONB + relationale Tabellen) |
| KI | Google Gemini API (1.5 Flash / 2.0 Flash) |
| Auth | bcrypt, express-session, CSRF-Protection |
| Push | Web Push API, VAPID, Service Worker |
| Deploy | Docker Compose, Cloudflare Tunnel |

## Schnellstart

### Voraussetzungen

- Node.js 22+
- Docker & Docker Compose (fuer Produktion)
- Google Gemini API Key

### Lokale Entwicklung

```bash
# Dependencies installieren
npm install

# .env.local erstellen
cp .env.local.example .env.local
# GEMINI_API_KEY eintragen

# Entwicklungsserver starten
npm run dev
```

### Produktion (Docker)

```bash
# .env.prod erstellen mit:
#   GEMINI_API_KEY=...
#   SESSION_SECRET=...
#   VAPID_PUBLIC_KEY=...
#   VAPID_PRIVATE_KEY=...
#   HB_API_KEY=...

# Starten
docker compose -f docker-compose.prod.yml up -d
```

### Deployment

```bash
# Automatisches Deployment auf Remote-Server
python3 deploy.py

# Nur Neustart (ohne Neubau)
python3 deploy.py --quick

# Erstmalige Einrichtung
python3 deploy.py setup
```

## Architektur

```
HelioFit/
├── App.tsx                    # Haupt-App mit State-Management
├── server.ts                  # Express Backend (API + Auth + Push)
├── components/
│   ├── Dashboard.tsx          # Uebersichts-Dashboard
│   ├── HealthTab.tsx          # Gesundheitsdaten & Charts
│   ├── NutritionTab.tsx       # Ernaehrungsplanung
│   ├── WorkoutTab.tsx         # Training & Recovery
│   ├── SettingsTab.tsx        # Einstellungen & Konnektoren
│   ├── AdminPanel.tsx         # User-Verwaltung
│   └── AuthPortal.tsx         # Login/Registrierung
├── services/
│   ├── geminiService.ts       # Gemini AI Integration
│   ├── recoveryService.ts     # Recovery Score Berechnung
│   ├── aggregationService.ts  # Daten-Aggregation & Korrelation
│   ├── healthDataMerge.ts     # Multi-Source Health Merge
│   ├── healthBridgeService.ts # Zepp/Xiaomi Connector
│   ├── pushNotificationService.ts # PWA Push Client
│   ├── mockHealthData.ts      # Demo-Daten Generator
│   └── apiFetch.ts            # API Client mit CSRF
├── routes/
│   └── healthbridge/scale.ts  # Xiaomi Scale Webhook
└── types.ts                   # TypeScript Interfaces
```

## Datenquellen

| Quelle | Daten | Anbindung |
|--------|-------|-----------|
| **Google Fit** | Schritte, Kalorien, Distanz, Schlaf, Puls, SpO2 | OAuth2 via HealthBridge |
| **Zepp/Xiaomi** | HRV, Schlafphasen, SpO2, Atemfrequenz, Puls | HealthBridge Connector App |
| **Xiaomi Smart Scale** | Gewicht, BMI, Koerperfett, Muskelmasse, Wasser | Direkter Webhook |
| **Manuell** | Blutdruck, zusaetzliche Messungen | In-App Eingabe |

## Lizenz

Privates Projekt von Soeren Zieger / Antigravity.

---

<div align="center">
Built with Gemini AI & Claude
</div>
