# Rift Server (NAS Companion Service)

Ein leichtgewichtiger Microservice, der Champion-Statistiken von OP.GG und Data Dragon automatisiert vorab abruft, strukturiert im lokalen Netzwerk bereitstellt und so Ladezeiten und Systemlast in der Rift Companion Desktop-App minimiert.

---

## Features

- **Automatischer Scheduler**: Führt tägliche Crawls durch (Standard: 04:00 Uhr) und erkennt automatisch neue League of Legends Patches.
- **Kumulative Plus-Ränge**: Unterstützt 7 Plus-Tiers (`iron_plus`, `bronze_plus`, `silver_plus`, `gold_plus`, `platinum_plus`, `emerald_plus`, `diamond_plus`).
  - `iron_plus` zieht alle Ränge (~865.000 Spiele).
  - `silver_plus` und `bronze_plus` werden mathematisch exakt gewichtet aggregiert (`Silver` + `Gold+`, `Bronze` + `Silver+`).
- **Web Dashboard**: Interaktive Benutzeroberfläche unter `http://<host>:8080/` mit Live-Crawl-Balken, manuellen Crawl-Triggern, Patch-Checker und Champion-Explorer mit Rollenfilter.
- **Parallele Verarbeitung**: Bounded Concurrency (`CRAWL_CONCURRENCY = 6`) für schnelle Crawls ohne Rate-Limits.
- **Persistent Storage**: Daten werden dauerhaft im gemounteten `/data`-Verzeichnis abgelegt.
- **REST-API**:
  - `GET /health` – Healthcheck
  - `GET /api/status` – Aktueller Patch, Crawl-Fortschritt & verfügbare Ränge
  - `GET /api/stats?tier=emerald_plus` – Champion-Datensatz für die Desktop-App (Gzip-komprimiert)
  - `GET /api/champions?tier=emerald_plus` – Listen aller Champions inklusive Matchups und Rollen
  - `POST /api/refresh?tier=iron_plus` – Manuelles Anstoßen eines Crawls (oder `tier=all`)
  - `POST /api/check-patch` – Manueller Trigger zur Patch-Prüfung bei Riot Data Dragon

---

## Deployment auf dem NAS (Docker)

### 1. Per Docker Compose
Kopiere diesen Ordner `server/` auf dein NAS und starte den Container:

```sh
docker compose up -d --build
```

Die Daten werden im Unterordner `./data` auf dem NAS gespeichert.

### 2. Konfigurations-Umgebungsvariablen

In der `docker-compose.yml` oder im NAS-Container-Manager anpassbar:
- `PORT`: Standard `8080`
- `DATA_DIR`: Standard `/data`
- `CRAWL_CONCURRENCY`: Anzahl gleichzeitiger Requests an OP.GG (Standard `6`)
- `CRON_HOUR`: Stunde für den täglichen automatischen Refresh (Standard `4` für 04:00 Uhr)

---

## Lokaler Test ohne Docker

```sh
npm install
npm start
```
Der Server läuft dann unter `http://localhost:8080`.
