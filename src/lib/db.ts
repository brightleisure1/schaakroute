import Dexie, { type EntityTable } from 'dexie'
import type { Side } from './types'
import type { SrsState } from './srs'

// Lokale database (IndexedDB via Dexie). Gebruikersgegevens staan los van de dataset-cache,
// zodat een nieuwe datasetversie nooit voortgang wist.

export interface UserSettings {
  id: 'me'
  onboarded: boolean
  elo: number
  strength: 'beginner' | 'club' | 'gevorderd' | 'expert'
  sides: 'white' | 'black' | 'both'
  openings: string[] // family ids
  dailyMinutes: 5 | 10 | 15 | 20
  theme: 'system' | 'light' | 'dark'
  engineEnabled: boolean
  lichessToken?: string
  lichessUser?: string
  chesscomUser?: string
  lastRoute?: string
  lastRouteLabel?: string
  createdAt: number
}

/** TrainingCard: één te onthouden zet in één stelling. Sleutel = EPD + verwachte zet. */
export interface TrainingCard extends SrsState {
  id: string // `${epd}|${uci}`
  epd: string
  uci: string
  san: string
  side: Side
  familyIds: string[]
  variationIds: string[]
  /** zetten vanaf de beginstelling die naar deze stelling leiden (voor context) */
  lineUci: string[]
  createdAt: number
  suspended?: boolean
}

/** UserProgress per variant */
export interface VariationProgress {
  id: string // variation id
  familyId: string
  completions: number
  bestStars: number
  lastStars: number
  mistakes: number
  hintsUsed: number
  correctMoves: number
  learnedAt?: number
  lastPracticed?: number
}

export interface TrainingSession {
  id?: number
  kind: 'variation' | 'lesson' | 'daily' | 'review' | 'crushing' | 'advantage' | 'repertoire' | 'mastery'
  familyId?: string
  startedAt: number
  endedAt?: number
  correct: number
  mistakes: number
  hints: number
  newCards: number
  reviewedCards: number
  xp: number
}

export interface TrainingAttempt {
  id?: number
  sessionId?: number
  at: number
  day: string
  cardId?: string
  familyId?: string
  variationId?: string
  puzzleId?: string
  epd: string
  expected: string
  played: string | null
  result: 'correct' | 'mistake' | 'alternative' | 'hint' | 'shown'
}

export interface DailyActivity {
  day: string // YYYY-MM-DD (lokale tijd)
  correct: number
  mistakes: number
  newCards: number
  reviews: number
  xp: number
  seconds: number
  sessions: number
  dailyCompleted: boolean
}

export interface Repertoire {
  id?: number
  name: string
  side: Side
  familyId?: string
  createdAt: number
  updatedAt: number
}

/** RepertoireMove: een zet in het eigen repertoire, als boom van stellingen */
export interface RepertoireMove {
  id?: number
  repertoireId: number
  epd: string
  uci: string
  san: string
  /** zet van mijn kant: is dit mijn hoofdkeuze (true) of een opgeslagen alternatief (false)? */
  main: boolean
  comment?: string
  createdAt: number
}

export interface PuzzleProgress {
  id: string
  familyId: string
  solved: number
  failed: number
  lastAt: number
}

export interface ImportedGame {
  id: string
  source: 'lichess' | 'chesscom' | 'pgn'
  username: string
  color: Side
  result: 'win' | 'loss' | 'draw'
  playedAt: number
  san: string[]
  url?: string
  opening?: string
}

export interface Badge {
  id: string
  earnedAt: number
}

export interface Meta {
  key: string
  value: unknown
}

export interface DatasetCache {
  key: string
  version: string
  data: unknown
}

export class SchaakDB extends Dexie {
  settings!: EntityTable<UserSettings, 'id'>
  cards!: EntityTable<TrainingCard, 'id'>
  progress!: EntityTable<VariationProgress, 'id'>
  sessions!: EntityTable<TrainingSession, 'id'>
  attempts!: EntityTable<TrainingAttempt, 'id'>
  daily!: EntityTable<DailyActivity, 'day'>
  repertoires!: EntityTable<Repertoire, 'id'>
  repMoves!: EntityTable<RepertoireMove, 'id'>
  puzzles!: EntityTable<PuzzleProgress, 'id'>
  games!: EntityTable<ImportedGame, 'id'>
  badges!: EntityTable<Badge, 'id'>
  meta!: EntityTable<Meta, 'key'>
  datasets!: EntityTable<DatasetCache, 'key'>

  constructor(name = 'schaakroute') {
    super(name)
    this.version(1).stores({
      settings: 'id',
      cards: 'id, dueAt, epd, *familyIds, *variationIds, side',
      progress: 'id, familyId, lastPracticed',
      sessions: '++id, kind, startedAt, familyId',
      attempts: '++id, day, at, cardId, familyId, variationId, result',
      daily: 'day',
      repertoires: '++id, side, familyId',
      repMoves: '++id, repertoireId, [repertoireId+epd], epd',
      puzzles: 'id, familyId',
      games: 'id, source, username, playedAt',
      badges: 'id',
      meta: 'key',
      datasets: 'key',
    })
  }
}

export const db = new SchaakDB()

export function today(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const DEFAULT_SETTINGS: UserSettings = {
  id: 'me',
  onboarded: false,
  elo: 1200,
  strength: 'club',
  sides: 'both',
  openings: [],
  dailyMinutes: 10,
  theme: 'system',
  engineEnabled: false,
  createdAt: Date.now(),
}

export async function getSettings(database: SchaakDB = db): Promise<UserSettings> {
  return (await database.settings.get('me')) ?? { ...DEFAULT_SETTINGS, createdAt: Date.now() }
}

export async function saveSettings(patch: Partial<UserSettings>, database: SchaakDB = db) {
  const cur = await getSettings(database)
  await database.settings.put({ ...cur, ...patch, id: 'me' })
}
