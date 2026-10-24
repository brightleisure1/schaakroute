// XP, levels, streaks en badges. Bewust bescheiden: het schaken staat centraal.
import { BookMarked, Brain, Calendar, Compass, Crown, Flag, Flame, Library, Map, Medal, Repeat, Star, Sun, Sword, Swords, TreeDeciduous, type LucideIcon } from 'lucide-react'

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

export const BADGES: BadgeDef[] = [
  { id: 'first-line', title: 'Eerste route', description: 'Je eerste variant afgerond', icon: Flag, check: s => s.variationsCompleted >= 1 },
  { id: 'ten-lines', title: 'Routeplanner', description: '10 varianten afgerond', icon: Compass, check: s => s.variationsCompleted >= 10 },
  { id: 'fifty-lines', title: 'Theoreticus', description: '50 varianten afgerond', icon: Library, check: s => s.variationsCompleted >= 50 },
  { id: 'perfect', title: 'Foutloos', description: 'Een variant met 3 sterren', icon: Star, check: s => s.perfectVariations >= 1 },
  { id: 'perfect-25', title: 'Precisiewerk', description: '25 varianten met 3 sterren', icon: Crown, check: s => s.perfectVariations >= 25 },
  { id: 'positions-100', title: '100 posities', description: '100 posities geleerd', icon: Brain, check: s => s.learnedPositions >= 100 },
  { id: 'mature-50', title: 'Lange termijn', description: '50 posities met een interval van 7+ dagen', icon: TreeDeciduous, check: s => s.maturePositions >= 50 },
  { id: 'streak-3', title: 'Op dreef', description: '3 dagen op rij getraind', icon: Flame, check: s => s.streak >= 3 },
  { id: 'streak-7', title: 'Weekritme', description: '7 dagen op rij getraind', icon: Calendar, check: s => s.streak >= 7 },
  { id: 'streak-30', title: 'Gewoonte', description: '30 dagen op rij getraind', icon: Medal, check: s => s.streak >= 30 },
  { id: 'puzzle-1', title: 'Afstraffer', description: 'Eerste openingsfout afgestraft', icon: Sword, check: s => s.puzzlesSolved >= 1 },
  { id: 'puzzle-50', title: 'Genadeloos', description: '50 openingsfouten afgestraft', icon: Swords, check: s => s.puzzlesSolved >= 50 },
  { id: 'daily-1', title: 'Dagelijkse kost', description: 'Eerste dagelijkse training voltooid', icon: Sun, check: s => s.dailyCompleted >= 1 },
  { id: 'explorer', title: 'Verkenner', description: 'In 5 openingen getraind', icon: Map, check: s => s.familiesStarted >= 5 },
  { id: 'reviews-200', title: 'Herhaling is de moeder', description: '200 herhalingen gedaan', icon: Repeat, check: s => s.reviews >= 200 },
  { id: 'repertoire', title: 'Eigen repertoire', description: '20 zetten in je eigen repertoire', icon: BookMarked, check: s => s.repertoireMoves >= 20 },
]
