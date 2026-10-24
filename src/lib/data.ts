import { db } from './db'
import { epdsOf } from './chess'
import type { FamilyFile, Manifest, PuzzleFile, StatsFile, Variation } from './types'

// Laadt de dataset uit public/data. Elk bestand wordt na de eerste keer in IndexedDB bewaard
// (gekoppeld aan de datasetversie), zodat de training ook zonder service worker offline werkt.
// Zware bestanden (statistieken, puzzels) worden pas geladen wanneer een scherm ze nodig heeft.

const BASE = import.meta.env.BASE_URL + 'data/'
const memory = new Map<string, Promise<unknown>>()
let manifestPromise: Promise<Manifest> | null = null

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path)
  if (!res.ok) throw new Error(`Kan ${path} niet laden (${res.status})`)
  return res.json() as Promise<T>
}

export function loadManifest(): Promise<Manifest> {
  if (!manifestPromise) {
    manifestPromise = (async () => {
      try {
        const m = await fetchJson<Manifest>('manifest.json')
        db.datasets.put({ key: 'manifest', version: m.datasetVersion, data: m }).catch(() => {})
        const prev = await db.meta.get('datasetVersion').catch(() => undefined)
        if (prev?.value !== m.datasetVersion) {
          // nieuwe datasetversie: alleen de datacache leegmaken, nooit gebruikersvoortgang
          await db.datasets.where('key').notEqual('manifest').delete().catch(() => {})
          await db.meta.put({ key: 'datasetVersion', value: m.datasetVersion }).catch(() => {})
        }
        return m
      } catch (e) {
        const cached = await db.datasets.get('manifest').catch(() => undefined)
        if (cached) return cached.data as Manifest
        manifestPromise = null
        throw e
      }
    })()
  }
  return manifestPromise
}

async function loadCached<T>(key: string, path: string): Promise<T> {
  if (!memory.has(key)) {
    const p = (async () => {
      const m = await loadManifest()
      const cached = await db.datasets.get(key).catch(() => undefined)
      if (cached && cached.version === m.datasetVersion) return cached.data as T
      const data = await fetchJson<T>(path)
      db.datasets.put({ key, version: m.datasetVersion, data }).catch(() => {})
      return data
    })()
    p.catch(() => memory.delete(key))
    memory.set(key, p)
  }
  return memory.get(key) as Promise<T>
}

export const loadFamily = (id: string) => loadCached<FamilyFile>(`family:${id}`, `families/${id}.json`)
export const loadStats = (id: string) => loadCached<StatsFile>(`stats:${id}`, `stats/${id}.json`)
export const loadPuzzles = (id: string) => loadCached<PuzzleFile>(`puzzles:${id}`, `puzzles/${id}.json`)
export const loadNames = () => loadCached<Record<string, [string, string, string]>>('names', 'names.json')

export async function loadAllFamilies(): Promise<FamilyFile[]> {
  const m = await loadManifest()
  return Promise.all(m.families.map(f => loadFamily(f.id)))
}

// ---------- afgeleide indexen ----------

export interface PositionRef {
  variationId: string
  ply: number // aantal gespeelde zetten in deze stelling
  next?: string // volgende zet (uci) in die variant
  nextSan?: string
}

const posIndexCache = new WeakMap<FamilyFile, Map<string, PositionRef[]>>()

/** OpeningPosition-index: alle stellingen uit alle varianten van een familie, per EPD (transpositie-bewust). */
export function positionIndex(file: FamilyFile): Map<string, PositionRef[]> {
  let idx = posIndexCache.get(file)
  if (idx) return idx
  idx = new Map()
  for (const v of file.variations) {
    const lines = [{ uci: v.uci, san: v.san }, ...(v.moveOrders ?? [])]
    for (const line of lines) {
      const epds = epdsOf(line.uci)
      epds.forEach((e, ply) => {
        const list = idx!.get(e) ?? []
        list.push({ variationId: v.id, ply, next: line.uci[ply], nextSan: line.san[ply] })
        idx!.set(e, list)
      })
    }
  }
  posIndexCache.set(file, idx)
  return idx
}

/** Aantal unieke stellingen in een familie waarin de trainende kant aan zet is (= te leren posities) */
export function learnablePositions(file: FamilyFile): number {
  const set = new Set<string>()
  const userColor = file.family.side === 'white' ? 0 : 1
  for (const v of file.variations) {
    const epds = epdsOf(v.uci)
    for (let ply = userColor; ply < v.uci.length; ply += 2) set.add(epds[ply] + '|' + v.uci[ply])
  }
  return set.size
}

export function variationById(file: FamilyFile, id: string): Variation | undefined {
  return file.variations.find(v => v.id === id)
}

export function displayName(v: Variation, familyName?: string): string {
  const base = v.path.length ? v.path.join(', ') : familyName ?? v.name
  return v.lineNo ? `${base} (lijn ${v.lineNo})` : base
}

/** Varianten die dezelfde eerste naamniveaus delen (voor 'verwante variant') */
export function relatedVariations(file: FamilyFile, v: Variation, limit = 6): Variation[] {
  const top = v.path[0]
  return file.variations
    .filter(o => o.id !== v.id && (top ? o.path[0] === top : o.path.length <= 1))
    .sort((a, b) => sharedPrefix(b.uci, v.uci) - sharedPrefix(a.uci, v.uci) || (b.reach ?? 0) - (a.reach ?? 0))
    .slice(0, limit)
}

function sharedPrefix(a: string[], b: string[]) {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i
}
