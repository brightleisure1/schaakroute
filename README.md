# SchaakRoute

Een gratis, open-source webapp om schaakopeningen te **leren, oefenen, onthouden en herhalen** — met de
10 populairste openingsfamilies voor wit en de 10 populairste voor zwart, inclusief **alle 2.246 benoemde
varianten en subvarianten** uit de openbare Lichess-openingsdatabase.

**Live:** https://chess.stuby.nl (ook bereikbaar via https://brightleisure1.github.io/schaakroute/, dat doorverwijst)

Geen account, geen abonnement, geen betaalde API's. Alle voortgang staat lokaal (IndexedDB) en de app werkt
na de eerste keer laden offline (PWA).

## Starten

```bash
npm install
npm run dev        # http://localhost:5173
```

Productiebuild (statische bestanden in `dist/`, te hosten op elke gratis statische host):

```bash
npm run build
npm run preview    # http://localhost:4179
```

Testen:

```bash
npm test           # 73 automatische controles (Vitest)
npm run typecheck
```

De geïmporteerde data staat al in `public/data/`, dus de app draait direct zonder de importscripts.

## De 20 openingen

Gekozen op **echte partijaantallen**: 514.654 rated blitz/rapid/classical-partijen uit de Lichess-database
van september 2026 (CC0), gelijk verdeeld over de hele maand bemonsterd (40 vensters van 8 MB verspreid over
het 29,2 GB-bestand, dus alle dagen en tijdstippen). Ratingverdeling (gemiddelde van beide spelers):
<1200: 17% · 1200–1599: 34% · 1600–1999: 37% · 2000+: 12%.

**Wit**

| # | Familie | ECO | Partijen | Aandeel | Varianten | Subvarianten | Puzzels |
|---|---|---|---|---|---|---|---|
| 1 | Italian Game | C50–C59 | 25.743 | 5,00% | 187 | 158 | 360 |
| 2 | London System | A45–D02 | 19.272 | 3,74% | 22 | 9 | 330 |
| 3 | Queen's Gambit | D02–D69 | 18.509 | 3,60% | 275 | 260 | 348 |
| 4 | English Opening | A10–C20 | 14.800 | 2,88% | 176 | 138 | 332 |
| 5 | Scotch Game | C44–C45 | 12.143 | 2,36% | 53 | 15 | 355 |
| 6 | Bishop's Opening | C23–C43 | 11.159 | 2,17% | 41 | 11 | 334 |
| 7 | Ruy Lopez | C60–C99 | 10.964 | 2,13% | 235 | 192 | 339 |
| 8 | King's Gambit | C30–C39 | 7.443 | 1,45% | 191 | 189 | 360 |
| 9 | Vienna Game | C25–C29 | 7.376 | 1,43% | 56 | 35 | 341 |
| 10 | Hungarian Opening | A00–A07 | 5.453 | 1,06% | 20 | 1 | 255 |

**Zwart**

| # | Familie | ECO | Partijen | Aandeel | Varianten | Subvarianten | Puzzels |
|---|---|---|---|---|---|---|---|
| 1 | Sicilian Defense | B20–B99 | 52.072 | 10,12% | 400 | 282 | 350 |
| 2 | French Defense | C00–C19 | 31.043 | 6,03% | 209 | 152 | 345 |
| 3 | Caro-Kann Defense | B10–B19 | 29.113 | 5,66% | 110 | 50 | 334 |
| 4 | Scandinavian Defense | B01 | 26.890 | 5,22% | 45 | 18 | 351 |
| 5 | Philidor Defense | C41 | 13.432 | 2,61% | 44 | 22 | 298 |
| 6 | Pirc Defense | B00–B09 | 10.219 | 1,99% | 28 | 13 | 310 |
| 7 | Modern Defense | A04–B27 | 9.712 | 1,89% | 39 | 14 | 300 |
| 8 | Englund Gambit | A40 | 8.495 | 1,65% | 16 | 6 | 324 |
| 9 | Petrov's Defense | C42–C43 | 7.869 | 1,53% | 50 | 26 | 346 |
| 10 | Four Knights Game | C47–C50 | 7.822 | 1,52% | 49 | 37 | 311 |

De volledige ranglijst (top 40 per kleur) staat in `public/data/ranking.json` en in de app onder
**Bronnen & methode**.

**Extra opening: Alien Gambit (wit).** Deze staat buiten de top 10 en is bewust toegevoegd. Lichess benoemt
alleen de stelling na 6.Nxf7 en plaatst die bij de Caro-Kann, waar je met zwart traint. De 11 lijnen in
`scripts/lib/curated-openings.mjs` volgen de partijensteekproef zolang die zetten heeft en daarna Stockfish; elke
witte zet is beoordeeld met Stockfish. De 89 partijen met deze naam tellen ook mee bij de Caro-Kann. Toevoegen gaat
met `npm run data:curated`.

### Methode (transparant en reproduceerbaar)

1. **Familie** = Lichess-naam vóór de dubbele punt (`Sicilian Defense: Najdorf Variation` → `Sicilian Defense`).
2. `X Accepted`, `X Declined` en `X, with …` worden samengevoegd met `X` als `X` zelf een Lichess-familie is.
   Daardoor horen *Queen's Gambit Accepted/Declined* bij **Queen's Gambit** (wit) en *King's Gambit
   Accepted/Declined* bij **King's Gambit**.
3. Systemen die Lichess onder meerdere hoofdnamen opslaat (London System, King's Indian Attack, Colle System,
   Torre Attack) worden op naam verzameld.
4. **Kant**: namen op *Defense* zijn zwart; anders de kant die de laatste zet doet van de kortste lijn.
5. **Populariteit** = aantal steekproefpartijen waarvan de Lichess-header `Opening` bij de familie hoort.
   Iedere partij telt in precies één familie, dus er zijn geen dubbeltellingen.
6. Generieke verzamelnamen (*Queen's Pawn Game*, *King's Pawn Game*, *Indian Defense*, *Zukertort Opening*,
   *Van't Kruijs Opening*) worden wel gerangschikt, maar niet geselecteerd. Het zijn Lichess-labels voor
   stellingen zonder benoemde opening.

**Kanttekeningen bij de uitkomst:**
- Lichess bestaat vooral uit snelle partijen en clubniveau. Daardoor staan bijvoorbeeld de Englund en de
  Scandinavian hoog en zijn King's Indian, Nimzo-Indian en Slav (zwart) net buiten de top 10 gevallen.
- Door de samenvoegregel zit Queen's Gambit Declined in de witte Queen's Gambit-familie en staat hij niet
  apart bij zwart.
- Wil je een andere selectie, dan kun je de import draaien met een andere maand.

De **Lichess Opening Explorer** (`explorer.lichess.org`) vereist sinds 2025 een OAuth-token (getest: HTTP 401
zonder token). Daarom is de ranglijst gebaseerd op de vrij downloadbare partijendatabase en is de live
Explorer een optionele functie. Een persoonlijk Lichess-token is gratis en stel je in onder Instellingen.

## Wat er gebouwd is

| Onderdeel | Status |
|---|---|
| **Interactieve trainer** | Slepen én klikken op twee velden; volledige regels via chess.js (rokade, en passant, promotie met keuzedialoog, schaak, mat). De computer speelt de boekzetten van de tegenstander, het bord draait naar jouw kant. Bij een zet beoordeelt de trainer of hij **illegaal** is, een **theoretisch alternatief** (een andere variant van dezelfde opening of vaak gespeeld), of **niet de aangeleerde zet**. Met Stockfish aan krijg je ook een oordeel: speelbaar, onnauwkeurig of slecht. Knoppen: Hint (stuk en daarna pijl), Uitleg (naam van de stelling, praktijkstatistiek op jouw niveau, idee van de opening), Terug, Opnieuw, Toon volledige variant, Bekijk alle zetten (klikbaar, ook met de pijltjestoetsen), Volgende training. Na 3 fouten wordt de zet getoond en komt de positie snel terug. |
| **Course** | Per opening een leerpad met niveau 1–5 en Mastery. Varianten worden op frequentie en diepte ingedeeld, in lessen van maximaal 6. Nieuwe varianten eerst *Leren* (met pijlen), daarna direct *Oefenen*. Sterren en afronding per les. |
| **Variations** | Alle varianten per opening, met zoeken (naam, ECO, zetten) en filters: Boom, Meest gespeeld, Hoofd-, Zijvarianten, Gambieten, Tactisch, Minder gebruikelijk, Subvarianten, Nog niet geleerd, Moeilijk, Beheerst. Aantallen komen dynamisch uit de data. |
| **Variantenboom** | Uitklapbare groepen op naamniveau (bijv. Sicilian → Najdorf → English Attack → Anti-English), met frequentie, ECO, transpositie-markering en eigen beheersing per variant. |
| **Crushing** | 6.623 echte openingspuzzels uit de Lichess-puzzeldatabase (CC0, met Stockfish geverifieerd), per opening en per ratingniveau. Je tegenstander maakt de fout, jij vindt de reactie en speelt de combinatie uit. Uitleg komt uit de Lichess-thema's (vork, penning, aanval op f7 …), met optioneel "hoe ontstond deze stelling" via de gratis Lichess-API. Er worden geen combinaties verzonnen. |
| **Advantage** | *Verkennen*: per stelling de meest gespeelde zetten, de frequentie op jouw niveau en winst/remise/verlies, uit 54.746 stellingen uit de steekproef. Optioneel live Lichess Explorer (met token) en Stockfish, duidelijk gescheiden van de praktijk. *Trainen*: jij kiest de zet met de beste praktijkscore op jouw ratingniveau, en de tegenstander speelt wat spelers van jouw niveau vaak spelen. |
| **Mastery (SM-2)** | Iedere te leren zet is een TrainingCard (EPD + verwachte zet) met ease, interval, goed/fout-tellingen, laatste en volgende datum en een beheersingsscore. Een fout komt na 10 minuten terug. Twee trainingen: *losse posities* (met de voorafgaande zetten zichtbaar) en *complete varianten* uit het hoofd, zonder hints. |
| **Dagelijkse training** | Eén doorlopende sessie van 5/10/15/20 minuten: herhalingen (eerdere fouten eerst), nieuwe varianten, moeilijke varianten en tactische kansen. Daarna een samenvatting: goede zetten, fouten, nieuwe en herhaalde posities, XP. |
| **Repertoire** | Eigen repertoires per kleur, los van de standaardtraining. Zetten toevoegen via het bord, hoofdzet en alternatieven, notities, verwijderen met subboom, een variant uit de dataset toevoegen (een conflict wordt een alternatief), PGN-import met varianten, PGN-export, de complete boom en trainen. Omdat kaarten per stelling zijn gesleuteld, blijft je voortgang behouden als je een zet wijzigt. |
| **Mijn partijen** | Import via de Lichess-API (`/api/games/user`), de Chess.com Published-Data API of een PGN-bestand. Analyse: welke openingen je speelt en je score, de slechtst gekende varianten, waar je van de theorie afwijkt ("Train mijn fouten" zet die posities in je herhalingen), afwijkingen van en gaten in je repertoire, en aanbevolen varianten. Zonder import werkt alles normaal. |
| **Gamification** | XP, levels, dagelijkse streak, sterren, 16 badges, voortgangsbalken en een confetti-animatie bij 3 sterren of een badge. |
| **Statistieken** | Alleen echte gebruikersdata: activiteit per dag (met tabelweergave), geleerde posities door de tijd, een heatmap, beheersing per opening en per variant, en de moeilijkste varianten. |
| **Stockfish** | Optioneel: Stockfish 19 lite (WebAssembly, single-threaded) in een Web Worker, volledig lokaal. De app werkt ook zonder. |
| **Offline/PWA** | Service worker met precache van de app en alle data (~9,6 MB). Getest: met de server uit laden de app en alle varianten nog. Daarnaast een IndexedDB-cache per datasetversie. |
| **Ontwerp** | Mobile-first, warme lichte achtergrond, eigen groene accentkleur, donkere modus (systeem, licht of donker), Nederlandse interface, bodemnavigatie op mobiel en een zijbalk op desktop. |

## Databaseontwerp

| Gevraagd | Waar |
|---|---|
| Opening / OpeningFamily | `FamilySummary` in `public/data/manifest.json` en `families/<id>.json` |
| OpeningVariation | `Variation` (ECO, naam, pad, SAN, UCI, eind-EPD, frequentie, tags, niveau, transposities) |
| OpeningPosition | EPD-index per familie (`positionIndex()` in `src/lib/data.ts`), `names.json` (alle 3.865 benoemde stellingen), `stats/<id>.json` |
| Move | SAN/UCI-reeksen per variant; `StatMove` (zet, aantal, resultaten per ratingband) |
| Repertoire / RepertoireMove | Dexie-tabellen `repertoires` en `repMoves` (boom op EPD) |
| TrainingCard | `cards` (SM-2-status, gesleuteld op `EPD\|UCI`) |
| TrainingSession / TrainingAttempt | `sessions`, `attempts` |
| UserProgress | `progress` (per variant: aantal keer, sterren, fouten, hints) en `puzzles` |
| DailyActivity / UserSettings | `daily`, `settings` |

Gebruikersgegevens staan los van de datacache (`datasets`). Bij een nieuwe datasetversie wordt alleen die
cache geleegd en nooit je voortgang. Dat wordt ook getest. Onder Instellingen kun je een back-up maken en
terugzetten (JSON).

## Data opnieuw importeren (reproduceerbaar)

```bash
npm run data:games          # steekproef uit de Lichess-partijendatabase (~320 MB download, zstd vereist)
npm run data:fetch-puzzles  # Lichess-puzzeldatabase (~300 MB)
npm run data:all            # openingen + statistieken + lessen + puzzels → public/data
```

- `scripts/import-openings.mjs` haalt `a.tsv`–`e.tsv` op van een **vaste commit** van
  `lichess-org/chess-openings` (`--ref master` voor de nieuwste). Daarna speelt het iedere lijn na met chess.js
  (3.865 legaal, 0 illegaal), deelt de families in, rangschikt ze, ontdubbelt, detecteert transposities, maakt
  lessen en berekent de positiestatistieken.
- Het rapport per familie staat in `manifest.json → validation` en in de app.
- De datasetversie bevat de bron-commit, een hash van de bronbestanden, de maand en een hash van de uitvoer.
- Families indelen gebeurt met de regels in `scripts/lib/families.mjs`, dezelfde code die de tests gebruiken.

## Automatische controles (`npm test`)

- Precies 10 witte en 10 zwarte families; de selectie is exact de top 10 van de ranglijst; geen dubbeltellingen.
- **Volledigheid**: iedere bronregel van iedere geselecteerde familie zit in de app, en de aantallen kloppen met
  de interface.
- Iedere variant in alle 20 families is legaal nagespeeld: SAN, UCI en eind-EPD kloppen, ID's zijn uniek, er
  zijn geen dubbele varianten en transposities zijn echte transposities.
- Iedere variant zit in precies één les.
- Statistieken en puzzels bevatten alleen legale zetten, en de oplosser is de kant van de opening.
- SM-2: de intervallen, de herleerstap en de minimale ease; de beheersingsscore.
- Zetbeoordeling: illegaal, correct, alternatief en fout; rokade, en passant, promotie en mat.
- Opslag (fake-indexeddb): kaarten, pogingen, dagactiviteit, persistentie na heropenen, back-up, repertoire
  (conflict wordt alternatief, wisselen van hoofdzet, subboom verwijderen) en een datasetupdate die de
  voortgang intact laat.

Daarnaast is in de browser handmatig getest: onboarding, dashboard, de trainer (klikken, slepen, alternatief,
fout, hint, afronden met sterren, XP en badge), Course, Crushing, Advantage, Mastery, de dagelijkse training,
het repertoire met PGN-import, partij-import via Lichess, Stockfish, mobiel (375 px) en offline.

## Gratis hosten

`npm run build` levert een statische site op (`base: './'`, hash-routing). Die werkt zonder serverconfiguratie
op bijvoorbeeld GitHub Pages, Cloudflare Pages of Netlify. Hun gratis niveaus hebben limieten op bandbreedte en
builds; voor persoonlijk gebruik is dat ruim voldoende. Een eigen domein is niet nodig.

## Licenties

- **SchaakRoute**: GPL-3.0-or-later (zie `LICENSE`), omdat de app Stockfish meelevert.
- **Stockfish 19** via stockfish.js (Nathan Rugg): GPLv3. De engine is ongewijzigd en staat met licentietekst
  en bronverwijzing in `public/engine/` (`SOURCE.md`, `COPYING.txt`). De broncode van deze build staat op
  https://github.com/nmrugg/stockfish.js/tree/v19.0.1. De engine draait als apart programma in een Web Worker.
- chess.js (BSD-2-Clause), react-chessboard (MIT, ook de stukken), React (MIT), Dexie (Apache-2.0),
  Tailwind CSS (MIT), Vite en vite-plugin-pwa (MIT).
- Lichess-openingen, -partijen en -puzzels: CC0 1.0.
- Lotus Chess diende alleen als inspiratie voor de leerervaring. Er is geen tekst, afbeelding of vormgeving
  overgenomen.

## Bekende beperkingen en mogelijke vervolgstappen

- De **Lichess Opening Explorer** werkt alleen met een (gratis) persoonlijk token. Zonder token gebruikt de app
  de offline steekproef. Die is betrouwbaar tot ongeveer 24 halve zetten diep; dieper ontbreekt praktijkdata.
- De **uitleg per zet** komt uit data (naam van de stelling, frequentie, score, het idee van de opening). Er is
  geen handgeschreven commentaar per variant; dat zou verzonnen of auteursrechtelijk beschermd materiaal vereisen.
- **Crushing** gebruikt alleen door Lichess geverifieerde puzzels. Er wordt geen eigen Stockfish-detectie van
  "fouten in de opening" gegenereerd; dat is bewust, om geen onbetrouwbare winsten te tonen.
- Kaarten en voortgang zijn per apparaat. Synchronisatie tussen apparaten gaat via back-up en terugzetten.
- De categorieën hoofd-, zij- en zeldzame variant zijn afgeleid van de frequentie in de steekproef (≥1%,
  ≥0,05%, lager). "Tactisch" en "gambiet" zijn afgeleid van de naam.
- De statistieken komen uit één maand Lichess-partijen. Een grotere steekproef (meer vensters of maanden) kan
  met `node scripts/sample-games.mjs <maand> <vensters> <MB>`.
