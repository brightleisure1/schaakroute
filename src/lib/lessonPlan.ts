import { isUserPly } from './trainer'

// Verloop van een les per variant, naar het voorbeeld van Lotus Chess:
// de zetten die je al kent staan al op het bord; de nieuwe zetten leer je in blokjes van 3 eigen zetten,
// eerst met pijlen en dan uit je hoofd. Daarna speel je het hele nieuwe stuk uit je hoofd, en zetten
// die fout gingen doe je aan het eind opnieuw (met de zetten ervoor voorgespeeld).

export const CHUNK = 3
/** Zoveel halve zetten vóór een fout worden voorgespeeld bij het herstellen */
export const REDO_CONTEXT = 8
/** Zo lang blijft een goede losse zet in beeld voordat het vanzelf verder gaat */
export const AUTO_NEXT_MS = 900
/** Een herstelzet komt hooguit zo vaak terug */
export const MAX_REDO = 3

export type StepKind = 'learn' | 'recall' | 'final' | 'redo'

export interface LessonStep {
  kind: StepKind
  variationId: string
  startPly: number
  endPly: number
  /** De zetten vanaf deze ply tot startPly worden snel voorgespeeld */
  previewFrom?: number
  /** Na deze stap telt de variant als afgerond */
  completes?: boolean
  /** Hoeveelste poging bij een herstelzet (1 = eerste keer) */
  attempt?: number
}

export const userPliesOf = (length: number, side: 'white' | 'black') =>
  Array.from({ length }, (_, p) => p).filter(p => isUserPly(p, side))

/** Aantal eigen zetten aan het begin van de variant die je al kent */
export function knownUserMoves(ids: string[], isKnown: (id: string) => boolean): number {
  let n = 0
  while (n < ids.length && isKnown(ids[n])) n++
  return n
}

/** Blokjes van CHUNK eigen zetten; een losse laatste zet gaat mee in het vorige blok */
export function chunkSizes(total: number): number[] {
  const sizes: number[] = []
  for (let left = total; left > 0; left -= CHUNK) sizes.push(Math.min(CHUNK, left))
  if (sizes.length > 1 && sizes[sizes.length - 1] === 1) sizes[sizes.length - 2] += sizes.pop()!
  return sizes
}

export function planVariation(variationId: string, length: number, side: 'white' | 'black', known: number): LessonStep[] {
  const user = userPliesOf(length, side)
  // Alles al bekend: alleen de hele variant uit je hoofd
  if (known >= user.length) return [{ kind: 'final', variationId, startPly: 0, endPly: length, completes: true }]
  const startOf = (i: number) => (i > 0 ? user[i - 1] + 1 : 0)
  const newStart = startOf(known)
  const steps: LessonStep[] = []
  let i = known
  const sizes = chunkSizes(user.length - known)
  sizes.forEach((size, j) => {
    const startPly = startOf(i)
    const last = j === sizes.length - 1
    // Het laatste blok loopt door tot het eind, zodat ook een slotzet van de tegenstander erbij is
    const endPly = last ? length : user[i + size - 1] + 1
    steps.push({ kind: 'learn', variationId, startPly, endPly, ...(j > 0 ? { previewFrom: newStart } : {}) })
    if (sizes.length === 1) steps.push({ kind: 'final', variationId, startPly, endPly, completes: true })
    else steps.push({ kind: 'recall', variationId, startPly, endPly })
    i += size
  })
  if (sizes.length > 1) steps.push({ kind: 'final', variationId, startPly: newStart, endPly: length, completes: true })
  return steps
}

/** Herstelstappen voor de zetten die fout gingen, in volgorde van de lijn */
export function redoSteps(variationId: string, plies: Iterable<number>, attempt = 1): LessonStep[] {
  return [...new Set(plies)].sort((a, b) => a - b).map(p => ({
    kind: 'redo' as const, variationId, startPly: p, endPly: p + 1, previewFrom: Math.max(0, p - REDO_CONTEXT), attempt,
  }))
}

/** Zetnummer zoals op het bord: ply 6 (wit) → 4, ply 7 (zwart) → 4 */
export const moveNo = (ply: number) => Math.floor(ply / 2) + 1
