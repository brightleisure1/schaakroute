# Over de app

*Werktitel: SchaakRoute. Er wordt een nieuwe naam gezocht.*
Live: https://chess.stuby.nl

## In één zin

Een gratis app waarmee je schaakopeningen leert door ze zelf op het bord te spelen, en ze onthoudt doordat de app elke zet op het juiste moment laat terugkomen.

## Het probleem

- De meeste schakers kennen hun openingen half. Na zet 5 of 6 weten ze het niet meer en staan ze slechter zonder te snappen waarom.
- Openingsboeken en video's lezen of kijken voelt nuttig, maar blijft niet hangen. Wat blijft hangen is zelf zetten spelen en die later herhalen.
- Goede trainers voor openingen (Chessable, Chessbook, Lotus) zijn betaald, Engelstalig of vragen een account.

## Het doel

1. **Leren door te doen.** Je speelt elke zet zelf. De app speelt de tegenstander.
2. **Onthouden met herhaling op het juiste moment.** Wat je goed kent zie je zelden terug, wat je fout doet komt snel terug (spaced repetition, SM-2).
3. **Leren wat er echt op je bord komt.** De keuze van openingen en zetten is gebaseerd op echte partijen van Lichess op jouw niveau, niet op wat in boeken het mooist staat.
4. **Elke dag een paar minuten.** De dagtraining stelt zelf een sessie samen, zodat je niet hoeft na te denken over wat je gaat doen.
5. **Gratis en privé.** Geen account, geen abonnement, geen reclame. Alles staat op je eigen apparaat en de app werkt offline.

## Voor wie

**Hoofddoelgroep:** clubschakers en online schakers (ongeveer 1000 tot 2000 rating) die serieus beter willen worden in hun openingen, vooral op de telefoon in korte momenten. Ze kennen de regels en de notatie, maar hebben geen vast repertoire of vergeten het steeds.

Ook bruikbaar voor:
- beginners die hun eerste opening willen leren (de cursus begint bij de hoofdlijn);
- sterkere spelers die hun eigen repertoire willen invoeren en drillen.

## Wat zit erin

De 10 populairste openingen voor wit en de 10 populairste voor zwart, met alle 2.246 benoemde varianten uit de openbare Lichess-database. De populariteit is gemeten op ruim 500.000 echte partijen. Daarnaast staat de Alien Gambit erin als extra opening voor wit, met 10 zelf samengestelde lijnen.

| Onderdeel | Wat je doet |
|---|---|
| **Dagtraining** | Eén sessie per dag: eerst je herhalingen, dan nieuwe varianten, moeilijke varianten en een puzzel. Je ziet de route van de dag en je reeks dagen op rij. |
| **Herhalen** | Wat je geleerd hebt komt terug zodra het nodig is. Losse posities, of complete varianten uit het hoofd zonder hints. |
| **Openingen** | Per opening het idee, de plus- en minpunten, de belangrijkste varianten en je voortgang. |
| **Cursus** | Per opening een leerpad in niveaus. Je begint met de meest gespeelde lijnen en gaat steeds dieper. Alleen lijnen met minstens 4 eigen zetten, korte lijnen kun je wel bekijken. |
| **Varianten** | Alle varianten van een opening, als boom of lijst, met zoeken en filters. |
| **Afstraffen** | Echte puzzels uit Lichess-partijen: je tegenstander maakt een fout in de opening en jij laat zien hoe je die afstraft. |
| **Op jouw niveau** | Wat spelers op jouw rating echt spelen in een stelling, en welke zet het best scoort. |
| **Repertoire** | Je eigen openingen samenstellen, importeren uit PGN en trainen. |
| **Mijn partijen** | Je partijen ophalen van Lichess of Chess.com. De app laat zien waar je van de theorie afwijkt en zet die posities in je herhalingen. |

Elke variant kun je op drie manieren spelen: **Leren** (met pijlen), **Oefenen** (zelf, met hulp als je vastloopt) en **Uit het hoofd** (zonder hulp).

Motivatie: sterren per variant, XP, een reeks dagen op rij en prestaties (badges) met een eigen icoon.

## Hoe het voelt

- **Rustig en vriendelijk**, als een goede clubtrainer: duidelijk, niet schreeuwerig, geen gamification die afleidt.
- **Weinig tekst.** Het bord staat centraal, uitleg alleen als je erom vraagt.
- **Telefoon eerst.** Grote tikvlakken, een vaste tabbalk onderin, en tijdens het trainen verdwijnt alles behalve het bord.
- **Nederlands**, behalve schaaktermen die schakers zelf in het Engels gebruiken (castling, fork, pin, skewer) en de notatie (Nf3, zoals op Lichess).

## Ontwerprichting

### Sfeer

Warm, rustig en verzorgd, zoals een houten schaakbord in een clubgebouw met een goede lamp erboven. Geen neon, geen gamer-look, geen drukke dashboards. Groen voor het bord en vooruitgang, goud voor beloning (sterren, route, prestaties), een warme crèmekleurige ondergrond in plaats van koud wit.

Het beeldmerk is de **route**: een gestippeld gouden pad dat je stap voor stap volgt. Dat komt terug in het logo, in de dagtraining (de route van vandaag met de stappen erop) en in de namen van prestaties ("Eerste route", "Routeplanner").

### Lettertype

- **Inter** (variabel lettertype, via Fontsource, werkt offline), terugval op het systeemlettertype.
- Lettervarianten `cv11` en `ss01` staan aan voor een rustiger, rondere vorm (onder andere de enkelverdiepte a).
- Cijfers zijn **tabulair** in tabellen en tellers, zodat ze netjes onder elkaar staan.
- Koppen: vet (700), iets strakker gespatieerd (`tracking-tight`). Paginatitel 24 px op de telefoon, 30 px op desktop.
- Knoppen en labels: halfvet (600). Lopende tekst: normaal (400), minimaal 14 px, liefst 16 px.
- Schaaknotatie altijd zoals op Lichess: Nf3, Bb5, O-O.

### Kleuren (licht)

| Rol | Kleur | Gebruik |
|---|---|---|
| Achtergrond | `#faf7f2` | warm crème, de basis van elke pagina |
| Vlak | `#ffffff` | kaarten en panelen |
| Vlak 2 | `#f3eee6` | rustige knoppen, invulvelden, lege balken |
| Lijn | `#e6dfd2` | randen van kaarten |
| Tekst | `#1f2a24` | bijna zwart met een groene ondertoon |
| Gedempte tekst | `#5c615a` | toelichting, labels |
| **Merk (groen)** | `#2f7d4f` | hoofdknoppen, actieve tab, voortgang |
| Merk sterk | `#22603b` | hover, tekst in groen |
| Merk zacht | `#e2f0e6` | geselecteerd, lichte groene vlakken |
| **Accent (goud)** | `#d99a2b` | route, nieuwe meldingen, highlights |
| Accent zacht | `#fbf0da` | gouden achtergrondvlakken |
| Accent tekst | `#8a5a00` | goudkleurige tekst (leesbaar contrast) |
| Ster | `#b4780f` | sterren en reeks-vlammetje |
| Fout | `#c0453a` | foute zet, verlies |
| Info | `#3a6ea5` | remise, neutrale uitleg |

**Schaakbord:** licht veld `#f1e9d8`, donker veld `#8fae86` (zacht groen), laatste zet gemarkeerd in goud (`#edce92` / `#bcb169`).

### Kleuren (donker)

Dezelfde rollen, maar dan op een bijna zwarte groene ondergrond: achtergrond `#121614`, vlak `#1a1f1c`, tekst `#ecefe9`, groen `#4aa86f`, goud `#e8b04a`. Het bord wordt iets gedimd (`#d9d0bd` / `#6d8f68`). De gebruiker kiest systeem, licht of donker.

### Vormen

- Kaarten: wit vlak, dunne lijn, **afgeronde hoeken van 16 px**, geen schaduw.
- Knoppen: **afronding 12 px**, halfvet. Drie soorten: groen (hoofdactie, maximaal één per scherm), rustig (crème met lijn) en stil (alleen tekst).
- Labels en filters: pilvorm (volledig rond).
- Tikvlakken op de telefoon minimaal **44 px** hoog.
- Iconen: Lucide, lijndikte 1,75, altijd met tekst ernaast (behalve in het bodemmenu).
- Mini-borden: uitsnede van 4×4 velden rond de belangrijkste zet, als herkenbaar plaatje bij elke opening en variant.

### Opmaak

- **Telefoon eerst.** Eén kolom, een vaste tabbalk onderin (Start, Vandaag, Herhalen, Openingen, Meer), de hoofdknop altijd zonder scrollen bereikbaar.
- **Focusmodus.** Tijdens het trainen verdwijnen header en tabbalk; er blijft een smalle balk over met sluiten, voortgang en teller.
- **Desktop:** zijbalk links met alle onderdelen in drie groepen (Trainen, Verdiepen, Jij), het bord groot in het midden.
- **Weinig tekst.** Eén korte zin onder een titel, geen uitleg die je al kunt zien. Geen gedachtestreepjes.

### Logo

Een groene pion op een schuin bordfragment van vier zachtgroene velden, op een crème vlak met afgeronde hoeken. Een gestippelde gouden route komt van linksonder en eindigt bij een gouden stip vlak voor de pion: stap voor stap naar je stelling. Kleuren: crème `#faf5ec`, pion `#357d50`, velden `#b4caa8`, route `#e2a531`. Bestanden: `public/icon.svg` (bron), `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (Android) en `apple-touch-icon.png` (iPhone).

## Principes

- **Alleen echte data.** Statistieken komen uit Lichess-partijen, puzzels zijn door Stockfish geverifieerd. Er wordt niets verzonnen.
- **Een fout is een fout.** Een theoriezet uit een andere opening telt niet als goed: je leert jouw lijn.
- **Je voortgang is van jou.** Alles staat lokaal, met een back-up die je zelf maakt en terugzet.
- **Open source** (GPL-3.0), gratis te hosten.

## Wat het niet is

- Geen speelplatform: je speelt geen partijen tegen anderen.
- Geen engine-analyse van je hele partij (Stockfish is alleen een optionele hulp).
- Geen cursus met handgeschreven commentaar per zet. De uitleg komt uit data: de naam van de stelling, hoe vaak hij gespeeld wordt en hoe hij scoort.
