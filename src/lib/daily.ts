import { db, type TrainingCard, type UserSettings, type VariationProgress } from './db'
import { displayName, loadFamily, loadManifest, loadPuzzles } from './data'
import { learnLessons } from './course'
import type { FamilyFile, Puzzle, TrainingLine, TrainMode, Variation } from './types'

// Stelt één doorlopende dagelijkse training samen binnen het gekozen aantal minuten:
// herhalingen (eerdere fouten eerst), nieuwe varianten (leren + direct oefenen), moeilijke varianten
// en tactische openingskansen (Crushing).

export type DailyItem =
  | { kind: 'review'; card: TrainingCard; line: TrainingLine }
  | { kind: 'new' | 'hard'; familyId: string; variation: Variation; line: TrainingLine; mode: TrainMode }
  | { kind: 'puzzle'; familyId: string; puzzle: Puzzle }

export const COST = { review: 20, perUserMove: 12, puzzle: 60 }

export function variationLine(file: FamilyFile, v: Variation): TrainingLine {
  return {
    key: `${file.family.id}:${v.id}`,
    familyId: file.family.id,
    variationId: v.id,
    title: displayName(v, file.family.name),
    subtitle: `${file.family.name} · ${v.eco}`,
    uci: v.uci,
    san: v.san,
    side: file.family.side,
  }
}

export function cardLine(card: TrainingCard, title = 'Herhaling'): TrainingLine {
  return {
    key: `card:${card.id}`,
    familyId: card.familyIds[0],
    variationId: card.variationIds[0],
    title,
    uci: [...card.lineUci, card.uci],
    san: [],
    side: card.side,
    startPly: card.lineUci.length,
    endPly: card.lineUci.length + 1,
  }
}

/** Volgorde waarin een opening geleerd wordt: lessen van niveau 1 t/m 5, zonder korte lijnen */
export function courseOrder(file: FamilyFile): Variation[] {
  const byId = new Map(file.variations.map(v => [v.id, v]))
  const out: Variation[] = []
  for (const l of [...learnLessons(file)].sort((a, b) => a.level - b.level)) for (const id of l.variationIds) out.push(byId.get(id)!)
  return out
}

export async function chosenFamilies(settings: UserSettings): Promise<FamilyFile[]> {
  const m = await loadManifest()
  let ids = settings.openings
  if (!ids.length) ids = m.families.filter(f => settings.sides === 'both' || f.side === settings.sides).slice(0, 4).map(f => f.id)
  return Promise.all(ids.map(id => loadFamily(id)))
}

export async function buildDailyPlan(settings: UserSettings): Promise<DailyItem[]> {
  const budget = settings.dailyMinutes * 60
  const families = await chosenFamilies(settings)
  const progress = new Map((await db.progress.toArray()).map(p => [p.id, p]))
  const now = Date.now()
  const due = (await db.cards.where('dueAt').belowOrEqual(now).toArray()).filter(c => !c.suspended)
  // eerdere fouten eerst, daarna de langst openstaande
  due.sort((a, b) => b.lapses - a.lapses || a.dueAt - b.dueAt)

  const items: DailyItem[] = []
  let spent = 0
  const costOf = (v: Variation, side: string) => Math.ceil(v.uci.length / 2) * COST.perUserMove * (side ? 1 : 1)

  // 1. herhalingen: max. 45% van de tijd
  for (const card of due) {
    if (spent + COST.review > budget * 0.45) break
    items.push({ kind: 'review', card, line: cardLine(card) })
    spent += COST.review
  }

  // 2. nieuwe varianten in leervolgorde, verdeeld over de gekozen openingen
  const queues = families.map(f => ({ f, list: courseOrder(f).filter(v => !(progress.get(v.id)?.completions)) }))
  const newBudget = budget * (items.length ? 0.8 : 0.75)
  let qi = 0
  let guard = 0
  while (spent < newBudget && queues.some(q => q.list.length) && guard++ < 200) {
    const q = queues[qi++ % queues.length]
    const v = q.list.shift()
    if (!v) continue
    const cost = costOf(v, q.f.family.side) * 2
    if (spent + cost > newBudget && items.some(i => i.kind === 'new')) break
    items.push({ kind: 'new', familyId: q.f.family.id, variation: v, line: variationLine(q.f, v), mode: 'learn' })
    items.push({ kind: 'new', familyId: q.f.family.id, variation: v, line: variationLine(q.f, v), mode: 'practice' })
    spent += cost
  }

  // 3. moeilijke varianten (veel fouten per keer spelen)
  const hard = [...progress.values()]
    .filter((p: VariationProgress) => p.completions > 0 && p.mistakes / Math.max(1, p.completions) >= 1 && families.some(f => f.family.id === p.familyId))
    .sort((a, b) => b.mistakes / b.completions - a.mistakes / a.completions)
  for (const p of hard.slice(0, 2)) {
    const f = families.find(x => x.family.id === p.familyId)!
    const v = f.variations.find(x => x.id === p.id)
    if (!v || spent > budget * 0.9) continue
    items.push({ kind: 'hard', familyId: f.family.id, variation: v, line: variationLine(f, v), mode: 'practice' })
    spent += costOf(v, f.family.side)
  }

  // 4. tactische openingskansen op jouw niveau
  const solved = new Set((await db.puzzles.toArray()).filter(p => p.solved > 0).map(p => p.id))
  for (const f of families) {
    if (spent + COST.puzzle > budget) break
    try {
      const pf = await loadPuzzles(f.family.id)
      const candidates = pf.puzzles.filter(p => !solved.has(p.id) && Math.abs(p.rating - settings.elo) <= 250)
      const pz = candidates[Math.floor(Math.random() * candidates.length)]
      if (pz) {
        items.push({ kind: 'puzzle', familyId: f.family.id, puzzle: pz })
        spent += COST.puzzle
      }
    } catch {
      // puzzels zijn optioneel
    }
  }
  return items
}

/** Per soort onderdeel: aantal (nieuwe varianten één keer, niet leren + spelen apart) en geschatte seconden */
export function planBreakdown(items: DailyItem[]): Record<DailyItem['kind'], { count: number; seconds: number }> {
  const out = { review: { count: 0, seconds: 0 }, new: { count: 0, seconds: 0 }, hard: { count: 0, seconds: 0 }, puzzle: { count: 0, seconds: 0 } }
  for (const i of items) {
    const b = out[i.kind]
    if (i.kind !== 'new' || i.mode !== 'learn') b.count++
    b.seconds += i.kind === 'review' ? COST.review : i.kind === 'puzzle' ? COST.puzzle : Math.ceil(i.line.uci.length / 2) * COST.perUserMove
  }
  return out
}

export function estimateMinutes(items: DailyItem[]) {
  let s = 0
  for (const i of items) {
    if (i.kind === 'review') s += COST.review
    else if (i.kind === 'puzzle') s += COST.puzzle
    else s += Math.ceil(i.line.uci.length / 2) * COST.perUserMove
  }
  return Math.max(1, Math.round(s / 60))
}
