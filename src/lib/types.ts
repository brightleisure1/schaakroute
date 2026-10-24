// Datatypes van de geïmporteerde Lichess-dataset (zie scripts/import-openings.mjs)

export type Side = 'white' | 'black'

export type VariationTag = 'base' | 'main' | 'side' | 'rare' | 'gambit' | 'tactical' | 'sub'

/** OpeningFamily: één van de 20 geselecteerde openingsfamilies */
export interface FamilySummary {
  id: string
  name: string
  side: Side
  rank: number
  ecoRange: string
  ecoCodes: string[]
  rootSan: string[]
  rootUci: string[]
  rootEpd: string
  games: number
  share: number
  variationCount: number
  namedCount: number
  subvariationCount: number
  gambitCount: number
  lessonCount: number
  maxPlies: number
}

/** OpeningVariation: één benoemde Lichess-lijn (een regel uit a.tsv … e.tsv) */
export interface Variation {
  id: string
  eco: string
  name: string
  path: string[]
  lineNo?: number
  san: string[]
  uci: string[]
  epd: string
  moveOrders?: { san: string[]; uci: string[] }[]
  reach: number | null
  namedGames: number
  freq: number
  tags: VariationTag[]
  level: 1 | 2 | 3 | 4 | 5
  transposesTo?: { ply: number; name: string; uci: string[] }[]
}

export interface Lesson {
  id: string
  level: number
  title: string
  variationIds: string[]
}

export interface FamilyFile {
  family: FamilySummary
  variations: Variation[]
  lessons: Lesson[]
}

/** [uci, san, n, whiteWins, draws, blackWins, ...4 banden x (n, w, d, b)] */
export type StatMove = [string, string, number, number, number, number, ...number[]]

export interface StatsFile {
  bands: string[]
  totalGames: number
  positions: Record<string, { n: number; m: StatMove[] }>
}

export interface Puzzle {
  id: string
  fen: string
  uci: string[]
  san: string[]
  rating: number
  themes: string[]
  gameUrl: string
  ply: number
  variation: string | null
  plays: number
}

export interface PuzzleFile {
  family: string
  source: string
  puzzles: Puzzle[]
}

export interface RankingEntry {
  family: string
  games: number
  share: number
  lines: number
  rootPgn: string
  excluded: string | null
  rank: number | null
}

export interface Manifest {
  schemaVersion: number
  datasetVersion: string
  generatedAt: string
  source: {
    openings: { repo: string; ref: string; license: string; rows: number; illegal: number }
    games: {
      url: string
      license: string
      month: string
      method: string
      sampledGames: number
      usedGames: number
      speeds: Record<string, number>
      ratingBands: Record<string, number>
    }
    puzzles?: { url: string; license: string; scanned: number; perBucket: number }
  }
  method: string[]
  families: FamilySummary[]
  validation: {
    illegalLines: { name: string; pgn: string; error: string }[]
    report: {
      family: string
      sourceRows: number
      variations: number
      distinctNames: number
      duplicatesMerged: number
      withMoveOrders: number
      linesWithTransposition: number
      statPositions: number
    }[]
    puzzles?: { family: string; candidates: number; selected: number }[]
  }
}

/** Een trainbare lijn (uit de dataset of uit het eigen repertoire) */
export interface TrainingLine {
  key: string
  familyId?: string
  variationId?: string
  repertoireId?: number
  title: string
  subtitle?: string
  uci: string[]
  san: string[]
  side: Side
  /** Optioneel: begin pas bij deze ply (losse posities) */
  startPly?: number
  /** Optioneel: maximale ply (losse positie = één zet) */
  endPly?: number
}

export type TrainMode = 'learn' | 'practice' | 'mastery' | 'review'
