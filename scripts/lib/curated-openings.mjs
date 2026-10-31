// Openingen die buiten de top 10 per kleur vallen maar er toch bewust in zitten.
// Lichess kent per stelling maar één naam, dus lijnen na de benoemde stelling stellen wij zelf samen.
// Herkomst van de lijnen: zetten uit de partijensteekproef (data-raw/games-2026-09.tsv), per witte keuze
// beoordeeld met Stockfish 19 lite op diepte 16. Geen enkele gekozen witte zet is een blunder ten opzichte
// van de beste zet, ook al staat wit in dit gambiet objectief slechter.

const ALIEN_ROOT = 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nf6 Ng5 h6 Nxf7'
const ALIEN_MAIN = `${ALIEN_ROOT} Kxf7 Nf3`

export const CURATED_OPENINGS = [
  {
    name: 'Alien Gambit',
    side: 'white',
    eco: 'B15',
    // Lichess-naam van de stelling; hiermee tellen we partijen en zoeken we puzzels
    lichessName: 'Caro-Kann Defense: Alien Gambit',
    puzzleTag: 'Caro-Kann_Defense_Alien_Gambit',
    // De stellingen vallen binnen de Caro-Kann; daarvandaan nemen we de statistieken over
    statsFrom: 'caro-kann-defense',
    rootMoveOrders: [
      'e4 c6 d4 d5 Nd2 dxe4 Nxe4 Nf6 Ng5 h6 Nxf7',
      'e4 c6 Nc3 d5 d4 dxe4 Nxe4 Nf6 Ng5 h6 Nxf7',
    ],
    lessons: { 1: 'Het offer op f7', 2: 'De meest gespeelde antwoorden', 3: 'Andere antwoorden', 4: 'Eerst schaak met 7.Bc4+' },
    lines: [
      { name: 'Alien Gambit', level: 1, moves: ALIEN_ROOT },
      { name: 'Alien Gambit: c5 Variation', level: 2, moves: `${ALIEN_MAIN} c5 Bc4+ e6 Ne5+ Kg8 Ng6` },
      { name: 'Alien Gambit: Bg4 Trap', level: 2, moves: `${ALIEN_MAIN} Bg4 Ne5+ Ke8 Nxg4 Nxg4 Qxg4` },
      { name: 'Alien Gambit: e6 Variation', level: 2, moves: `${ALIEN_MAIN} e6 Ne5+ Kg8 Bd3` },
      { name: 'Alien Gambit: Bg4 Trap, Kg8', level: 3, moves: `${ALIEN_MAIN} Bg4 Ne5+ Kg8 Nxg4 Nxg4 Qxg4` },
      { name: 'Alien Gambit: Bf5 Variation', level: 3, moves: `${ALIEN_MAIN} Bf5 Bc4+ e6 Ne5+` },
      { name: 'Alien Gambit: Nbd7 Variation', level: 3, moves: `${ALIEN_MAIN} Nbd7 Bd3` },
      { name: 'Alien Gambit: Kg8 Variation', level: 3, moves: `${ALIEN_MAIN} Kg8 Bc4+` },
      { name: 'Alien Gambit: Bc4 Line, e6', level: 4, moves: `${ALIEN_ROOT} Kxf7 Bc4+ e6 Nf3 Bd6 Qe2` },
      { name: 'Alien Gambit: Bc4 Line, Be6', level: 4, moves: `${ALIEN_ROOT} Kxf7 Bc4+ Be6 Bxe6+ Kxe6 Nf3` },
    ],
  },
]
