#!/usr/bin/env python3
from __future__ import annotations
"""
HelioFit Deploy Script
======================
Automatisiert das Deployment auf einen Remote-Server (z.B. Proxmox Docker-Host).
Kein lokales Docker noetig – Build passiert auf dem Server.

Ablauf:
  1. Quellcode per tar+ssh auf den Server uebertragen
  2. Docker-Image auf dem Server bauen
  3. Container per docker compose neu starten

Erstmalige Einrichtung:
  python3 deploy.py setup    → Erstellt .env.prod Template + Projektordner auf dem Server

Deployment:
  python3 deploy.py          → Sync + Build + Start
  python3 deploy.py --quick  → Nur Neustart (kein Neubau)

Konfiguration ueber .env.deploy Datei:
  DEPLOY_HOST     = IP oder Hostname des Servers
  DEPLOY_USER     = SSH-Benutzer (Standard: root)
  DEPLOY_PATH     = Pfad auf dem Server (Standard: /opt/heliofit)
  DEPLOY_PORT     = SSH-Port (Standard: 22)
"""

import argparse
import os
import subprocess
import sys
from pathlib import Path

# ── Konfiguration ──────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).resolve().parent
IMAGE_NAME = "heliofit-app"

DEPLOY_DEFAULTS = {
    "DEPLOY_HOST": "",
    "DEPLOY_USER": "root",
    "DEPLOY_PATH": "/opt/heliofit",
    "DEPLOY_PORT": "22",
}

# Dateien/Ordner die NICHT auf den Server uebertragen werden
TAR_EXCLUDES = [
    "node_modules",
    ".git",
    "dist",
    ".env",
    ".env.deploy",
    ".env.prod",
    ".env.local",
    ".claude",
    ".vscode",
    "Old_Server",
    "heliofit-image.tar.gz",
    "deploy.py",
    ".DS_Store",
]


def load_deploy_env() -> dict[str, str]:
    """Lade Deployment-Konfiguration aus .env.deploy oder Umgebungsvariablen."""
    config = dict(DEPLOY_DEFAULTS)
    env_file = SCRIPT_DIR / ".env.deploy"

    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, _, value = line.partition("=")
                config[key.strip()] = value.strip()

    # Env-Vars ueberschreiben Datei-Werte
    for key in DEPLOY_DEFAULTS:
        env_val = os.environ.get(key)
        if env_val:
            config[key] = env_val

    return config


def run(cmd: str, *, check: bool = True, **kwargs):
    """Shell-Befehl ausfuehren mit huebscher Ausgabe."""
    print(f"\n  \u2192 {cmd}")
    return subprocess.run(cmd, shell=True, check=check, text=True, **kwargs)


def ssh(config: dict, remote_cmd: str, **kwargs):
    """SSH-Befehl auf dem Remote-Server ausfuehren."""
    port = config["DEPLOY_PORT"]
    user_host = f"{config['DEPLOY_USER']}@{config['DEPLOY_HOST']}"
    return run(f'ssh -p {port} {user_host} "{remote_cmd}"', **kwargs)


def require_host(config: dict) -> str:
    """Pruefe ob DEPLOY_HOST gesetzt ist."""
    host = config.get("DEPLOY_HOST")
    if not host:
        print("  Fehler: DEPLOY_HOST nicht gesetzt!")
        print("  Fuehre zuerst 'python3 deploy.py setup' aus")
        sys.exit(1)
    return host


# ── Befehle ────────────────────────────────────────────────────

def cmd_setup(config: dict):
    """Erstmalige Einrichtung: .env.deploy + .env.prod Templates + Remote-Ordner."""

    # .env.deploy (lokale Deploy-Konfiguration)
    env_deploy = SCRIPT_DIR / ".env.deploy"
    if not env_deploy.exists():
        env_deploy.write_text(
            "# HelioFit Deployment Konfiguration\n"
            "DEPLOY_HOST=\n"
            "DEPLOY_USER=root\n"
            "DEPLOY_PATH=/opt/heliofit\n"
            "DEPLOY_PORT=22\n"
        )
        print(f"  Erstellt: {env_deploy}")
        print("  \u2192 Bitte DEPLOY_HOST eintragen (IP deines Proxmox-Servers)")
    else:
        print(f"  {env_deploy} existiert bereits")

    # .env.prod (Production-Environment fuer den Server)
    env_prod = SCRIPT_DIR / ".env.prod"
    if not env_prod.exists():
        env_prod.write_text(
            "# HelioFit Production Environment\n"
            "# Diese Datei wird auf den Server kopiert als .env\n\n"
            "# Datenbank (aendere das Passwort!)\n"
            "DB_USER=heliofit\n"
            "DB_PASSWORD=AENDERN_SicheresPasswort123!\n"
            "DB_NAME=heliofit_db\n\n"
            "# HealthBridge API Key (zufaelligen Key generieren!)\n"
            "HB_API_KEY=AENDERN_ZufaelligerApiKey\n\n"
            "# Firebase (optional - Pfad zum Service-Account JSON auf dem Server)\n"
            "FIREBASE_SA_PATH=\n\n"
            "# Gemini API Key (optional)\n"
            "GEMINI_API_KEY=\n\n"
            "# Port (extern)\n"
            "PORT=8000\n"
        )
        print(f"  Erstellt: {env_prod}")
        print("  \u2192 Bitte Passwoerter und API-Keys anpassen!")
    else:
        print(f"  {env_prod} existiert bereits")

    # Remote-Ordner erstellen (falls Host konfiguriert)
    if config.get("DEPLOY_HOST"):
        remote_path = config["DEPLOY_PATH"]
        print(f"\n  Erstelle Remote-Ordner: {remote_path}")
        ssh(config, f"mkdir -p {remote_path}")
        print("  Fertig!")
    else:
        print("\n  \u26a0 DEPLOY_HOST ist leer \u2013 bitte in .env.deploy eintragen")

    print("\n  Naechste Schritte:")
    print("  1. DEPLOY_HOST in .env.deploy eintragen")
    print("  2. Passwoerter in .env.prod aendern")
    print("  3. SSH-Key einrichten: ssh-copy-id <user>@<host>")
    print("  4. python3 deploy.py")


def cmd_deploy(config: dict, quick: bool = False):
    """Deployment: Sync \u2192 Build \u2192 Start."""

    host = require_host(config)
    remote_path = config["DEPLOY_PATH"]
    port = config["DEPLOY_PORT"]
    user_host = f"{config['DEPLOY_USER']}@{config['DEPLOY_HOST']}"

    if not quick:
        # ── Schritt 1: Quellcode per tar+ssh uebertragen ──
        print("\n[1/4] Quellcode auf Server uebertragen...")

        # Remote-Verzeichnis vorbereiten
        ssh(config, f"mkdir -p {remote_path}/src")

        # tar erstellen, ueber SSH pipen und auf dem Server entpacken
        excludes = " ".join(f'--exclude="{e}"' for e in TAR_EXCLUDES)
        run(
            f'tar czf - -C "{SCRIPT_DIR}" {excludes} . | '
            f'ssh -p {port} {user_host} '
            f'"rm -rf {remote_path}/src/* && tar xzf - -C {remote_path}/src"'
        )

        # .env.prod als .env uebertragen
        env_prod = SCRIPT_DIR / ".env.prod"
        if env_prod.exists():
            run(f'scp -P {port} "{env_prod}" {user_host}:{remote_path}/.env')
        else:
            print("  Keine .env.prod gefunden")

        # docker-compose.prod.yml als docker-compose.yml uebertragen
        run(
            f'scp -P {port} '
            f'"{SCRIPT_DIR}/docker-compose.prod.yml" '
            f'{user_host}:{remote_path}/docker-compose.yml'
        )

        # Firebase Service Account (falls vorhanden)
        firebase_sa = SCRIPT_DIR / "firebase-sa.json"
        if firebase_sa.exists():
            run(f'scp -P {port} "{firebase_sa}" {user_host}:{remote_path}/firebase-sa.json')

        # ── Schritt 2: Docker-Image auf dem Server bauen ──
        print("\n[2/4] Docker-Image auf Server bauen...")
        ssh(config, f"cd {remote_path}/src && docker build -f Dockerfile.prod -t {IMAGE_NAME}:latest .")

        # ── Schritt 3: Alte Container stoppen ──
        print("\n[3/4] Container neu starten...")
        ssh(config, f"cd {remote_path} && docker compose down 2>/dev/null; docker compose up -d")

    else:
        print("\n  --quick: Nur Container neu starten...")
        ssh(config, f"cd {remote_path} && docker compose down 2>/dev/null; docker compose up -d")

    # ── Schritt 4: Status pruefen ──
    print("\n[4/4] Status:")
    ssh(config, f"cd {remote_path} && docker compose ps")

    print(f"\n  Deployment abgeschlossen!")
    print(f"  App erreichbar unter: http://{host}:8000")


def cmd_logs(config: dict, follow: bool = False):
    """Logs vom Server anzeigen."""
    require_host(config)
    remote_path = config["DEPLOY_PATH"]
    flag = "-f" if follow else "--tail=100"
    cmd = f"cd {remote_path} && docker compose logs {flag}"

    if follow:
        port = config["DEPLOY_PORT"]
        user_host = f"{config['DEPLOY_USER']}@{config['DEPLOY_HOST']}"
        os.execvp("ssh", ["ssh", "-p", port, user_host, cmd])
    else:
        ssh(config, cmd)


def cmd_status(config: dict):
    """Status der Container auf dem Server anzeigen."""
    require_host(config)
    remote_path = config["DEPLOY_PATH"]
    ssh(config, f"cd {remote_path} && docker compose ps")


def cmd_stop(config: dict):
    """Container auf dem Server stoppen."""
    require_host(config)
    remote_path = config["DEPLOY_PATH"]
    ssh(config, f"cd {remote_path} && docker compose down")
    print("  Container gestoppt.")


# ── Main ───────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="HelioFit Deploy Tool",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Befehle:
  (kein Argument)   Vollstaendiges Deployment (Sync + Build + Start)
  setup             Erstmalige Einrichtung
  status            Container-Status anzeigen
  logs              Logs anzeigen (--follow fuer live)
  stop              Container stoppen
  --quick           Nur Neustart (kein Neubau)
        """,
    )
    parser.add_argument("command", nargs="?", default="deploy",
                        choices=["deploy", "setup", "status", "logs", "stop"])
    parser.add_argument("--quick", action="store_true",
                        help="Nur Container neu starten, kein Build")
    parser.add_argument("--follow", "-f", action="store_true",
                        help="Logs live verfolgen")
    args = parser.parse_args()

    config = load_deploy_env()

    print("  HelioFit Deploy Tool")
    print("  ====================")

    if args.command == "setup":
        cmd_setup(config)
    elif args.command == "deploy":
        cmd_deploy(config, quick=args.quick)
    elif args.command == "logs":
        cmd_logs(config, follow=args.follow)
    elif args.command == "status":
        cmd_status(config)
    elif args.command == "stop":
        cmd_stop(config)


if __name__ == "__main__":
    main()
