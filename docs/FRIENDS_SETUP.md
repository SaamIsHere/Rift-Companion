# 🎮 Rift Companion — Quick Start & Friends Onboarding Guide

Willkommen bei **Rift Companion**! Dieses Dokument dient als kurze, verständliche Anleitung für deine Mitspieler und Freunde, um die App in 60 Sekunden zu installieren und alle Fragen zu Windows SmartScreen und Riot Vanguard zu beantworten.

---

## ⚡ Schnellanleitung (In 3 Schritten startklar)

1. **Herunterladen:**
   Lade dir die neueste `Rift.Companion_x.x.x_x64-setup.exe` direkt von GitHub herunter:
   👉 **[Neuestes Release herunterladen](https://github.com/SaamIsHere/Rift-Companion/releases/latest)**

2. **Installieren:**
   Führe die `.exe` per Doppelklick aus. Der Installer benötigt **keine Administratorrechte** und richtet die App automatisch auf deinem Computer ein.

3. **Spielen:**
   Starte League of Legends und öffne Rift Companion. Sobald du dich in der Champion-Select befindest, synchronisiert sich die App automatisch und liefert dir Live-Statistiken, Builds und Empfehlungen!

---

## 🛡️ Windows SmartScreen: "Der Computer wurde durch Windows geschützt"

Beim ersten Ausführen zeigt Windows möglicherweise ein blaues Hinweisfenster an:

```
┌─────────────────────────────────────────────────────────────┐
│  Der Computer wurde durch Windows geschützt                │
│                                                             │
│  Von Microsoft Defender SmartScreen wurde der Start einer   │
│  unbekannten App verhindert...                             │
│                                                             │
│  [ Weitere Informationen ]                                  │
│                                            [ Nicht ausführen ]│
└─────────────────────────────────────────────────────────────┘
```

### Warum erscheint dieser Hinweis?
Microsoft stuft jede neue, quelloffene Desktop-Anwendung zunächst als "unbekannt" ein, solange der Entwickler kein teures, jährliches Unternehmens-Signaturzertifikat (EV Certificate, ~400 €/Jahr) von Microsoft erworben hat. Der Quellcode ist zu 100 % auf GitHub einsehbar.

### Wie starte ich die App?
1. Klicke im blauen Fenster auf **"Weitere Informationen"** (*More info*).
2. Klicke unten rechts auf **"Trotzdem ausführen"** (*Run anyway*).
3. Dies ist nur ein einziges Mal bei der Erstinstallation notwendig.

---

## 🛡️ Ist Rift Companion sicher bezüglich Riot Vanguard & Anti-Cheat?

> **Kurze Antwort: Ja, zu 100 % sicher. Es besteht keinerlei Bann-Risiko.**

### Wie funktioniert Rift Companion technisch?
* **Offizielle Riot-Schnittstelle (LCU):** Die App liest ausschließlich Daten über die lokale, von Riot Games offiziell bereitgestellte **League Client API** (Port 127.0.0.1 via WebSocket). Das ist exakt dieselbe Schnittstelle, die auch von *Blitz.gg*, *Porofessor*, *OP.GG Desktop* und *Mobalytics* genutzt wird.
* **Kein Eingriff ins Spiel:** Rift Companion liest zu keinem Zeitpunkt den Arbeitsspeicher des Spiels (*no memory hooking*), injiziert keine DLLs (*no DLL injection*) und verändert keine Spieldateien.
* **Keine In-Game-Automatisierung:** Die App führt keine Aktionen, Klicks oder Tastatureingaben für dich aus.
* **Riot Compliance:** Vollständig konform mit den offiziellen [Riot Games Third-Party Guidelines](https://www.riotgames.com/en/legal).

---

## 🔄 Automatische Updates

Du musst die App nicht manuell neu herunterladen, wenn neue Patches oder Features erscheinen:
* Beim Start prüft die App automatisch im Hintergrund nach neuen Updates.
* Ist ein Update verfügbar, erscheint direkt ein Hinweisfenster mit den Änderungen und einem **"Update & Restart Now"**-Button.
* Ein Klick aktualisiert die App vollautomatisch und startet sie neu.

---

## 📋 Discord Copy & Paste Vorlage

Kopiere diese Nachricht einfach in deinen Discord-Channel für deine Freunde:

```markdown
Hey Leute! 🚀

Hier ist der Download für **Rift Companion** (unseren LoL Champ-Select Advisor & Build-Guide):
👉 **Download:** https://github.com/SaamIsHere/Rift-Companion/releases/latest

**Features:**
- ⚡ Live Champion-Select Advisor: Dynamische Winrates & Synergien für deine Rolle
- 📊 Alle Ränge (Emerald+, Diamond, Master etc.) & Patches vorkonfiguriert
- 🎨 8 Runeterra Region-Themes & eigene Wallpaper
- 🔄 Auto-Updater: Aktualisiert sich bei Updates automatisch mit einem Klick

*Hinweis zu Windows Defender:*
Beim ersten Start auf **"Weitere Informationen"** -> **"Trotzdem ausführen"** klicken (liegt daran, dass Microsoft für neue Open-Source Apps ein 400€ Zertifikat verlangt). 
Das Tool liest wie Porofessor/Blitz nur die offizielle Riot LCU-Schnittstelle aus – 100% sicher und Vanguard-compliant.

Viel Spaß beim Ausprobieren! Feedback gerne hier rein.
```
