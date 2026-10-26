export interface OpeningInfo {
  nameNl: string
  summary: string
  idea: string
  plans: string[]
  strengths: string[]
  weaknesses: string[]
  keyMoves: string
  tip: string
}

export const OPENING_INFO: Record<string, OpeningInfo> = {
  // ===================== WIT =====================

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
}
