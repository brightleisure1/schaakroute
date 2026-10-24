import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type TrainingCard, type VariationProgress } from './db'
import { loadFamily, loadManifest } from './data'
import { epdsOf } from './chess'
import { isUserPly } from './trainer'
import { masteryScore, stageOf } from './srs'
import type { FamilyFile, Manifest, Variation } from './types'

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): { data?: T; error?: unknown; loading: boolean } {
  const [state, setState] = useState<{ data?: T; error?: unknown; loading: boolean }>({ loading: true })
  useEffect(() => {
    let alive = true
    setState(s => ({ ...s, loading: true }))
    fn().then(
      data => alive && setState({ data, loading: false }),
      error => alive && setState({ error, loading: false }),
    )
    return () => {
      alive = false
    }
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
  return state
}

export const useManifest = () => useAsync<Manifest>(() => loadManifest(), [])
export const useFamily = (id?: string) => useAsync<FamilyFile | undefined>(() => (id ? loadFamily(id) : Promise.resolve(undefined)), [id])
export const useFamilies = (ids: string[]) => useAsync<FamilyFile[]>(() => Promise.all(ids.map(loadFamily)), [ids.join(',')])

export function useProgressMap(familyId?: string): Map<string, VariationProgress> {
  const rows = useLiveQuery(() => (familyId ? db.progress.where('familyId').equals(familyId).toArray() : db.progress.toArray()), [familyId], [])
  return new Map(rows.map(r => [r.id, r]))
}

export function useCardMap(familyId?: string): Map<string, TrainingCard> {
  const rows = useLiveQuery(() => (familyId ? db.cards.where('familyIds').equals(familyId).toArray() : db.cards.toArray()), [familyId], [])
  return new Map(rows.map(r => [r.id, r]))
}

const userKeysCache = new WeakMap<Variation, string[]>()
/** Kaart-ID's (EPD|zet) van alle zetten van de trainende kant in een variant */
export function userCardIds(v: Variation, side: 'white' | 'black'): string[] {
  let ids = userKeysCache.get(v)
  if (!ids) {
    const epds = epdsOf(v.uci)
    ids = v.uci.map((u, i) => (isUserPly(i, side) ? `${epds[i]}|${u}` : '')).filter(Boolean)
    userKeysCache.set(v, ids)
  }
  return ids
}

export interface VariationMastery {
  score: number // 0–100
  learned: boolean
  mastered: boolean
  seen: number
  total: number
}

export function variationMastery(v: Variation, side: 'white' | 'black', cards: Map<string, TrainingCard>, progress?: VariationProgress): VariationMastery {
  const ids = userCardIds(v, side)
  let sum = 0
  let seen = 0
  let mature = 0
  for (const id of ids) {
    const c = cards.get(id)
    if (!c) continue
    seen++
    sum += masteryScore(c)
    if (stageOf(c) === 'mature') mature++
  }
  return {
    score: ids.length ? Math.round(sum / ids.length) : 0,
    learned: (progress?.completions ?? 0) > 0,
    mastered: ids.length > 0 && mature === ids.length,
    seen,
    total: ids.length,
  }
}

export function familyProgress(file: FamilyFile, progress: Map<string, VariationProgress>, cards: Map<string, TrainingCard>) {
  let learned = 0
  let mastered = 0
  let score = 0
  for (const v of file.variations) {
    const m = variationMastery(v, file.family.side, cards, progress.get(v.id))
    if (m.learned) learned++
    if (m.mastered) mastered++
    score += m.score
  }
  const positions = [...cards.values()].filter(c => c.familyIds.includes(file.family.id) && c.correct > 0).length
  return { learned, mastered, total: file.variations.length, score: Math.round(score / Math.max(1, file.variations.length)), positions, pct: learned / Math.max(1, file.variations.length) }
}
