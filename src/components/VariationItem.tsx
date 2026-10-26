import { Link } from 'react-router'
import { moveNumberLabel } from '../lib/chess'
import { displayName } from '../lib/data'
import { pct } from './ui'
import { CropBoard } from './CropBoard'
import type { FamilyFile, Variation } from '../lib/types'

/** "5…a6" of "3…Bc5 4.d3": de laatste (kenmerkende) zetten van een variant, niet vóór de beginzetten */
export function keyMoves(v: Variation, rootLen: number, max = 2) {
  const from = Math.max(rootLen, v.san.length - max)
  return v.san.slice(from).map((m, i) => {
    const ply = from + i
    return ply % 2 === 0 ? `${moveNumberLabel(ply)}${m}` : i === 0 ? `${moveNumberLabel(ply).replace('...', '…')}${m}` : m
  }).join(' ')
}

/** Laatste deel van de naam; algemene namen ("Main Line", "Normal") krijgen de bovenliggende variant erbij */
export function shortName(v: Variation, familyName: string) {
  if (!v.path.length) return displayName(v, familyName)
  const last = v.path[v.path.length - 1]
  const name = v.path.length > 1 && /^(main line|normal( variation)?|main variation)$/i.test(last) ? `${v.path[v.path.length - 2]}: ${last}` : last
  return v.lineNo ? `${name} (lijn ${v.lineNo})` : name
}

export type VariationStatus = 'new' | 'learned' | 'hard' | 'mastered'

const STATUS: Record<VariationStatus, { label: string; cls: string }> = {
  mastered: { label: 'Beheerst', cls: 'bg-brand text-on-brand' },
  learned: { label: 'Geleerd', cls: 'bg-brand-soft text-brand-strong' },
  hard: { label: 'Moeilijk', cls: 'bg-danger-soft text-danger-ink' },
  new: { label: 'Nieuw', cls: 'bg-surface-2 text-muted' },
}

/**
 * Eén variant als regel: bordje, naam, kenmerkende zetten, aandeel, status en Leren/Oefenen.
 * Dezelfde regel op de openingspagina en in de volledige variantenlijst.
 */
export function VariationItem({ v, file, status, label }: { v: Variation; file: FamilyFile; status: VariationStatus; label?: string }) {
  const f = file.family
  const share = v.reach !== null ? pct(v.freq, v.freq < 0.01 ? 1 : 0) : null
  const moves = keyMoves(v, f.rootSan.length)
  return (
    <li>
      <Link to={`/train/${f.id}/${v.id}?mode=${status === 'new' ? 'learn' : 'practice'}`} className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-2.5 hover:bg-surface-2 focus-visible:bg-surface-2 lg:grid-cols-[3.5rem_minmax(0,1fr)_10rem_6rem_6rem] lg:gap-4.5 lg:px-4.5 lg:py-3">
        <CropBoard epd={v.epd} uci={v.uci} orientation={f.side} coordsFrom="never" />
        <span className="min-w-0">
          <span className="line-clamp-2 block font-bold leading-snug lg:truncate lg:text-base">{label ?? shortName(v, f.name)}</span>
          <span className="block text-sm text-muted">{moves}{share && <span className="lg:hidden">{moves ? ' · ' : ''}{share}</span>}</span>
        </span>
        <span className="hidden items-center gap-2.5 lg:flex" aria-label={share ? `${share} van de partijen` : 'te zeldzaam voor een percentage'}>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-(--board-dark)" style={{ width: `${Math.min(100, v.freq * 100)}%` }} /></span>
          <span className="w-10 text-right text-sm font-bold tabular-nums">{share ?? '–'}</span>
        </span>
        <span className={`justify-self-start rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS[status].cls}`}>{STATUS[status].label}</span>
        <span className="hidden min-h-10 items-center justify-center rounded-xl border border-line bg-surface-2 text-sm font-semibold lg:flex">{status === 'new' ? 'Leren' : 'Oefenen'}</span>
      </Link>
    </li>
  )
}
