import { db, today, type SchaakDB, type TrainingAttempt, type TrainingCard, type DailyActivity, type TrainingSession } from './db'
import { newSrsState, review, stageOf, type Quality } from './srs'
import { BADGES, XP, computeStreak, type BadgeStats } from './gamification'
import type { Side, TrainMode } from './types'

// Schrijft trainingsresultaten weg: kaarten (spaced repetition), pogingen, dagactiviteit, XP en badges.

export const cardId = (epd: string, uci: string) => `${epd}|${uci}`

async function bumpDaily(patch: Partial<Record<keyof DailyActivity, number | boolean>>, database: SchaakDB) {
  const day = today()
  const cur: DailyActivity = (await database.daily.get(day)) ?? {
    day, correct: 0, mistakes: 0, newCards: 0, reviews: 0, xp: 0, seconds: 0, sessions: 0, dailyCompleted: false,
  }
  for (const [k, v] of Object.entries(patch)) {
    if (typeof v === 'number') (cur as unknown as Record<string, number>)[k] += v
    else if (typeof v === 'boolean') (cur as unknown as Record<string, boolean>)[k] = v
  }
  await database.daily.put(cur)
}

export async function addXp(amount: number, database: SchaakDB = db) {
  if (amount <= 0) return
  const m = await database.meta.get('xp')
  await database.meta.put({ key: 'xp', value: ((m?.value as number) ?? 0) + amount })
  await bumpDaily({ xp: amount }, database)
}

export async function totalXp(database: SchaakDB = db): Promise<number> {
  return ((await database.meta.get('xp'))?.value as number) ?? 0
}

export interface MoveRecord {
  epd: string
  uci: string
  san: string
  side: Side
  familyId?: string
  variationId?: string
  lineUci: string[]
  quality: Quality
  mode: TrainMode
  result: TrainingAttempt['result']
  sessionId?: number
}

/** Registreert één zet van de gebruiker en werkt de bijbehorende TrainingCard bij (SM-2). */
export async function recordMove(r: MoveRecord, database: SchaakDB = db): Promise<{ card: TrainingCard; isNew: boolean; xp: number }> {
  const id = cardId(r.epd, r.uci)
  const now = Date.now()
  return database.transaction('rw', [database.cards, database.attempts, database.daily, database.meta], async () => {
    const existing = await database.cards.get(id)
    const isNew = !existing || existing.correct + existing.wrong === 0
    let card: TrainingCard = existing ?? {
      ...newSrsState(now),
      id, epd: r.epd, uci: r.uci, san: r.san, side: r.side,
      familyIds: [], variationIds: [], lineUci: r.lineUci, createdAt: now,
    }
    if (r.familyId && !card.familyIds.includes(r.familyId)) card.familyIds = [...card.familyIds, r.familyId]
    if (r.variationId && !card.variationIds.includes(r.variationId)) card.variationIds = [...card.variationIds, r.variationId]
    if (r.mode === 'learn' && isNew) {
      // In de leermodus wordt de zet voorgedaan: de kaart komt over 10 minuten terug als echte vraag.
      card = { ...card, dueAt: now + 10 * 60_000 }
    } else {
      card = { ...card, ...review(card, r.quality, now) }
    }
    card.suspended = false
    await database.cards.put(card)
    await database.attempts.add({
      sessionId: r.sessionId, at: now, day: today(), cardId: id, familyId: r.familyId, variationId: r.variationId,
      epd: r.epd, expected: r.uci, played: null, result: r.result,
    })
    const correct = r.quality >= 3 ? 1 : 0
    const xp = r.mode === 'learn' ? 1 : correct ? XP.correctMove + (r.quality === 5 ? XP.firstTryBonus : 0) : 0
    await bumpDaily({
      correct, mistakes: correct ? 0 : 1,
      newCards: isNew && r.mode !== 'learn' && correct ? 1 : 0,
      reviews: !isNew && r.mode !== 'learn' ? 1 : 0,
    }, database)
    if (xp) {
      const m = await database.meta.get('xp')
      await database.meta.put({ key: 'xp', value: ((m?.value as number) ?? 0) + xp })
      await bumpDaily({ xp }, database)
    }
    return { card, isNew, xp }
  })
}

export async function recordMistake(a: Omit<TrainingAttempt, 'id' | 'at' | 'day'>, database: SchaakDB = db) {
  await database.attempts.add({ ...a, at: Date.now(), day: today() })
}

export async function completeVariation(
  p: { variationId: string; familyId: string; stars: number; mistakes: number; hints: number; correct: number; mode: TrainMode },
  database: SchaakDB = db,
): Promise<number> {
  const now = Date.now()
  const cur = (await database.progress.get(p.variationId)) ?? {
    id: p.variationId, familyId: p.familyId, completions: 0, bestStars: 0, lastStars: 0, mistakes: 0, hintsUsed: 0, correctMoves: 0,
  }
  const learn = p.mode === 'learn'
  await database.progress.put({
    ...cur,
    completions: cur.completions + (learn ? 0 : 1),
    bestStars: learn ? cur.bestStars : Math.max(cur.bestStars, p.stars),
    lastStars: learn ? cur.lastStars : p.stars,
    mistakes: cur.mistakes + p.mistakes,
    hintsUsed: cur.hintsUsed + p.hints,
    correctMoves: cur.correctMoves + p.correct,
    learnedAt: cur.learnedAt ?? (learn ? undefined : now),
    lastPracticed: now,
  })
  const xp = learn ? 5 : XP.variationComplete + p.stars * XP.perStar
  await addXp(xp, database)
  return xp
}

export async function startSession(kind: TrainingSession['kind'], familyId?: string, database: SchaakDB = db) {
  const id = await database.sessions.add({ kind, familyId, startedAt: Date.now(), correct: 0, mistakes: 0, hints: 0, newCards: 0, reviewedCards: 0, xp: 0 })
  await bumpDaily({ sessions: 1 }, database)
  return id as number
}

export async function endSession(id: number, patch: Partial<TrainingSession>, database: SchaakDB = db) {
  const s = await database.sessions.get(id)
  if (!s) return
  const endedAt = Date.now()
  await database.sessions.put({ ...s, ...patch, endedAt })
  await bumpDaily({ seconds: Math.min(3600, Math.round((endedAt - s.startedAt) / 1000)) }, database)
}

export async function markDailyComplete(database: SchaakDB = db) {
  const d = await database.daily.get(today())
  if (d?.dailyCompleted) return 0
  await bumpDaily({ dailyCompleted: true }, database)
  await addXp(XP.dailyComplete, database)
  return XP.dailyComplete
}

export async function recordPuzzle(id: string, familyId: string, solved: boolean, database: SchaakDB = db) {
  const cur = (await database.puzzles.get(id)) ?? { id, familyId, solved: 0, failed: 0, lastAt: 0 }
  await database.puzzles.put({ ...cur, solved: cur.solved + (solved ? 1 : 0), failed: cur.failed + (solved ? 0 : 1), lastAt: Date.now() })
  await bumpDaily(solved ? { correct: 1 } : { mistakes: 1 }, database)
  if (solved) await addXp(XP.puzzle, database)
}

export async function streak(database: SchaakDB = db) {
  const days = (await database.daily.toArray()).filter(d => d.correct + d.mistakes + d.reviews > 0).map(d => d.day)
  return computeStreak(days, today())
}

export async function badgeStats(database: SchaakDB = db): Promise<BadgeStats> {
  const [progress, cards, puzzles, daily, repMoves, st] = await Promise.all([
    database.progress.toArray(), database.cards.toArray(), database.puzzles.toArray(), database.daily.toArray(), database.repMoves.count(), streak(database),
  ])
  return {
    variationsCompleted: progress.filter(p => p.completions > 0).length,
    perfectVariations: progress.filter(p => p.bestStars >= 3).length,
    learnedPositions: cards.filter(c => c.correct > 0).length,
    maturePositions: cards.filter(c => stageOf(c) === 'mature').length,
    streak: st.current,
    puzzlesSolved: puzzles.reduce((a, p) => a + (p.solved > 0 ? 1 : 0), 0),
    dailyCompleted: daily.filter(d => d.dailyCompleted).length,
    familiesStarted: new Set(progress.map(p => p.familyId)).size,
    reviews: daily.reduce((a, d) => a + d.reviews, 0),
    repertoireMoves: repMoves,
  }
}

/** Kent nieuwe badges toe; geeft de nieuw verdiende terug (voor een felicitatie-animatie). */
export async function checkBadges(database: SchaakDB = db) {
  const s = await badgeStats(database)
  const have = new Set((await database.badges.toArray()).map(b => b.id))
  const earned = BADGES.filter(b => !have.has(b.id) && b.check(s))
  if (earned.length) await database.badges.bulkPut(earned.map(b => ({ id: b.id, earnedAt: Date.now() })))
  return earned
}

export async function dueCards(limit = 200, database: SchaakDB = db) {
  const now = Date.now()
  return (await database.cards.where('dueAt').belowOrEqual(now).limit(limit * 2).toArray())
    .filter(c => !c.suspended)
    .slice(0, limit)
}

/** Volledige back-up van alle gebruikersgegevens (JSON) */
export async function exportBackup(database: SchaakDB = db) {
  const tables = ['settings', 'cards', 'progress', 'sessions', 'attempts', 'daily', 'repertoires', 'repMoves', 'puzzles', 'games', 'badges', 'meta'] as const
  const out: Record<string, unknown[]> = {}
  for (const t of tables) out[t] = await database.table(t).toArray()
  return { app: 'SchaakRoute', version: 1, exportedAt: new Date().toISOString(), data: out }
}

export async function importBackup(backup: { app: string; data: Record<string, unknown[]> }, database: SchaakDB = db) {
  if (backup.app !== 'SchaakRoute') throw new Error('Dit is geen SchaakRoute-back-up')
  await database.transaction('rw', database.tables.filter(t => t.name !== 'datasets'), async () => {
    for (const [name, rows] of Object.entries(backup.data)) {
      const t = database.table(name)
      await t.clear()
      await t.bulkPut(rows)
    }
  })
}
