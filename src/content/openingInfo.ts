import { getLang } from '../lib/i18n'

export interface OpeningInfo {
  /** Nederlandse naam onder de Engelse naam; in het Engels leeg (zou de Engelse naam herhalen) */
  nameNl?: string
  summary: string
  idea: string
  plans: string[]
  strengths: string[]
  weaknesses: string[]
  keyMoves: string
  tip: string
}

/** De vertaalbare tekst van een opening (naam en zetten blijven gelijk) */
type OpeningText = Pick<OpeningInfo, 'summary' | 'idea' | 'plans' | 'strengths' | 'weaknesses' | 'tip'>

const INFO_NL = {
  // ===================== WIT =====================

  "alien-gambit": {
    nameNl: "Alien-gambiet",
    summary:
      "De Alien Gambit is een wild stukoffer tegen de Caro-Kann: na 5.Ng5 h6 slaat wit met 6.Nxf7 op f7. Wit geeft een paard voor een pion, haalt de zwarte koning naar voren en neemt zwart de rokade af. Objectief is het offer niet correct (Stockfish geeft zwart ongeveer 2 pionnen voordeel), maar in snelle partijen op Lichess scoort wit er goed mee.",
    idea:
      "Wit ruilt materiaal in voor tijd en een onveilige zwarte koning. Met Nf3-e5+ en Bc4+ komen de stukken met tempo in het spel, terwijl zwart nog moet uitzoeken waar de koning veilig staat.",
    plans: [
      "Ontwikkel met schaak: Nf3 gevolgd door Ne5+ en Bc4+ kosten zwart tijd.",
      "Speel Ng6 als de koning naar g8 gaat: het paard valt de toren op h8 aan en houdt de koning opgesloten.",
      "Let op ...Bg4: met Ne5+ val je koning en loper tegelijk aan en win je het stuk terug.",
      "Tegen ...Bf5 win je met g4 en g5 ruimte op de koningsvleugel en opent de loper op c1 de aanval.",
      "Rokeer snel en breng de dame en torens naar de open lijnen rond de zwarte koning.",
    ],
    strengths: [
      "Groot verrassingseffect: weinig zwartspelers kennen de juiste antwoorden.",
      "Zwart moet zelf de weg vinden en de witte aanval speelt zich makkelijk.",
      "Een bekende valstrik na 7...Bg4 levert wit direct voordeel op.",
      "In onze steekproef won wit 46 van de 89 partijen, tegen 38 verliespartijen.",
    ],
    weaknesses: [
      "Objectief verloren materiaal: met goed spel houdt zwart een stuk meer voor te weinig compensatie.",
      "Werkt alleen als zwart meegaat tot 5...h6: na andere vijfde zetten is er geen offer op f7.",
      "Tegen voorbereide tegenstanders blijft er weinig over, zeker met langere bedenktijd.",
    ],
    keyMoves: "1.e4 c6 2.d4 d5 3.Nc3 dxe4 4.Nxe4 Nf6 5.Ng5 h6 6.Nxf7",
    tip:
      "Gebruik dit vooral in blitz en rapid. Hetzelfde offer werkt ook via 3.Nd2. Stelt zwart de aanval goed af, ga dan niet forceren maar speel rustig door met je actieve stukken.",
  },

  "nakhmanson-gambit": {
    nameNl: "Nakhmanson-gambiet",
    summary:
      "De Nakhmanson Gambit is een scherp offer in het Schots gambiet: na 5.O-O Nxe4 speelt wit 6.Nc3 en laat het paard op c3 gewoon slaan. Na 6...dxc3 volgt 7.Bxf7+ Kxf7 8.Qd5+ en wit wint het paard op e4 terug met een open lijn naar de zwarte koning. Volgens Stockfish is het ongeveer gelijk, maar zwart moet precies weten wat hij doet.",
    idea:
      "Wit geeft materiaal voor snelle ontwikkeling. Met Bxf7+ en Qd5+ wordt de zwarte koning uit zijn schuilplaats gehaald, en via Re1 en de e-lijn valt wit het paard op e4 en de koning aan.",
    plans: [
      "Na 6...dxc3 speel je 7.Bxf7+ en 8.Qd5+: de dame schaakt en valt tegelijk het paard op e4 aan.",
      "Breng de toren met Re1 naar de e-lijn en neem het paard op e4 terug.",
      "Met Bg5 ruil je de verdedigende loper van zwart af of pen je stukken op de e-lijn.",
      "Speelt zwart 8...Kg6, dan wint 9.Qxe4+ Kf7 10.Ng5+ de dame.",
      "Slaat zwart 6...Nxc3, dan herneem je met bxc3 en speel je actief met Bb5 en Ne5.",
    ],
    strengths: [
      "Weinig zwartspelers kennen het offer; de natuurlijke zetten lopen snel tegen een valstrik aan.",
      "Wit ontwikkelt met tempo en de zwarte koning kan niet meer rokeren.",
      "Objectief houdbaar: Stockfish ziet het als ongeveer gelijk.",
    ],
    weaknesses: [
      "Wit blijft na 10.Rxe4 een stuk achter en moet de aanval precies voeren om het terug te winnen.",
      "Werkt alleen als zwart 5...Nxe4 speelt; na andere vijfde zetten is er geen offer.",
      "Weinig partijen: in onze steekproef zijn het er maar 11, dus de vervolgen komen vooral van Stockfish.",
    ],
    keyMoves: "1.e4 e5 2.Nf3 Nc6 3.Bc4 Nf6 4.d4 exd4 5.O-O Nxe4 6.Nc3",
    tip:
      "Je komt er ook via 3.d4 exd4 4.Bc4 Nf6 5.O-O Nxe4 6.Nc3. Ken vooral de lijn tot 10.Rxe4: je staat dan een stuk achter, maar met Bg5 en Rae1 drukken al je stukken op de gepende loper op e7 en de zwarte koning.",
  },

  "italian-game": {
    nameNl: "Italiaans",
    summary:
      "Het Italiaans is een van de oudste openingen in het schaken. Wit ontwikkelt het paard naar f3 en de loper naar c4, waar die het kwetsbare punt f7 onder vuur neemt. Afhankelijk van de keuze van wit wordt het spel scherp en open, of juist rustig en positioneel.",
    idea:
      "Wit wil snel ontwikkelen, kort rokeren en met c3 en d4 een sterk pionnencentrum opbouwen, terwijl de loper op c4 de druk op f7 vasthoudt.",
    plans: [
      "Met c3 gevolgd door d4 het centrum innemen en zwart terugdringen.",
      "Rustige opbouw met d3, c3 en castling, daarna het damepaard via d2 en f1 naar g3 manoeuvreren.",
      "De loper bij aanvallen terugtrekken naar b3 of a2, zodat de diagonaal naar f7 open blijft.",
      "Ruimte winnen op de damevleugel met a4 en b4.",
      "In open stellingen de lijnen gebruiken voor een aanval op de zwarte koning.",
    ],
    strengths: [
      "Natuurlijke, logische ontwikkeling die makkelijk te leren is.",
      "Directe druk op f7, het zwakste punt in de zwarte stelling.",
      "Flexibel: wit kan kiezen tussen scherp spel en een rustige opbouw.",
      "Snelle castling zorgt voor een veilige koning.",
    ],
    weaknesses: [
      "Zwart krijgt met ...Bc5 of ...Nf6 snel volwaardig tegenspel.",
      "In de rustige varianten is het witte voordeel vaak klein.",
      "Te vroege aanvallen op f7 zonder voldoende ontwikkeling lopen vaak dood.",
    ],
    keyMoves: "1.e4 e5 2.Nf3 Nc6 3.Bc4",
    tip:
      "Ga niet te snel met het paard naar g5 om f7 aan te vallen: eerst ontwikkelen en rokeren levert in clubpartijen meestal meer op.",
  },

  "london-system": {
    nameNl: "Londen-systeem",
    summary:
      "Het Londen-systeem is een solide openingssysteem waarin wit bijna altijd dezelfde opstelling kiest: d4, Bf4, e3, Nf3, c3, Bd3 en Nbd2. Het staat bekend als betrouwbaar, overzichtelijk en weinig theoriegevoelig.",
    idea:
      "Wit bouwt een stevige pionnenpiramide op c3, d4 en e3 en ontwikkelt de dameloper vóór e3, zodat die niet achter de eigen pionnen opgesloten raakt.",
    plans: [
      "Het paard naar e5 brengen, eventueel ondersteund met f4, als basis voor een aanval op de koningsvleugel.",
      "Met h3 een terugtrekveld voor de loper op f4 maken, zodat die niet geruild of verjaagd kan worden.",
      "De loper op d3 en de dame op c2 of f3 richten op de zwarte koningsstelling.",
      "Op het juiste moment e4 spelen om het centrum te openen.",
    ],
    strengths: [
      "Bijna tegen elke zwarte opstelling bruikbaar.",
      "Weinig theorie: de plannen zijn belangrijker dan concrete zetvolgordes.",
      "Zeer solide pionnenstructuur met weinig zwaktes.",
      "Duidelijke, herkenbare plannen voor het middenspel.",
    ],
    weaknesses: [
      "Wit zet zwart weinig directe druk; zwart kan vaak gemakkelijk gelijkspel bereiken.",
      "Met een vroege ...c5 en ...Qb6 kan zwart de pion op b2 onder druk zetten.",
      "Het systeem is voorspelbaar, waardoor tegenstanders zich er goed op kunnen voorbereiden.",
    ],
    keyMoves: "1.d4 d5 2.Bf4 Nf6 3.e3",
    tip:
      "Let op de combinatie ...c5 en ...Qb6: de pion op b2 is dan vaak het doelwit. Met Qb3 of Qc1 los je dat meestal eenvoudig op.",
  },

  "queens-gambit": {
    nameNl: "Damegambiet",
    summary:
      "Bij het Damegambiet biedt wit met 2.c4 een pion aan om de zwarte d5-pion uit het centrum te lokken. Het is geen echt gambiet: na 2...dxc4 (Aangenomen Damegambiet) wint wit de pion meestal terug, en na 2...e6 (Afgewezen Damegambiet) ontstaat een strategische strijd om het centrum.",
    idea:
      "Wit wil het centrum beheersen met pionnen op d4 en liefst ook e4, en de halfopen c-lijn gebruiken voor druk op de zwarte damevleugel.",
    plans: [
      "Tegen het Aangenomen Damegambiet met e3 of e4 het centrum opbouwen en de pion later met Bxc4 terugnemen.",
      "Tegen het Afgewezen Damegambiet het paard op f6 penden met Bg5 om de druk op d5 te vergroten.",
      "In de ruilvariant (cxd5 exd5) een minderheidsaanval voeren met b4 en b5 tegen de zwarte damevleugel.",
      "Torens naar de c-lijn brengen en druk zetten op c6 of c7.",
      "Met een geïsoleerde d-pion actief spelen en de stukken richten op de zwarte koning.",
    ],
    strengths: [
      "Principieel en gezond: wit vecht direct om het centrum.",
      "Langdurig initiatief zonder echt materiaal te riskeren.",
      "De typische pionnenstructuren zijn goed bekend en leerzaam.",
      "Speelbaar op elk niveau, van club tot wereldtop.",
    ],
    weaknesses: [
      "Tegen het Afgewezen Damegambiet kan zwart zeer solide staan.",
      "Wie na 2...dxc4 te gretig de pion terug wil winnen, verliest ontwikkelingstijd.",
      "Vereist strategisch begrip van structuren zoals de geïsoleerde pion en hangende pionnen.",
    ],
    keyMoves: "1.d4 d5 2.c4",
    tip:
      "Na 2...dxc4 hoef je niet te haasten: ontwikkel gewoon en neem de pion later met de loper terug. Probeert zwart de pion met ...b5 vast te houden, dan is a4 vaak het juiste antwoord.",
  },

  "english-opening": {
    nameNl: "Engels",
    summary:
      "Het Engels begint met 1.c4 en is een flexibele flankopening. Wit controleert het veld d5 vanaf de zijkant en kan later overgaan naar structuren uit andere openingen, zoals een omgekeerd Siciliaans of een Damegambiet.",
    idea:
      "Wit bestrijdt het centrum vanaf de flank, meestal met een fianchetto op g2, en wacht met het bezetten van het centrum met pionnen tot de stelling daarom vraagt.",
    plans: [
      "Fianchetto met g3 en Bg2 voor druk op de lange diagonaal naar b7.",
      "Ruimte winnen op de damevleugel met Rb1, a3, b4 en eventueel b5.",
      "Met Nc3 en d3 het veld d5 beheersen en dat als steunpunt gebruiken.",
      "Op een geschikt moment d4 spelen en overgaan naar een stelling met een sterk centrum.",
    ],
    strengths: [
      "Zeer flexibel: wit bepaalt zelf het karakter van de stelling.",
      "Minder forcerende theorie dan bij 1.e4 of 1.d4.",
      "Geschikt voor positioneel spel en langzame opbouw van druk.",
      "Ontwijkt veel voorbereiding van de tegenstander.",
    ],
    weaknesses: [
      "Zwart krijgt veel vrijheid om het centrum met pionnen te bezetten.",
      "Minder directe aanvalskansen dan bij scherpe e4-openingen.",
      "Vraagt kennis van structuren uit andere openingen vanwege de vele overgangen.",
    ],
    keyMoves: "1.c4",
    tip:
      "Tegen 1...e5 speel je in feite een Siciliaans met een tempo extra: kies een rustige opbouw met Nc3, g3 en Bg2 en vertrouw op dat extra tempo.",
  },

  "scotch-game": {
    nameNl: "Schots",
    summary:
      "Het Schots opent met 3.d4 direct het centrum. Na 3...exd4 4.Nxd4 heeft wit ruimtevoordeel en vrij spel voor de stukken. Het is een directe opening met duidelijke plannen en minder theorie dan het Spaans.",
    idea:
      "Wit lost de spanning in het centrum meteen op en wil met de pion op e4 en een centraal paard ruimte en een snelle ontwikkeling bereiken.",
    plans: [
      "Het paard centraal op d4 houden, gesteund door Be3 en c3.",
      "Ontwikkelen met Nc3, Be3 en Qd2, eventueel gevolgd door een queenside castling en een aanval.",
      "Met e5 het paard op f6 verjagen en ruimte winnen.",
      "Na een ruil op c6 de zwakkere zwarte pionnenstructuur onder druk zetten.",
    ],
    strengths: [
      "Heldere plannen en een eenvoudig te begrijpen centrumstructuur.",
      "Ruimtevoordeel en vrij spel voor de witte stukken.",
      "Ontwijkt de grote hoeveelheid Spaanse theorie.",
    ],
    weaknesses: [
      "Doordat het centrum vroeg opengaat, krijgen ook de zwarte stukken vrij spel.",
      "Het paard op d4 kan een doelwit worden voor ...Bc5 of ...Qf6.",
      "Minder langdurige spanning dan in het Spaans, waardoor het voordeel kleiner kan zijn.",
    ],
    keyMoves: "1.e4 e5 2.Nf3 Nc6 3.d4",
    tip:
      "Let na 4.Nxd4 op zwarte druk op d4 en f2 met ...Bc5 en ...Qf6. Met Be3 en c3 staat het paard op d4 stevig.",
  },

  "bishops-opening": {
    nameNl: "Loperopening",
    summary:
      "In de Loperopening speelt wit meteen 2.Bc4 en richt de loper op f7. Het is een flexibele opening die vaak overgaat in het Italiaans of het Weens, maar wit houdt daarbij de optie f4 open.",
    idea:
      "Wit ontwikkelt de loper vroeg en laat het paard op g1 nog even staan, zodat f4 mogelijk blijft of later alsnog Nf3 volgt.",
    plans: [
      "Rustige opbouw met d3, Nf3, c3 en castling, gevolgd door d4.",
      "Op een geschikt moment f4 spelen voor een aanval over de f-lijn.",
      "Met Nc3 overgaan naar Weense structuren.",
      "De loper op de diagonaal naar f7 houden en de druk op de zwarte koningsvleugel opvoeren.",
    ],
    strengths: [
      "Flexibel: wit kan kiezen tussen meerdere opstellingen.",
      "Ontwijkt het Russisch (Petrov), omdat Nf3 nog niet gespeeld is.",
      "Directe druk op f7.",
      "Weinig verplichte theorie.",
    ],
    weaknesses: [
      "Zwart kan met ...Nf6 en ...d5 het centrum gemakkelijk vrijmaken.",
      "Na d3 kan de witte opstelling passief worden als een duidelijk plan ontbreekt.",
      "De loper op c4 kan een doelwit worden van ...d5 of ...Na5.",
    ],
    keyMoves: "1.e4 e5 2.Bc4",
    tip:
      "Na 2...Nf6 is 3.d3 een rustige en solide keuze: je dekt e4 en houdt alle opties open.",
  },

  "ruy-lopez": {
    nameNl: "Spaans",
    summary:
      "Het Spaans is een van de belangrijkste openingen in de schaakgeschiedenis. Met 3.Bb5 valt wit het paard aan dat e5 verdedigt en bouwt het langzaam druk op. Het spel is meestal strategisch en rijk aan plannen.",
    idea:
      "Wit wil langdurige druk op het zwarte centrum uitoefenen en met c3 en d4 een sterk pionnencentrum opbouwen.",
    plans: [
      "Met c3 en d4 het centrum versterken.",
      "Opbouw met Re1 en h3, gevolgd door het damepaard via d2 en f1 naar g3.",
      "De loper na ...a6 en ...b5 terugtrekken naar b3 en later c2, gericht op de koningsvleugel.",
      "Op de damevleugel lijnen openen met a4.",
      "Een paard naar f5 brengen als onderdeel van een aanval op de koningsvleugel.",
    ],
    strengths: [
      "Langdurige, aanhoudende druk zonder materiaal te offeren.",
      "Rijk aan strategische plannen en leerzaam voor het middenspel.",
      "Bewezen op het hoogste niveau.",
      "Flexibel tegen vrijwel elke zwarte opstelling.",
    ],
    weaknesses: [
      "Veel theorie, vooral tegen het Berlijns en het Marshall-gambiet.",
      "Zwart heeft veel betrouwbare verdedigingen.",
      "Strategisch veeleisend; snelle winsten zijn zeldzaam.",
    ],
    keyMoves: "1.e4 e5 2.Nf3 Nc6 3.Bb5",
    tip:
      "De pion op e5 hangt in de beginfase meestal nog niet: na Bxc6 gevolgd door Nxe5 wint zwart de pion vaak terug met ...Qd4 of ...Qg5. Bouw dus rustig op.",
  },

  "kings-gambit": {
    nameNl: "Koningsgambiet",
    summary:
      "Het Koningsgambiet is een romantische opening waarin wit met 2.f4 een pion offert. Na 2...exf4 (Aangenomen) krijgt wit kansen op een sterk centrum en een open f-lijn; zwart kan het gambiet ook afwijzen, bijvoorbeeld met 2...Bc5 of 2...d5.",
    idea:
      "Wit offert een pion om de zwarte e-pion weg te lokken, het centrum met d4 over te nemen en via de f-lijn aan te vallen op f7.",
    plans: [
      "Na 2...exf4 snel Nf3 spelen om ...Qh4+ te voorkomen.",
      "Met d4 het centrum innemen en de pion op f4 later terugwinnen, bijvoorbeeld met Bxf4.",
      "Met Bc4 en een kingside castling de f-lijn en het punt f7 onder vuur nemen.",
      "Tegen het afgewezen gambiet snel ontwikkelen met Nf3, Nc3 en Bc4 en de f-lijn later openen.",
    ],
    strengths: [
      "Direct initiatief en een open spel vanaf de eerste zetten.",
      "Groot verrassingseffect, zeker in snelle partijen.",
      "De open f-lijn geeft aanvalskansen tegen de zwarte koning.",
      "Veel praktische kansen tegen onvoorbereide tegenstanders.",
    ],
    weaknesses: [
      "De witte koning wordt verzwakt, vooral op de diagonaal e1-h4.",
      "Met goede verdediging houdt zwart het materiaal of krijgt het sterk tegenspel.",
      "Er bestaat veel scherpe theorie waarin één fout direct beslissend kan zijn.",
    ],
    keyMoves: "1.e4 e5 2.f4",
    tip:
      "Na 2...exf4 speel je meestal 3.Nf3 om ...Qh4+ te voorkomen. Na 2...Bc5 nooit direct fxe5 spelen, want dan volgt ...Qh4+ met grote problemen.",
  },

  "vienna-game": {
    nameNl: "Weens",
    summary:
      "Het Weens begint met 2.Nc3 en is een flexibele opening. Wit dekt e4 en bereidt vaak f4 voor, zoals in het Weens gambiet, waardoor een soort Koningsgambiet ontstaat met een extra ontwikkeld stuk.",
    idea:
      "Wit ontwikkelt eerst het damepaard zodat f4 beter voorbereid is, of kiest een rustige opbouw met g3 en Bg2.",
    plans: [
      "Met f4 (Weens gambiet) de e5-pion aanvallen en de f-lijn openen.",
      "Na fxe5 de pion op e5 gebruiken om ruimte te winnen en het paard op f6 te verjagen.",
      "Rustige opbouw met g3 en Bg2 voor druk op de lange diagonaal.",
      "Met Bc4 de loper op f7 richten en later f4 spelen.",
    ],
    strengths: [
      "Flexibel: zowel scherpe als rustige plannen zijn mogelijk.",
      "Het Weens gambiet heeft een groot verrassingseffect.",
      "Ontwijkt het Russisch (Petrov) en veel bekende theorie.",
    ],
    weaknesses: [
      "Tegen het Weens gambiet kan zwart met ...d5 krachtig terugslaan in het centrum.",
      "In de rustige varianten is het witte voordeel beperkt.",
      "Het vroege f4 verzwakt de witte koningsstelling.",
    ],
    keyMoves: "1.e4 e5 2.Nc3",
    tip:
      "Bereid je goed voor op de zwarte reactie ...d5 tegen het Weens gambiet: dat is de belangrijkste verdediging en bepaalt vaak het verloop van de partij.",
  },

  "hungarian-opening": {
    nameNl: "Hongaarse opening",
    summary:
      "De Hongaarse opening begint met 1.g3 en bereidt een fianchetto van de koningsloper voor. Het is een flexibel, positioneel systeem waarbij wit vaak overgaat in een Engels of een Koningsindische opstelling met wit.",
    idea:
      "Wit zet de loper op g2 voor druk op de lange diagonaal en het centrum, en kiest pas later welke pionnenopbouw het beste past.",
    plans: [
      "Opbouw met Bg2, Nf3, kingside castling, d3 en e4 voor een Koningsindische opstelling.",
      "Met c4 overgaan naar Engelse structuren.",
      "De loper op g2 gebruiken voor druk op b7 en het centrum.",
      "Ruimte winnen op de damevleugel met c4, b4 en Rb1.",
    ],
    strengths: [
      "Zeer flexibel en moeilijk voor te bereiden.",
      "Veilige koning na een snelle kingside castling.",
      "Weinig theorie die je uit je hoofd moet kennen.",
    ],
    weaknesses: [
      "Zwart krijgt veel vrijheid om het centrum met pionnen te bezetten.",
      "Weinig directe druk; de stelling is vaak snel in evenwicht.",
      "Door de vele overgangen is kennis van andere openingen nodig.",
    ],
    keyMoves: "1.g3",
    tip:
      "Kies een vaste opbouw, bijvoorbeeld Bg2, Nf3, kingside castling, d3 en e4, zodat je niet elke partij opnieuw hoeft te bedenken.",
  },

  // ===================== ZWART =====================

  "sicilian-defense": {
    nameNl: "Siciliaans",
    summary:
      "Het Siciliaans is de populairste verdediging tegen 1.e4. Met 1...c5 vecht zwart asymmetrisch om het veld d4, wat leidt tot onevenwichtige, scherpe stellingen waarin beide kanten winstkansen hebben.",
    idea:
      "Zwart ruilt in het open Siciliaans de c-pion tegen de witte d-pion en krijgt daardoor een extra centrumpion en de halfopen c-lijn voor tegenspel.",
    plans: [
      "De halfopen c-lijn gebruiken met een toren op c8 en druk op c3.",
      "Op de damevleugel ruimte winnen met ...a6 en ...b5.",
      "Op het juiste moment ...d5 spelen om het centrum te bevrijden.",
      "In sommige systemen de loper fianchetteren op g7 voor druk op de lange diagonaal.",
      "Tegenspel op de damevleugel zoeken terwijl wit op de koningsvleugel aanvalt.",
    ],
    strengths: [
      "Goede winstkansen voor zwart door de onevenwichtige stellingen.",
      "Actief tegenspel in plaats van passieve verdediging.",
      "Extra centrumpion na de ruil op d4.",
      "Veel verschillende systemen om uit te kiezen.",
    ],
    weaknesses: [
      "Veel en scherpe theorie in de hoofdvarianten.",
      "Witte aanvallen op de koningsvleugel kunnen zeer gevaarlijk zijn.",
      "Anti-Siciliaanse systemen zoals 2.c3 vragen extra voorbereiding.",
      "In sommige structuren ontstaan zwakke velden zoals d5 of een achtergebleven pion op d6.",
    ],
    keyMoves: "1.e4 c5",
    tip:
      "Kies een systeem dat bij je speelstijl past en zorg dat je ook een plan hebt tegen 2.c3 (Alapin), want dat kom je in clubpartijen vaak tegen.",
  },

  "french-defense": {
    nameNl: "Frans",
    summary:
      "Het Frans begint met 1...e6, gevolgd door ...d5. Zwart krijgt een solide maar wat gedrongen stelling en vecht met pionnenbreuken tegen het witte centrum.",
    idea:
      "Zwart valt de witte pionnenketen aan bij de basis, met ...c5 tegen d4 en vaak ook ...f6 tegen e5.",
    plans: [
      "Met ...c5 de witte pion op d4 aanvallen.",
      "Druk op d4 opvoeren met ...Nc6 en ...Qb6.",
      "Met ...f6 de witte pion op e5 aanvallen en de f-lijn openen.",
      "De slechte dameloper activeren, bijvoorbeeld via ...b6 en ...Ba6 of via d7 naar b5.",
    ],
    strengths: [
      "Solide stelling met duidelijke pionnenbreuken.",
      "Heldere strategische plannen.",
      "Lastig voor witspelers die op een snelle aanval rekenen.",
    ],
    weaknesses: [
      "De loper op c8 zit vaak achter de eigen pionnen opgesloten.",
      "Zwart heeft minder ruimte, vooral na e5 van wit.",
      "Wit kan na e5 gevaarlijke aanvallen op de koningsvleugel opzetten.",
    ],
    keyMoves: "1.e4 e6 2.d4 d5",
    tip:
      "Speelt wit e5, ga dan snel met ...c5 in de aanval en zet druk op d4 met ...Nc6 en ...Qb6. Wacht je te lang, dan krijgt wit vrij spel op de koningsvleugel.",
  },

  "caro-kann-defense": {
    nameNl: "Caro-Kann",
    summary:
      "Het Caro-Kann begint met 1...c6 en bereidt ...d5 voor. Het is een van de meest solide verdedigingen tegen 1.e4: zwart krijgt een gezonde pionnenstructuur en kan de dameloper vaak buiten de pionnenketen ontwikkelen.",
    idea:
      "Zwart vecht met ...d5 om het centrum, gesteund door de pion op c6, en ontwikkelt de dameloper naar f5 of g4 voordat ...e6 volgt.",
    plans: [
      "De dameloper naar f5 of g4 ontwikkelen en pas daarna ...e6 spelen.",
      "In de doorschuifvariant het witte centrum aanvallen met ...c5.",
      "Solide opbouw met ...Nd7, ...Ngf6 en ...e6.",
      "Mikken op een gunstig eindspel dankzij de gezonde pionnenstructuur.",
    ],
    strengths: [
      "Zeer solide met weinig structurele zwaktes.",
      "De dameloper komt actief buiten de pionnenketen.",
      "Goede eindspelen dankzij de gezonde pionnenstructuur.",
    ],
    weaknesses: [
      "Kan passief worden als zwart geen actief plan kiest.",
      "Wit kan met de doorschuifvariant of de Panov-aanval agressief spelen.",
      "De ontwikkeling van zwart verloopt soms trager dan bij andere verdedigingen.",
    ],
    keyMoves: "1.e4 c6 2.d4 d5",
    tip:
      "In de doorschuifvariant (3.e5) ontwikkel je eerst de loper naar f5 en speel je pas daarna ...e6, gevolgd door ...c5.",
  },

  "scandinavian-defense": {
    nameNl: "Scandinavisch",
    summary:
      "Het Scandinavisch valt met 1...d5 meteen de pion op e4 aan. Na 2.exd5 neemt zwart terug met de dame of speelt eerst ...Nf6. Het is eenvoudig te leren en leidt tot overzichtelijke stellingen.",
    idea:
      "Zwart dwingt direct een beslissing in het centrum af en krijgt vrij spel voor de stukken met een solide structuur van pionnen op c6 en e6.",
    plans: [
      "De dame na Nc3 terugtrekken naar een veilig veld zoals a5 of d6.",
      "De dameloper actief ontwikkelen naar f5 of g4.",
      "Een stevige pionnenstructuur opbouwen met ...c6 en ...e6.",
      "Snel ontwikkelen met ...Nf6, ...Nbd7 en rokeren.",
    ],
    strengths: [
      "Weinig theorie en snel te leren.",
      "Zwart bepaalt zelf de structuur vanaf de eerste zet.",
      "Eenvoudige en natuurlijke ontwikkeling van de stukken.",
      "Verrassend voor tegenstanders die op 1...e5 of 1...c5 rekenen.",
    ],
    weaknesses: [
      "De dame verliest tempo wanneer ze wordt aangevallen.",
      "Wit krijgt vaak een kleine voorsprong in ontwikkeling.",
      "Wit heeft meestal iets meer ruimte in het centrum.",
    ],
    keyMoves: "1.e4 d5 2.exd5 Qxd5",
    tip:
      "Zet de dame na Nc3 op een veilig veld zoals a5 of d6 en ontwikkel daarna snel: verspil geen extra tempo met de dame.",
  },

  "philidor-defense": {
    nameNl: "Philidor-verdediging",
    summary:
      "De Philidor-verdediging dekt de pion op e5 met 2...d6. Zwart kiest een solide, wat afwachtende opstelling en wacht op het juiste moment voor tegenspel.",
    idea:
      "Zwart houdt het steunpunt e5 vast, vaak met de opstelling ...Nf6, ...Nbd7, ...Be7 en ...c6, en ontwikkelt zich compact achter de pionnen.",
    plans: [
      "De pion op e5 vasthouden met ...Nbd7 en een compacte opbouw.",
      "Na een ruil op d4 actief spelen met de stukken en druk zetten op e4.",
      "Ruimte winnen op de damevleugel met ...c6, ...a6 en ...b5.",
      "Hergroeperen met ...Re8 en ...Bf8 om de stelling te versterken.",
    ],
    strengths: [
      "Solide en moeilijk te doorbreken.",
      "Ontwijkt veel theorie van het Spaans en het Italiaans.",
      "Eenvoudige opstelling met duidelijke plannen.",
    ],
    weaknesses: [
      "Passief: wit krijgt vaak meer ruimte.",
      "De loper op e7 staat vaak wat gedrongen.",
      "Een onjuiste zetvolgorde kan leiden tot problemen rond f7.",
    ],
    keyMoves: "1.e4 e5 2.Nf3 d6",
    tip:
      "Speel tegen 3.d4 eerst ...Nf6 en pas daarna ...Nbd7. Een te vroege ...Nd7 kan na Bc4 met druk op f7 lastig worden.",
  },

  "pirc-defense": {
    nameNl: "Pirc-verdediging",
    summary:
      "De Pirc-verdediging is een hypermoderne opening waarin zwart wit een groot pionnencentrum laat opbouwen. Met ...d6, ...Nf6 en ...g6 fianchetteert zwart de koningsloper en valt het centrum later aan.",
    idea:
      "Zwart laat wit het centrum bezetten en ondermijnt het daarna met ...e5 of ...c5, gesteund door de loper op g7.",
    plans: [
      "Met ...e5 het witte centrum aanvallen.",
      "Met ...c5 tegenspel zoeken op de damevleugel en tegen d4.",
      "Ruimte winnen op de damevleugel met ...a6 en ...b5.",
      "De loper op g7 laten werken over de lange diagonaal.",
    ],
    strengths: [
      "Flexibel en onevenwichtig, met winstkansen voor zwart.",
      "Ontwijkt de hoofdlijnen van de bekende 1.e4-openingen.",
      "Actief tegenspel zodra het witte centrum wordt aangevallen.",
    ],
    weaknesses: [
      "Wit kan agressieve systemen kiezen, zoals de opstelling met f4 of met Be3 en Qd2.",
      "Zwart heeft in de opening minder ruimte.",
      "De pionnenbreuken vragen een nauwkeurige timing.",
    ],
    keyMoves: "1.e4 d6 2.d4 Nf6 3.Nc3 g6",
    tip:
      "Wacht niet te lang met tegenspel: zonder tijdig ...e5 of ...c5 wordt het witte centrum te sterk.",
  },

  "modern-defense": {
    nameNl: "Moderne verdediging",
    summary:
      "De Moderne verdediging lijkt op de Pirc, maar zwart speelt eerst ...g6 en ...Bg7 en houdt het paard op g8 nog flexibel. De opening is bruikbaar tegen zowel 1.e4 als 1.d4.",
    idea:
      "Zwart kiest maximale flexibiliteit en bestrijdt het witte centrum op afstand met de loper op g7, gevolgd door pionnenbreuken.",
    plans: [
      "Met ...d6 gevolgd door ...c5 of ...e5 het centrum aanvallen.",
      "Ruimte winnen op de damevleugel met ...c6, ...a6 en ...b5.",
      "Het paard eerst naar d7 brengen en de opstelling aanpassen aan de witte opbouw.",
      "De lange diagonaal open houden voor de loper op g7.",
    ],
    strengths: [
      "Universeel: tegen 1.e4 en 1.d4 bruikbaar.",
      "Zeer flexibel en lastig voor te bereiden.",
      "Weinig concrete theorie.",
    ],
    weaknesses: [
      "Wit krijgt veel ruimte en vrij spel in het centrum.",
      "Zwart staat in de beginfase wat gedrongen.",
      "Zonder tijdig tegenspel kan zwart worden overlopen.",
    ],
    keyMoves: "1.e4 g6 / 1.d4 g6",
    tip:
      "Houd de lange diagonaal open voor je loper op g7: zet daar niet onnodig eigen pionnen of stukken in de weg.",
  },

  "englund-gambit": {
    nameNl: "Englund-gambiet",
    summary:
      "Het Englund-gambiet (1.d4 e5) is een gambiet waarin zwart direct een pion offert. Objectief gezien is het twijfelachtig: met nauwkeurig spel houdt wit een duidelijk voordeel. In snelle partijen zit het echter vol valstrikken.",
    idea:
      "Zwart offert de e-pion om snel te ontwikkelen en de witte pion op e5 aan te vallen, in de hoop dat wit in de complicaties een fout maakt.",
    plans: [
      "Snel ontwikkelen met ...Nc6 en ...Qe7 om de pion op e5 onder druk te zetten.",
      "Lijnen openen met ...d6 of ...f6 voor actieve stukken.",
      "Valstrikken uitzetten tegen onvoorzichtige witte zetten, bijvoorbeeld rond de pion op b2.",
      "Na het terugwinnen van de pion snel rokeren en normaal verder spelen.",
    ],
    strengths: [
      "Groot verrassingseffect.",
      "Veel praktische valstrikken, vooral in blitz en bullet.",
      "Ontwijkt de gebruikelijke theorie tegen 1.d4.",
    ],
    weaknesses: [
      "Objectief twijfelachtig: met correct spel houdt wit voordeel.",
      "Tegen ervaren of voorbereide tegenstanders werkt het nauwelijks.",
      "Zwart riskeert met een pion minder een slechtere stelling te krijgen.",
    ],
    keyMoves: "1.d4 e5 2.dxe5 Nc6",
    tip:
      "Gebruik het vooral als verrassingswapen in snelle partijen en ken de bekende valstrikken. Voor serieuze partijen met langere bedenktijd is een solidere opening verstandiger.",
  },

  "petrovs-defense": {
    nameNl: "Russisch (Petrov)",
    summary:
      "Het Russisch, ook wel Petrov genoemd, beantwoordt 2.Nf3 met een tegenaanval op e4: 2...Nf6. Het is een van de meest solide verdedigingen tegen 1.e4 en staat bekend om zijn symmetrische, betrouwbare stellingen.",
    idea:
      "Zwart verdedigt e5 niet maar valt zelf e4 aan, en mikt op een solide, evenwichtige stelling zonder zwaktes.",
    plans: [
      "Na 3.Nxe5 eerst ...d6 spelen en pas daarna de pion op e4 terugnemen.",
      "Het paard centraal op e4 plaatsen als dat veilig kan.",
      "Een stevig centrum opbouwen met ...d5 en snel rokeren.",
      "De stukken symmetrisch en harmonieus ontwikkelen met ...Bd6 of ...Be7.",
    ],
    strengths: [
      "Zeer solide en moeilijk te doorbreken.",
      "Ontwijkt het Spaans, Italiaans en Schots.",
      "Duidelijke, eenvoudige plannen.",
    ],
    weaknesses: [
      "Moeilijk om op winst te spelen door de symmetrische stellingen.",
      "Een verkeerde zetvolgorde kan direct tot problemen leiden.",
      "Wit kan kiezen voor rustige varianten waarin weinig gebeurt.",
    ],
    keyMoves: "1.e4 e5 2.Nf3 Nf6",
    tip:
      "Na 3.Nxe5 speel je eerst 3...d6 om het paard weg te jagen. Direct 3...Nxe4 is riskant vanwege 4.Qe2.",
  },

  "four-knights-game": {
    nameNl: "Vierpaardenspel",
    summary:
      "Het Vierpaardenspel ontstaat wanneer beide spelers hun paarden naar c3, f3, c6 en f6 ontwikkelen. Het is een klassieke, solide opening met natuurlijke ontwikkeling en weinig risico voor zwart.",
    idea:
      "Zwart ontwikkelt natuurlijk en symmetrisch, verdedigt e5 met het paard en zoekt later tegenspel in het centrum met ...d5 of door actief stukkenspel.",
    plans: [
      "Tegen 4.Bb5 de loper actief ontwikkelen met ...Bb4 of tegenspel zoeken met ...Nd4.",
      "Tegen 4.d4 op d4 ruilen en de stukken actief neerzetten, bijvoorbeeld met ...Bb4.",
      "Op het juiste moment ...d5 spelen om het centrum te openen.",
      "Snel rokeren en de lopers op actieve diagonalen zetten.",
    ],
    strengths: [
      "Solide en natuurlijk: elke zet ontwikkelt een stuk.",
      "Weinig valkuilen voor zwart.",
      "Leidt meestal tot evenwichtige stellingen.",
    ],
    weaknesses: [
      "De symmetrie maakt het lastig om op winst te spelen.",
      "Wit kiest de variant, waardoor zwart meerdere systemen moet kennen.",
      "Zonder duidelijk plan kan zwart passief worden.",
    ],
    keyMoves: "1.e4 e5 2.Nf3 Nc6 3.Nc3 Nf6",
    tip:
      "Ken tegen 4.Bc4 de vorktruc 4...Nxe4 5.Nxe4 d5: zwart wint het stuk terug en krijgt een prettig centrum.",
  },
} satisfies Record<string, OpeningInfo & { nameNl: string }>

// Engelse vertaling van de teksten hierboven; per opening dezelfde sleutel
const INFO_EN: Record<keyof typeof INFO_NL, OpeningText> = {
  // ===================== WIT =====================

  "alien-gambit": {
    summary:
      "The Alien Gambit is a wild piece sacrifice against the Caro-Kann: after 5.Ng5 h6, White takes on f7 with 6.Nxf7. White gives up a knight for a pawn, drags the black king forward and takes away Black's right to castle. Objectively the sacrifice is unsound (Stockfish gives Black roughly a two-pawn edge), but in fast games on Lichess White scores well with it.",
    idea:
      "White trades material for time and an unsafe black king. With Nf3-e5+ and Bc4+ the pieces join the game with tempo, while Black still has to work out where the king will be safe.",
    plans: [
      "Develop with check: Nf3 followed by Ne5+ and Bc4+ costs Black time.",
      "Play Ng6 if the king goes to g8: the knight attacks the rook on h8 and keeps the king boxed in.",
      "Watch for ...Bg4: Ne5+ attacks king and bishop at once and wins the piece back.",
      "Against ...Bf5, gain space on the kingside with g4 and g5, and the c1 bishop opens up the attack.",
      "Castle quickly and bring the queen and rooks to the open lines around the black king.",
    ],
    strengths: [
      "Big surprise value: few Black players know the right replies.",
      "Black has to find the way alone, while White's attack plays itself.",
      "A well-known trap after 7...Bg4 gives White an immediate advantage.",
      "In our sample White won 46 of the 89 games, against 38 losses.",
    ],
    weaknesses: [
      "Objectively it loses material: with good play Black stays a piece up and White's compensation falls short.",
      "Only works if Black goes along until 5...h6: after other fifth moves there is no sacrifice on f7.",
      "Against prepared opponents there is little left of it, especially at longer time controls.",
    ],
    tip:
      "Use it mainly in blitz and rapid. The same sacrifice also works via 3.Nd2. If Black parries the attack well, don't force things: keep playing calmly with your active pieces.",
  },

  "nakhmanson-gambit": {
    summary:
      "The Nakhmanson Gambit is a sharp sacrifice in the Scotch Gambit: after 5.O-O Nxe4, White plays 6.Nc3 and simply lets the knight on c3 be taken. After 6...dxc3 comes 7.Bxf7+ Kxf7 8.Qd5+, and White wins back the knight on e4 with an open line to the black king. Stockfish rates it as roughly equal, but Black has to know exactly what to do.",
    idea:
      "White gives up material for rapid development. Bxf7+ and Qd5+ drag the black king out of its shelter, and via Re1 and the e-file White attacks the knight on e4 and the king.",
    plans: [
      "After 6...dxc3, play 7.Bxf7+ and 8.Qd5+: the queen gives check and attacks the knight on e4 at the same time.",
      "Bring the rook to the e-file with Re1 and win back the knight on e4.",
      "Use Bg5 to trade off Black's defending bishop or to pin pieces on the e-file.",
      "If Black plays 8...Kg6, then 9.Qxe4+ Kf7 10.Ng5+ wins the queen.",
      "If Black takes 6...Nxc3, recapture with bxc3 and play actively with Bb5 and Ne5.",
    ],
    strengths: [
      "Few Black players know the sacrifice; the natural moves quickly walk into a trap.",
      "White develops with tempo and the black king can no longer castle.",
      "Objectively sound: Stockfish sees it as roughly equal.",
    ],
    weaknesses: [
      "After 10.Rxe4 White is still a piece down and must handle the attack precisely to win it back.",
      "Only works if Black plays 5...Nxe4; after other fifth moves there is no sacrifice.",
      "Few games: our sample has only 11, so the continuations mostly come from Stockfish.",
    ],
    tip:
      "You can also get there via 3.d4 exd4 4.Bc4 Nf6 5.O-O Nxe4 6.Nc3. Above all, know the line up to 10.Rxe4: you are a piece down, but with Bg5 and Rae1 all your pieces bear down on the pinned bishop on e7 and the black king.",
  },

  "italian-game": {
    summary:
      "The Italian Game is one of the oldest openings in chess. White develops the knight to f3 and the bishop to c4, where it eyes the vulnerable f7 square. Depending on White's choice, the game becomes sharp and open, or calm and positional.",
    idea:
      "White wants to develop quickly, castle kingside and build a strong pawn center with c3 and d4, while the bishop on c4 keeps up the pressure on f7.",
    plans: [
      "Take the center with c3 followed by d4 and push Black back.",
      "A quiet setup with d3, c3 and castling, then maneuver the queen's knight via d2 and f1 to g3.",
      "When the bishop is attacked, retreat it to b3 or a2 so the diagonal to f7 stays open.",
      "Gain space on the queenside with a4 and b4.",
      "In open positions, use the open lines to attack the black king.",
    ],
    strengths: [
      "Natural, logical development that is easy to learn.",
      "Direct pressure on f7, the weakest point in Black's position.",
      "Flexible: White can choose between sharp play and a quiet setup.",
      "Castling early keeps the king safe.",
    ],
    weaknesses: [
      "With ...Bc5 or ...Nf6 Black quickly gets full counterplay.",
      "In the quiet lines White's advantage is often small.",
      "Early attacks on f7 without enough development usually fizzle out.",
    ],
    tip:
      "Don't rush the knight to g5 to attack f7: developing and castling first usually pays off more in club games.",
  },

  "london-system": {
    summary:
      "The London System is a solid opening system in which White almost always chooses the same setup: d4, Bf4, e3, Nf3, c3, Bd3 and Nbd2. It is known for being reliable, easy to understand and light on theory.",
    idea:
      "White builds a sturdy pawn pyramid on c3, d4 and e3 and develops the queen's bishop before playing e3, so it doesn't get locked in behind its own pawns.",
    plans: [
      "Bring the knight to e5, possibly supported by f4, as a base for a kingside attack.",
      "Create a retreat square for the f4 bishop with h3, so it can't be traded off or chased away.",
      "Aim the bishop on d3 and the queen on c2 or f3 at Black's kingside.",
      "Play e4 at the right moment to open up the center.",
    ],
    strengths: [
      "Playable against almost any Black setup.",
      "Little theory: the plans matter more than exact move orders.",
      "Very solid pawn structure with few weaknesses.",
      "Clear, recognizable plans for the middlegame.",
    ],
    weaknesses: [
      "White puts little direct pressure on Black; Black can often equalize easily.",
      "With an early ...c5 and ...Qb6, Black can put pressure on the b2 pawn.",
      "The system is predictable, so opponents can prepare for it well.",
    ],
    tip:
      "Watch out for the combination of ...c5 and ...Qb6: the b2 pawn is then often the target. Qb3 or Qc1 usually solves that easily.",
  },

  "queens-gambit": {
    summary:
      "In the Queen's Gambit, White offers a pawn with 2.c4 to lure Black's d5 pawn away from the center. It is not a real gambit: after 2...dxc4 (Queen's Gambit Accepted) White usually wins the pawn back, and after 2...e6 (Queen's Gambit Declined) a strategic battle for the center begins.",
    idea:
      "White wants to control the center with pawns on d4 and ideally e4 too, and use the half-open c-file to pressure Black's queenside.",
    plans: [
      "Against the Queen's Gambit Accepted, build the center with e3 or e4 and take the pawn back later with Bxc4.",
      "Against the Queen's Gambit Declined, pin the knight on f6 with Bg5 to increase the pressure on d5.",
      "In the Exchange Variation (cxd5 exd5), launch a minority attack with b4 and b5 against Black's queenside.",
      "Bring the rooks to the c-file and put pressure on c6 or c7.",
      "With an isolated d-pawn, play actively and aim your pieces at the black king.",
    ],
    strengths: [
      "Principled and healthy: White fights for the center right away.",
      "A lasting initiative without really risking material.",
      "The typical pawn structures are well known and instructive.",
      "Playable at every level, from club to world elite.",
    ],
    weaknesses: [
      "Against the Queen's Gambit Declined, Black can be very solid.",
      "Being too greedy to win the pawn back after 2...dxc4 costs development time.",
      "Requires strategic understanding of structures such as the isolated pawn and hanging pawns.",
    ],
    tip:
      "After 2...dxc4 there is no need to hurry: just develop and take the pawn back later with the bishop. If Black tries to hold on to the pawn with ...b5, a4 is often the right answer.",
  },

  "english-opening": {
    summary:
      "The English Opening starts with 1.c4 and is a flexible flank opening. White controls the d5 square from the side and can later transpose to structures from other openings, such as a reversed Sicilian or a Queen's Gambit.",
    idea:
      "White fights for the center from the flank, usually with a fianchetto on g2, and waits to occupy the center with pawns until the position calls for it.",
    plans: [
      "Fianchetto with g3 and Bg2 for pressure along the long diagonal towards b7.",
      "Gain space on the queenside with Rb1, a3, b4 and possibly b5.",
      "Control d5 with Nc3 and d3 and use it as an outpost.",
      "Play d4 at a suitable moment and switch to a position with a strong center.",
    ],
    strengths: [
      "Very flexible: White decides the character of the position.",
      "Less forcing theory than after 1.e4 or 1.d4.",
      "Well suited to positional play and a slow build-up of pressure.",
      "Sidesteps much of the opponent's preparation.",
    ],
    weaknesses: [
      "Black gets plenty of freedom to occupy the center with pawns.",
      "Fewer direct attacking chances than in sharp e4 openings.",
      "Requires knowledge of structures from other openings because of the many transpositions.",
    ],
    tip:
      "Against 1...e5 you are essentially playing a Sicilian with an extra tempo: choose a quiet setup with Nc3, g3 and Bg2 and trust that extra tempo.",
  },

  "scotch-game": {
    summary:
      "The Scotch Game opens up the center right away with 3.d4. After 3...exd4 4.Nxd4 White has more space and free play for the pieces. It is a direct opening with clear plans and less theory than the Ruy Lopez.",
    idea:
      "White releases the central tension immediately and, with the pawn on e4 and a centralized knight, aims for space and quick development.",
    plans: [
      "Keep the knight centralized on d4, supported by Be3 and c3.",
      "Develop with Nc3, Be3 and Qd2, possibly followed by queenside castling and an attack.",
      "Chase the knight from f6 with e5 and gain space.",
      "After a trade on c6, put pressure on Black's weakened pawn structure.",
    ],
    strengths: [
      "Clear plans and an easy-to-understand central structure.",
      "More space and free play for the white pieces.",
      "Avoids the huge body of Ruy Lopez theory.",
    ],
    weaknesses: [
      "Because the center opens early, the black pieces get free play too.",
      "The knight on d4 can become a target for ...Bc5 or ...Qf6.",
      "Less long-term tension than in the Ruy Lopez, so the advantage can be smaller.",
    ],
    tip:
      "After 4.Nxd4, watch out for Black's pressure on d4 and f2 with ...Bc5 and ...Qf6. With Be3 and c3 the knight on d4 stands firm.",
  },

  "bishops-opening": {
    summary:
      "In the Bishop's Opening White plays 2.Bc4 right away, aiming the bishop at f7. It is a flexible opening that often transposes to the Italian or the Vienna, while White keeps the option of f4.",
    idea:
      "White develops the bishop early and leaves the knight on g1 for now, so that f4 stays possible or Nf3 can still follow later.",
    plans: [
      "A quiet setup with d3, Nf3, c3 and castling, followed by d4.",
      "Play f4 at a suitable moment for an attack along the f-file.",
      "Transpose to Vienna structures with Nc3.",
      "Keep the bishop on the diagonal to f7 and step up the pressure on Black's kingside.",
    ],
    strengths: [
      "Flexible: White can choose between several setups.",
      "Avoids the Petrov Defense, since Nf3 hasn't been played yet.",
      "Direct pressure on f7.",
      "Little required theory.",
    ],
    weaknesses: [
      "With ...Nf6 and ...d5 Black can easily free the center.",
      "After d3, White's setup can become passive without a clear plan.",
      "The bishop on c4 can become a target for ...d5 or ...Na5.",
    ],
    tip:
      "After 2...Nf6, 3.d3 is a calm and solid choice: you protect e4 and keep all options open.",
  },

  "ruy-lopez": {
    summary:
      "The Ruy Lopez (Spanish Game) is one of the most important openings in chess history. With 3.Bb5 White attacks the knight that defends e5 and slowly builds up pressure. The play is usually strategic and rich in plans.",
    idea:
      "White wants to exert long-term pressure on Black's center and build a strong pawn center with c3 and d4.",
    plans: [
      "Reinforce the center with c3 and d4.",
      "Set up with Re1 and h3, followed by the queen's knight via d2 and f1 to g3.",
      "After ...a6 and ...b5, retreat the bishop to b3 and later c2, aimed at the kingside.",
      "Open lines on the queenside with a4.",
      "Bring a knight to f5 as part of a kingside attack.",
    ],
    strengths: [
      "Long-lasting, sustained pressure without sacrificing material.",
      "Rich in strategic plans and instructive for the middlegame.",
      "Proven at the highest level.",
      "Flexible against almost any Black setup.",
    ],
    weaknesses: [
      "A lot of theory, especially against the Berlin and the Marshall Gambit.",
      "Black has many reliable defenses.",
      "Strategically demanding; quick wins are rare.",
    ],
    tip:
      "Early on, the e5 pawn usually isn't hanging yet: after Bxc6 followed by Nxe5, Black often wins the pawn back with ...Qd4 or ...Qg5. So build up calmly.",
  },

  "kings-gambit": {
    summary:
      "The King's Gambit is a romantic opening in which White sacrifices a pawn with 2.f4. After 2...exf4 (Accepted) White gets chances for a strong center and an open f-file; Black can also decline the gambit, for example with 2...Bc5 or 2...d5.",
    idea:
      "White sacrifices a pawn to lure away Black's e-pawn, take over the center with d4 and attack f7 along the f-file.",
    plans: [
      "After 2...exf4, play Nf3 quickly to prevent ...Qh4+.",
      "Take the center with d4 and win back the f4 pawn later, for example with Bxf4.",
      "With Bc4 and kingside castling, put the f-file and the f7 square under fire.",
      "Against the declined gambit, develop quickly with Nf3, Nc3 and Bc4 and open the f-file later.",
    ],
    strengths: [
      "Immediate initiative and open play from the very first moves.",
      "Big surprise value, especially in fast games.",
      "The open f-file gives attacking chances against the black king.",
      "Lots of practical chances against unprepared opponents.",
    ],
    weaknesses: [
      "The white king is weakened, especially on the e1-h4 diagonal.",
      "With good defense Black keeps the material or gets strong counterplay.",
      "There is a lot of sharp theory in which a single mistake can be decisive.",
    ],
    tip:
      "After 2...exf4 you usually play 3.Nf3 to prevent ...Qh4+. After 2...Bc5, never play fxe5 right away, because ...Qh4+ follows with big problems.",
  },

  "vienna-game": {
    summary:
      "The Vienna Game starts with 2.Nc3 and is a flexible opening. White protects e4 and often prepares f4, as in the Vienna Gambit, which leads to a kind of King's Gambit with an extra piece developed.",
    idea:
      "White develops the queen's knight first so that f4 is better prepared, or chooses a quiet setup with g3 and Bg2.",
    plans: [
      "Attack the e5 pawn and open the f-file with f4 (Vienna Gambit).",
      "After fxe5, use the pawn on e5 to gain space and chase away the knight on f6.",
      "A quiet setup with g3 and Bg2 for pressure along the long diagonal.",
      "Aim the bishop at f7 with Bc4 and play f4 later.",
    ],
    strengths: [
      "Flexible: both sharp and quiet plans are possible.",
      "The Vienna Gambit has great surprise value.",
      "Avoids the Petrov Defense and a lot of well-known theory.",
    ],
    weaknesses: [
      "Against the Vienna Gambit, Black can strike back hard in the center with ...d5.",
      "In the quiet lines White's advantage is limited.",
      "The early f4 weakens White's king position.",
    ],
    tip:
      "Prepare well for Black's ...d5 reply to the Vienna Gambit: it is the main defense and often decides the course of the game.",
  },

  "hungarian-opening": {
    summary:
      "The Hungarian Opening starts with 1.g3 and prepares a fianchetto of the king's bishop. It is a flexible, positional system in which White often transposes to an English or a King's Indian setup with the white pieces.",
    idea:
      "White puts the bishop on g2 for pressure along the long diagonal and on the center, and only later decides which pawn structure fits best.",
    plans: [
      "Set up with Bg2, Nf3, kingside castling, d3 and e4 for a King's Indian setup.",
      "Transpose to English structures with c4.",
      "Use the g2 bishop to pressure b7 and the center.",
      "Gain space on the queenside with c4, b4 and Rb1.",
    ],
    strengths: [
      "Very flexible and hard to prepare for.",
      "A safe king after quick kingside castling.",
      "Little theory to memorize.",
    ],
    weaknesses: [
      "Black gets plenty of freedom to occupy the center with pawns.",
      "Little direct pressure; the position often balances out quickly.",
      "The many transpositions require knowledge of other openings.",
    ],
    tip:
      "Pick a fixed setup, for example Bg2, Nf3, kingside castling, d3 and e4, so you don't have to reinvent it every game.",
  },

  // ===================== ZWART =====================

  "sicilian-defense": {
    summary:
      "The Sicilian Defense is the most popular reply to 1.e4. With 1...c5 Black fights asymmetrically for the d4 square, leading to unbalanced, sharp positions in which both sides have winning chances.",
    idea:
      "In the Open Sicilian, Black trades the c-pawn for White's d-pawn, gaining an extra central pawn and the half-open c-file for counterplay.",
    plans: [
      "Use the half-open c-file with a rook on c8 and pressure on c3.",
      "Gain space on the queenside with ...a6 and ...b5.",
      "Play ...d5 at the right moment to free the center.",
      "In some systems, fianchetto the bishop on g7 for pressure along the long diagonal.",
      "Seek counterplay on the queenside while White attacks on the kingside.",
    ],
    strengths: [
      "Good winning chances for Black thanks to the unbalanced positions.",
      "Active counterplay instead of passive defense.",
      "An extra central pawn after the trade on d4.",
      "Many different systems to choose from.",
    ],
    weaknesses: [
      "A lot of sharp theory in the main lines.",
      "White's kingside attacks can be very dangerous.",
      "Anti-Sicilian systems such as 2.c3 need extra preparation.",
      "Some structures create weak squares such as d5, or a backward pawn on d6.",
    ],
    tip:
      "Choose a system that suits your playing style and make sure you also have a plan against 2.c3 (Alapin), because you'll meet it often in club games.",
  },

  "french-defense": {
    summary:
      "The French Defense starts with 1...e6, followed by ...d5. Black gets a solid but somewhat cramped position and fights White's center with pawn breaks.",
    idea:
      "Black attacks White's pawn chain at its base, with ...c5 against d4 and often ...f6 against e5 as well.",
    plans: [
      "Attack White's d4 pawn with ...c5.",
      "Step up the pressure on d4 with ...Nc6 and ...Qb6.",
      "Attack White's e5 pawn with ...f6 and open the f-file.",
      "Activate the bad light-squared bishop, for example via ...b6 and ...Ba6, or via d7 to b5.",
    ],
    strengths: [
      "A solid position with clear pawn breaks.",
      "Clear strategic plans.",
      "Awkward for White players who count on a quick attack.",
    ],
    weaknesses: [
      "The c8 bishop is often locked in behind its own pawns.",
      "Black has less space, especially after White plays e5.",
      "After e5, White can build dangerous kingside attacks.",
    ],
    tip:
      "If White plays e5, strike quickly with ...c5 and pressure d4 with ...Nc6 and ...Qb6. Wait too long and White gets a free hand on the kingside.",
  },

  "caro-kann-defense": {
    summary:
      "The Caro-Kann starts with 1...c6 and prepares ...d5. It is one of the most solid defenses against 1.e4: Black gets a healthy pawn structure and can often develop the light-squared bishop outside the pawn chain.",
    idea:
      "Black fights for the center with ...d5, supported by the pawn on c6, and develops the light-squared bishop to f5 or g4 before playing ...e6.",
    plans: [
      "Develop the light-squared bishop to f5 or g4 and only then play ...e6.",
      "In the Advance Variation, attack White's center with ...c5.",
      "A solid setup with ...Nd7, ...Ngf6 and ...e6.",
      "Aim for a favorable endgame thanks to the healthy pawn structure.",
    ],
    strengths: [
      "Very solid with few structural weaknesses.",
      "The light-squared bishop gets active outside the pawn chain.",
      "Good endgames thanks to the healthy pawn structure.",
    ],
    weaknesses: [
      "Can become passive if Black doesn't choose an active plan.",
      "White can play aggressively with the Advance Variation or the Panov Attack.",
      "Black's development is sometimes slower than in other defenses.",
    ],
    tip:
      "In the Advance Variation (3.e5), develop the bishop to f5 first and only then play ...e6, followed by ...c5.",
  },

  "scandinavian-defense": {
    summary:
      "The Scandinavian Defense attacks the e4 pawn right away with 1...d5. After 2.exd5 Black recaptures with the queen or plays ...Nf6 first. It is easy to learn and leads to clear-cut positions.",
    idea:
      "Black forces an immediate decision in the center and gets free play for the pieces with a solid pawn structure on c6 and e6.",
    plans: [
      "After Nc3, retreat the queen to a safe square such as a5 or d6.",
      "Develop the light-squared bishop actively to f5 or g4.",
      "Build a sturdy pawn structure with ...c6 and ...e6.",
      "Develop quickly with ...Nf6, ...Nbd7 and castling.",
    ],
    strengths: [
      "Little theory and quick to learn.",
      "Black sets the structure from the very first move.",
      "Simple, natural development of the pieces.",
      "Surprising for opponents expecting 1...e5 or 1...c5.",
    ],
    weaknesses: [
      "The queen loses time when it gets attacked.",
      "White often gets a small lead in development.",
      "White usually has a bit more space in the center.",
    ],
    tip:
      "After Nc3, put the queen on a safe square such as a5 or d6 and then develop quickly: don't waste extra tempi with the queen.",
  },

  "philidor-defense": {
    summary:
      "The Philidor Defense protects the e5 pawn with 2...d6. Black chooses a solid, somewhat waiting setup and waits for the right moment to create counterplay.",
    idea:
      "Black holds the e5 strongpoint, often with the setup ...Nf6, ...Nbd7, ...Be7 and ...c6, and develops compactly behind the pawns.",
    plans: [
      "Hold the e5 pawn with ...Nbd7 and a compact setup.",
      "After a trade on d4, play actively with the pieces and put pressure on e4.",
      "Gain space on the queenside with ...c6, ...a6 and ...b5.",
      "Regroup with ...Re8 and ...Bf8 to strengthen the position.",
    ],
    strengths: [
      "Solid and hard to break down.",
      "Avoids a lot of Ruy Lopez and Italian theory.",
      "A simple setup with clear plans.",
    ],
    weaknesses: [
      "Passive: White often gets more space.",
      "The bishop on e7 is often somewhat cramped.",
      "A wrong move order can lead to problems around f7.",
    ],
    tip:
      "Against 3.d4, play ...Nf6 first and only then ...Nbd7. An early ...Nd7 can get awkward after Bc4 with pressure on f7.",
  },

  "pirc-defense": {
    summary:
      "The Pirc Defense is a hypermodern opening in which Black lets White build a big pawn center. With ...d6, ...Nf6 and ...g6 Black fianchettoes the king's bishop and attacks the center later.",
    idea:
      "Black lets White occupy the center and then undermines it with ...e5 or ...c5, supported by the bishop on g7.",
    plans: [
      "Attack White's center with ...e5.",
      "Seek counterplay on the queenside and against d4 with ...c5.",
      "Gain space on the queenside with ...a6 and ...b5.",
      "Let the g7 bishop work along the long diagonal.",
    ],
    strengths: [
      "Flexible and unbalanced, with winning chances for Black.",
      "Avoids the main lines of the well-known 1.e4 openings.",
      "Active counterplay as soon as White's center comes under attack.",
    ],
    weaknesses: [
      "White can choose aggressive systems, such as the setup with f4 or with Be3 and Qd2.",
      "Black has less space in the opening.",
      "The pawn breaks require precise timing.",
    ],
    tip:
      "Don't wait too long for counterplay: without a timely ...e5 or ...c5, White's center becomes too strong.",
  },

  "modern-defense": {
    summary:
      "The Modern Defense resembles the Pirc, but Black plays ...g6 and ...Bg7 first and keeps the g8 knight flexible for now. The opening can be used against both 1.e4 and 1.d4.",
    idea:
      "Black opts for maximum flexibility and fights White's center from a distance with the bishop on g7, followed by pawn breaks.",
    plans: [
      "Attack the center with ...d6 followed by ...c5 or ...e5.",
      "Gain space on the queenside with ...c6, ...a6 and ...b5.",
      "Bring the knight to d7 first and adapt the setup to White's build-up.",
      "Keep the long diagonal open for the bishop on g7.",
    ],
    strengths: [
      "Universal: playable against 1.e4 and 1.d4.",
      "Very flexible and hard to prepare for.",
      "Little concrete theory.",
    ],
    weaknesses: [
      "White gets lots of space and free play in the center.",
      "Black is somewhat cramped in the early phase.",
      "Without timely counterplay, Black can get overrun.",
    ],
    tip:
      "Keep the long diagonal open for your bishop on g7: don't needlessly put your own pawns or pieces in its way.",
  },

  "englund-gambit": {
    summary:
      "The Englund Gambit (1.d4 e5) is a gambit in which Black sacrifices a pawn right away. Objectively it is dubious: with accurate play White keeps a clear advantage. In fast games, though, it is full of traps.",
    idea:
      "Black sacrifices the e-pawn to develop quickly and attack White's pawn on e5, hoping White goes wrong in the complications.",
    plans: [
      "Develop quickly with ...Nc6 and ...Qe7 to pressure the e5 pawn.",
      "Open lines with ...d6 or ...f6 for active pieces.",
      "Set traps against careless White moves, for example around the b2 pawn.",
      "After winning the pawn back, castle quickly and play on normally.",
    ],
    strengths: [
      "Big surprise value.",
      "Lots of practical traps, especially in blitz and bullet.",
      "Avoids the usual theory against 1.d4.",
    ],
    weaknesses: [
      "Objectively dubious: with correct play White keeps the advantage.",
      "Hardly works against experienced or prepared opponents.",
      "A pawn down, Black risks ending up in a worse position.",
    ],
    tip:
      "Use it mainly as a surprise weapon in fast games and know the well-known traps. For serious games with longer time controls, a more solid opening is the wiser choice.",
  },

  "petrovs-defense": {
    summary:
      "The Petrov Defense, also called the Russian Game, answers 2.Nf3 with a counterattack on e4: 2...Nf6. It is one of the most solid defenses against 1.e4 and is known for its symmetrical, reliable positions.",
    idea:
      "Black doesn't defend e5 but attacks e4 instead, aiming for a solid, balanced position without weaknesses.",
    plans: [
      "After 3.Nxe5, play ...d6 first and only then take back the pawn on e4.",
      "Centralize the knight on e4 when it is safe to do so.",
      "Build a sturdy center with ...d5 and castle quickly.",
      "Develop the pieces symmetrically and harmoniously with ...Bd6 or ...Be7.",
    ],
    strengths: [
      "Very solid and hard to break down.",
      "Avoids the Ruy Lopez, the Italian and the Scotch.",
      "Clear, simple plans.",
    ],
    weaknesses: [
      "Hard to play for a win because of the symmetrical positions.",
      "A wrong move order can cause problems right away.",
      "White can opt for quiet lines in which little happens.",
    ],
    tip:
      "After 3.Nxe5, play 3...d6 first to chase the knight away. Taking 3...Nxe4 right away is risky because of 4.Qe2.",
  },

  "four-knights-game": {
    summary:
      "The Four Knights Game arises when both players develop their knights to c3, f3, c6 and f6. It is a classical, solid opening with natural development and little risk for Black.",
    idea:
      "Black develops naturally and symmetrically, defends e5 with the knight and later looks for counterplay in the center with ...d5 or through active piece play.",
    plans: [
      "Against 4.Bb5, develop the bishop actively with ...Bb4 or look for counterplay with ...Nd4.",
      "Against 4.d4, trade on d4 and place the pieces actively, for example with ...Bb4.",
      "Play ...d5 at the right moment to open the center.",
      "Castle quickly and put the bishops on active diagonals.",
    ],
    strengths: [
      "Solid and natural: every move develops a piece.",
      "Few pitfalls for Black.",
      "Usually leads to balanced positions.",
    ],
    weaknesses: [
      "The symmetry makes it hard to play for a win.",
      "White picks the variation, so Black needs to know several systems.",
      "Without a clear plan, Black can become passive.",
    ],
    tip:
      "Against 4.Bc4, know the fork trick 4...Nxe4 5.Nxe4 d5: Black wins the piece back and gets a pleasant center.",
  },
}

type OpeningId = keyof typeof INFO_NL
const IDS = Object.keys(INFO_NL) as OpeningId[]
const isId = (id: PropertyKey): id is OpeningId => typeof id === 'string' && Object.prototype.hasOwnProperty.call(INFO_NL, id)

// In het Engels geen nameNl: die zou de Engelse naam alleen herhalen
const BY_LANG: Record<'nl' | 'en', Record<OpeningId, OpeningInfo>> = {
  nl: INFO_NL,
  en: Object.fromEntries(IDS.map(id => [id, { ...INFO_EN[id], keyMoves: INFO_NL[id].keyMoves }])) as Record<OpeningId, OpeningInfo>,
}

/** Uitleg bij een opening in de huidige taal */
export const getOpeningInfo = (id: string): OpeningInfo | undefined => (isId(id) ? BY_LANG[getLang()][id] : undefined)

/** Uitleg per opening in de huidige taal; wordt bij elke toegang opgezocht, zodat aanroepers niets hoeven te veranderen */
export const OPENING_INFO: Record<string, OpeningInfo> = new Proxy(INFO_NL as Record<string, OpeningInfo>, {
  get: (_target, id) => (isId(id) ? BY_LANG[getLang()][id] : undefined),
  has: (_target, id) => isId(id),
})
