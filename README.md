# SIMS – Security Incident Management System

![Status](https://badgen.net/badge/Status/In%20Entwicklung/orange)
![.NET](https://badgen.net/badge/.NET/10/blue)

## Beschreibung
SIMS ist eine Anwendung zur Verwaltung von IT-Sicherheitsvorfällen.
Aktueller Stand: Das ASP.NET-Core-Grundprojekt eingerichtet. Die Entwicklung der SIMS-Funktionen stehen an.

## Funktionen
Geplant sind:
- Sicherheitsvorfälle erfassen, bearbeiten und schließen
- Sicherheitsvorfälle eskalieren
- Benutzer anmelden und verwalten
- Rollen und Berechtigungen verwalten
- Ereignisse protokollieren

## Technologien
- C# / .NET 10
- ASP.NET Core
- SQL Server und Entity Framework Core (geplant)
- Redis (geplant)
- Docker (geplant)
## Installation
Die Anwendung wird unter Windows entwickelt und die powershell als Werkzeug benutzt. 

```powershell
git clone https://github.com/laurin-hub/sims.git
cd sims
dotnet build sims.slnx
dotnet run --project sims/sims.csproj
```

Aktuell ist der Beispielendpunkt `/weatherforecast` erreichbar. Die Docker-Anleitung folgt.

## Architektur
Geplant sind ein Client, REST-APIs, SQL Server und Redis in mindestens vier Docker-Containern.
ER-Diagramm und Klassendiagramm folgen.

## Sicherheit
- HTTPS-Weiterleitung ist konfiguriert.
- Authentifizierung, Rollenrechte und Eingabevalidierung werden implementiert.
- Passwortschutz, sichere Zugangsdaten und Schutz vor SQL-Injection werden berücksichtigt
- Umgesetzte Maßnahmen und offene Risiken werden nach Möglichkeit mit der Entwicklung ergänzt.

## Codeanalyse
Semgrep: Noch nicht durchgeführt. Ergebnisse folgen

## Projektinformationen
- Version: 0.1.0 (Entwicklung)
- Lizenz: Noch nicht festgelegt
- Entwickler: Laurin Mahr
- Repository: https://github.com/laurin-hub/sims

## Roadmap
- 0.1: Projektgrundlage, REST-API und Dokumentation
- 0.2: SQL Server, Entity Framework Core und Datenmodell
- 0.3: Incident-Management (Erstellen, Bearbeiten, Schließen)
- 0.4: Benutzerverwaltung, Authentifizierung und Rollen
- 0.5: Eskalationsmanagement, Redis und Logging.
- 0.6: Microservices und REST-Schnittstellen
- 0.7: Docker-Integration und Web-Frontend
- 1.0: Funktionstests, Semgrep, Sicherheitsprüfung und Release
