import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { formatMoves } from '../lib/chess'
import { groupByFirstMove, matchesOpening } from '../lib/openingGroups'
import { OPENING_INFO } from '../content/openingInfo'
import { CropBoard } from './CropBoard'
import { Tabs, pct } from './ui'
import type { FamilySummary, Side } from '../lib/types'

const SIDE_LABEL: Record<Side, string> = { white: 'Wit', black: 'Zwart' }

export function OpeningPicker({ families, sides, value, onChange }: { families: FamilySummary[]; sides: Side | 'both'; value: string[]; onChange: (ids: string[]) => void }) {
  const shownSides: Side[] = sides === 'both' ? ['white', 'black'] : [sides]
  const [tab, setTab] = useState<Side>(shownSides[0])
  const [query, setQuery] = useState('')
  const searching = query.trim() !== ''

  const toggle = (id: string) => onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id])
  const chosen = value.flatMap(id => families.filter(f => f.id === id))
  const countFor = (side: Side) => chosen.filter(f => f.side === side).length
  const tabLabel = (side: Side) => (countFor(side) ? `${SIDE_LABEL[side]} (${countFor(side)})` : SIDE_LABEL[side])
  // De lijst staat op populariteit, dus de eerste per kleur is de populairste
  const popular = shownSides.flatMap(side => families.find(f => f.side === side)?.id ?? [])
  const results = shownSides.map(side => ({ side, list: families.filter(f => f.side === side && matchesOpening(f, OPENING_INFO[f.id]?.nameNl, query)) }))

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Welke openingen wil je leren?</h2>
        <p className="mt-1 text-sm text-muted">Kies er minstens één. Je kunt dit later aanpassen.</p>
      </div>

      <div className="min-h-8 space-y-2">
        <p className="text-sm font-semibold" aria-live="polite">{chosen.length ? `${chosen.length} gekozen` : 'Nog niets gekozen'}</p>
        {chosen.length > 0
          ? (
            <div className="flex flex-wrap gap-1.5">
              {chosen.map(f => (
                <button key={f.id} className="group inline-flex min-h-8 items-center gap-1.5 rounded-full bg-brand-soft py-1 pl-2 pr-2 text-xs font-semibold text-ink transition hover:bg-brand/25 pointer-coarse:min-h-11" aria-label={`${f.name} (${SIDE_LABEL[f.side].toLowerCase()}) verwijderen`} onClick={() => toggle(f.id)}>
                  <SidePawn side={f.side} />{f.name}<X size={12} strokeWidth={2.5} aria-hidden className="text-muted transition group-hover:text-ink" />
                </button>
              ))}
            </div>
          )
          : (
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
              Weet je het niet?
              <button className="btn btn-ghost" onClick={() => onChange(popular)}>Kies de populairste</button>
            </div>
          )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {sides === 'both' && !searching && (
          <div className="shrink-0"><Tabs value={tab} onChange={setTab} options={shownSides.map(side => ({ value: side, label: tabLabel(side) }))} /></div>
        )}
        <input className="input min-h-11 sm:flex-1" type="search" aria-label="Zoek een opening" placeholder="Zoek op naam of zetten" value={query} onChange={e => setQuery(e.target.value)} />
      </div>

      {searching
        ? (
          <>
            {results.filter(r => r.list.length).map(r => (
              <OpeningSection key={r.side} title={sides === 'both' ? `Met ${SIDE_LABEL[r.side].toLowerCase()}` : undefined} families={r.list} value={value} onToggle={toggle} />
            ))}
            {results.every(r => !r.list.length) && <p className="text-sm text-muted">Geen opening gevonden voor “{query.trim()}”.</p>}
          </>
        )
        : groupByFirstMove(families, sides === 'both' ? tab : sides).map(g => (
          <OpeningSection key={g.key} title={g.label} families={g.families} value={value} onToggle={toggle} />
        ))}
    </div>
  )
}

/** Eigen silhouet op een bordveldje: scherp op dit kleine formaat en de kleur leest in elk thema hetzelfde */
function SidePawn({ side }: { side: Side }) {
  const white = side === 'white'
  return (
    <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px]" style={{ background: white ? 'var(--board-dark)' : 'var(--board-light)' }}>
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill={white ? '#ffffff' : '#14181a'}>
        <path d="M12 2.5a4 4 0 0 1 2.9 6.75H16a1 1 0 0 1 0 2h-1.6l1.3 7.25H8.3l1.3-7.25H8a1 1 0 0 1 0-2h1.1A4 4 0 0 1 12 2.5z" />
        <path d="M7 18.5h10a2 2 0 0 1 2 2v.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-.5a2 2 0 0 1 2-2z" />
      </svg>
    </span>
  )
}

function OpeningSection({ title, families, value, onToggle }: { title?: string; families: FamilySummary[]; value: string[]; onToggle: (id: string) => void }) {
  return (
    <section>
      {title && <h3 className="mb-2 text-sm font-semibold text-muted">{title}</h3>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        {families.map(f => <OpeningCard key={f.id} family={f} selected={value.includes(f.id)} onToggle={() => onToggle(f.id)} />)}
      </div>
    </section>
  )
}

function OpeningCard({ family: f, selected, onToggle }: { family: FamilySummary; selected: boolean; onToggle: () => void }) {
  return (
    <button aria-pressed={selected} className={`card relative flex flex-col gap-2 p-2 text-left transition ${selected ? 'border-brand ring-2 ring-brand/30' : 'hover:border-brand'}`} onClick={onToggle}>
      <CropBoard epd={f.rootEpd} uci={f.rootUci} orientation={f.side} />
      <span aria-hidden className={`absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-md border shadow-sm ${selected ? 'border-brand bg-brand text-on-brand' : 'border-line bg-surface'}`}>{selected && <Check size={16} strokeWidth={3} />}</span>
      <span className="block min-w-0 px-1 pb-1">
        <span className="block text-sm font-semibold leading-tight">{f.name}</span>
        <span className="block text-xs text-muted">{OPENING_INFO[f.id]?.nameNl}</span>
        <span className="mt-1 block font-mono text-xs text-muted">{formatMoves(f.rootSan)}</span>
        <span className="mt-1 block text-xs text-muted">{f.variationCount} varianten · {pct(f.share, 1)} van de partijen</span>
      </span>
    </button>
  )
}
