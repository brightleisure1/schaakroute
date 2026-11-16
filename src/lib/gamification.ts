// XP, levels, streaks en badges. Bewust bescheiden: het schaken staat centraal.
import { BookMarked, Brain, Calendar, Compass, Crown, Flag, Flame, Library, Map, Medal, Repeat, Star, Sun, Sword, Swords, TreeDeciduous, type LucideIcon } from 'lucide-react'
import { t } from './i18n'

export const XP = {
  correctMove: 2,
  firstTryBonus: 1,
  variationComplete: 10,
  perStar: 5,
  review: 3,
  puzzle: 10,
  dailyComplete: 25,
}

/** Level n vereist 50 * (n-1)^2 XP totaal */
export function levelFromXp(xp: number) {
  const level = Math.floor(Math.sqrt(xp / 50)) + 1
  const cur = 50 * (level - 1) ** 2
  const next = 50 * level ** 2
  return { level, cur, next, progress: (xp - cur) / (next - cur) }
}

/** Huidige streak (dagen op rij met training), op basis van YYYY-MM-DD dagen */
export function computeStreak(activeDays: string[], todayStr: string): { current: number; best: number } {
  const set = new Set(activeDays)
  const toDate = (s: string) => new Date(s + 'T12:00:00')
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  let current = 0
  const d = toDate(todayStr)
  if (!set.has(todayStr)) d.setDate(d.getDate() - 1) // streak blijft staan tot het einde van vandaag
  while (set.has(fmt(d))) {
    current++
    d.setDate(d.getDate() - 1)
  }
  let best = 0
  let run = 0
  let prev: Date | null = null
  for (const s of [...set].sort()) {
    const cur = toDate(s)
    run = prev && Math.round((cur.getTime() - prev.getTime()) / 86_400_000) === 1 ? run + 1 : 1
    best = Math.max(best, run)
    prev = cur
  }
  return { current, best: Math.max(best, current) }
}

export interface BadgeDef {
  id: string
  title: string
  description: string
  icon: LucideIcon
  check: (s: BadgeStats) => boolean
}

export interface BadgeStats {
  variationsCompleted: number
  perfectVariations: number
  learnedPositions: number
  maturePositions: number
  streak: number
  puzzlesSolved: number
  dailyCompleted: number
  familiesStarted: number
  reviews: number
  repertoireMoves: number
}

/** Titel en omschrijving worden pas bij het lezen vertaald, zodat ze de gekozen taal volgen */
function badge(id: string, title: () => string, description: () => string, icon: LucideIcon, check: (s: BadgeStats) => boolean): BadgeDef {
  return { id, get title() { return title() }, get description() { return description() }, icon, check }
}

export const BADGES: BadgeDef[] = [
  badge('first-line', () => t('Eerste route'), () => t('Je eerste variant afgerond'), Flag, s => s.variationsCompleted >= 1),
  badge('ten-lines', () => t('Routeplanner'), () => t('10 varianten afgerond'), Compass, s => s.variationsCompleted >= 10),
  badge('fifty-lines', () => t('Theoreticus'), () => t('50 varianten afgerond'), Library, s => s.variationsCompleted >= 50),
  badge('perfect', () => t('Foutloos'), () => t('Een variant met 3 sterren'), Star, s => s.perfectVariations >= 1),
  badge('perfect-25', () => t('Precisiewerk'), () => t('25 varianten met 3 sterren'), Crown, s => s.perfectVariations >= 25),
  badge('positions-100', () => t('100 posities'), () => t('100 posities geleerd'), Brain, s => s.learnedPositions >= 100),
  badge('mature-50', () => t('Lange termijn'), () => t('50 posities met een interval van 7+ dagen'), TreeDeciduous, s => s.maturePositions >= 50),
  badge('streak-3', () => t('Op dreef'), () => t('3 dagen op rij getraind'), Flame, s => s.streak >= 3),
  badge('streak-7', () => t('Weekritme'), () => t('7 dagen op rij getraind'), Calendar, s => s.streak >= 7),
  badge('streak-30', () => t('Gewoonte'), () => t('30 dagen op rij getraind'), Medal, s => s.streak >= 30),
  badge('puzzle-1', () => t('Afstraffer'), () => t('Eerste openingsfout afgestraft'), Sword, s => s.puzzlesSolved >= 1),
  badge('puzzle-50', () => t('Genadeloos'), () => t('50 openingsfouten afgestraft'), Swords, s => s.puzzlesSolved >= 50),
  badge('daily-1', () => t('Dagelijkse kost'), () => t('Eerste dagelijkse training voltooid'), Sun, s => s.dailyCompleted >= 1),
  badge('explorer', () => t('Verkenner'), () => t('In 5 openingen getraind'), Map, s => s.familiesStarted >= 5),
  badge('reviews-200', () => t('Herhaling is de moeder'), () => t('200 herhalingen gedaan'), Repeat, s => s.reviews >= 200),
  badge('repertoire', () => t('Eigen repertoire'), () => t('20 zetten in je eigen repertoire'), BookMarked, s => s.repertoireMoves >= 20),
]
