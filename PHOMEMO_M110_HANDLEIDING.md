# Phomemo M110 werkend krijgen (Ionic + Capacitor BLE)

Deze handleiding beschrijft exact hoe de M110 in dit project werkend is gekregen.

## Snelle Start (5 stappen)

1. Zet Bluetooth en locatie aan op Android.
2. Open de app en druk op Koppel Printer.
3. Controleer in het debugvenster of ff00/ff02/ff03 zichtbaar zijn.
4. Doe eerst Streep Test en daarna Print Test Label.
5. Als print traag lijkt: "Ubertragen" van ~3 seconden is normaal met debug-instellingen.

Werkende UUIDs in deze setup:

- Service: 0000ff00-0000-1000-8000-00805f9b34fb
- Write: 0000ff02-0000-1000-8000-00805f9b34fb
- Notify: 0000ff03-0000-1000-8000-00805f9b34fb

## Resultaat

- Verbinden werkt stabiel.
- Bitmap printen werkt.
- Printer stopt netjes op de volgende labelgap.
- Tekstmodus (ESC/POS tekst) print niet op dit model in deze setup.

## Projectcontext

- Framework: Ionic + Angular + Capacitor
- BLE plugin: @capacitor-community/bluetooth-le
- Platform getest: Android
- Printer: Phomemo M110

## Werkende BLE configuratie

Op dit apparaat zijn de bruikbare UUIDs:

- Service: 0000ff00-0000-1000-8000-00805f9b34fb
- Write characteristic: 0000ff02-0000-1000-8000-00805f9b34fb
- Notify characteristic: 0000ff03-0000-1000-8000-00805f9b34fb

Belangrijk:

- Eerdere aannames met 18f0/2af1 waren niet de primaire match voor dit toestel.
- De scan/discovery output in de app was doorslaggevend om ff00/ff02/ff03 te vinden.

## Cruciale inzichten uit troubleshooting

1. Verbinding was wel goed als de motor reageerde of "Ubertragen" in beeld kwam.
2. Tekst-test spuugde labels uit zonder tekst: aanwijzing dat deze route niet bruikbaar was.
3. Printer bleek in praktijk bitmap-gericht te werken voor betrouwbare output.
4. Te agressieve feed-commando's veroorzaakten doorlopende labeluitvoer.
5. Grote payload in 1 BLE write is onbetrouwbaar door MTU-beperkingen; chunking is nodig.

## Definitieve printaanpak

- Gebruik bitmap data (GS v 0 raster).
- Schrijf in chunks met pauze:
  - CHUNK_SIZE = 64
  - CHUNK_DELAY = 100 ms
- Gebruik write() met response voor betrouwbaarheid.
- Geen extra feed/cut achteraf in reguliere printflow.

Gevolg:

- Eerst "Ubertragen" (ongeveer 3 seconden met debug-instellingen), daarna print.
- Label stopt correct op de volgende labelrand.

## Waarom "Ubertragen" enkele seconden duurt

Bij ongeveer 2050 bytes en chunks van 64 bytes:

- Aantal chunks ~ 33
- Met 100 ms delay per chunk is alleen wachttijd al ~ 3.3 s

Dat verklaart het zichtbare ontvangstvenster voordat de print start.

## Belangrijkste codekeuzes in dit project

- Profielkandidaten bevatten ff00/ff02/ff03 als primaire M110 route.
- connect() doet:
  - initialize
  - requestDevice
  - connect
  - discoverServices
  - getServices
  - automatische keuze van write characteristic
  - optioneel notifications op notify characteristic
- processCanvas() converteert canvas naar 1-bit bitmap voor thermisch printen.
- Na problemen met doorvoeren is automatische feed aan het einde verwijderd.

## Praktische testvolgorde (werkend gebleken)

1. Koppel printer.
2. Controleer gevonden services/characteristics in debugvenster.
3. Streep test (bitmap): bevestigt dat bitmap pad werkt.
4. Print Test Label: echte labelprint.
5. Alleen indien nodig: feed test minimaal houden (1 regel) om doorschieten te voorkomen.

## Bekende valkuilen

- Alleen op naam/legacy UUID filteren kan verkeerde route kiezen.
- Te veel LF of ESC d na print kan meters labels doorvoeren.
- Tekst-ESC/POS testen kunnen vals positief lijken (transport wel, geen tekst op papier).
- Zonder discoverServices/getServices op Android kun je incomplete service info krijgen.

## Android aandachtspunten

- Bluetooth aan
- Locatie-services aan (vereist voor BLE scan op Android)
- Printer dichtbij toestel tijdens koppelen

## Huidige status

- Doorbraak bereikt: printer print betrouwbaar bitmaps en stopt correct per label.
- App is nu geschikt als basis voor echte labelontwerpen op canvas.
