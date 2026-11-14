import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ChevronRight, Search, X } from 'lucide-react'
import { familyProgress, useCardMap, useFamilies, useManifest, useProgressMap } from '../lib/hooks'
import { CropBoard } from '../components/CropBoard'
import { Segmented, ThickBar } from '../components/OpeningScreens'
import { ErrorBox, Spinner, pct, sideLabel, useSettings } from '../components/ui'
import { OPENING_INFO } from '../content/openingInfo'
import type { FamilySummary, Side } from '../lib/types'

// Openingen (ontwerp 10i): een korte lijst tikbare kaarten. Eigen openingen tonen hun voortgang,
// de andere alleen hoeveel varianten er zijn. Alles over één opening staat op de openingspagina.

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

function matches(f: FamilySummary, q: string) {
  if (!q) return true
  const hay = [f.name, OPENING_INFO[f.id]?.nameNl ?? '', f.ecoRange, ...f.ecoCodes].map(norm).join(' ')
  return q.split(/\s+/).every(w => hay.includes(w))
}

export function Openings() {
  const settings = useSettings()
  const { data: manifest, error } = useManifest()
  const [chosen, setChosen] = useState<Side | null>(null)
  const side: Side = chosen ?? (settings?.sides === 'black' ? 'black' : 'white')
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const families = useFamilies(manifest?.families.map(f => f.id) ?? [])
  const progress = useProgressMap()
  const cards = useCardMap()
  useEffect(() => { if (searchOpen) input.current?.focus() }, [searchOpen])
  if (error) return <ErrorBox error={error} />
  if (!manifest) return <Spinner />

  const q = norm(query.trim())
  const list = manifest.families.filter(f => f.side === side && matches(f, q))
  const otherSide: Side = side === 'white' ? 'black' : 'white'
  const otherHits = q ? manifest.families.filter(f => f.side === otherSide && matches(f, q)).length : 0
  const files = new Map((families.data ?? []).map(f => [f.family.id, f]))
  const closeSearch = () => { setSearchOpen(false); setQuery('') }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-[1.75rem] font-extrabold leading-[1.12] tracking-[-0.03em] lg:text-4xl">Openingen</h1>

      <div className="flex gap-2.5 lg:max-w-md">
        <Segmented label="Kleur" className="flex-1" value={side} onChange={setChosen} options={[{ value: 'white', label: 'Wit' }, { value: 'black', label: 'Zwart' }]} />
        <button
          type="button"
          className={`tap flex w-12 shrink-0 items-center justify-center rounded-[14px]! ${searchOpen ? 'tap-on text-brand-strong!' : ''}`}
          aria-label={searchOpen ? 'Zoeken sluiten' : 'Zoek een opening'}
          aria-expanded={searchOpen}
          aria-controls="openingen-zoek"
          onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
        >
          {searchOpen ? <X size={20} aria-hidden /> : <Search size={20} aria-hidden />}
        </button>
      </div>

      {searchOpen && (
        <label id="openingen-zoek" className="flex min-h-[3.125rem] items-center gap-2.5 rounded-[14px] border-2 border-line bg-surface px-3.5 focus-within:border-brand lg:max-w-md">
          <Search size={18} aria-hidden className="shrink-0 text-muted" />
          <span className="sr-only">Zoek een opening</span>
          <input
            ref={input}
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') closeSearch() }}
            placeholder="Naam, Nederlandse naam of ECO"
            className="min-h-11 min-w-0 flex-1 bg-transparent text-base outline-none!"
          />
        </label>
      )}

      {q && <p className="sr-only" aria-live="polite">{list.length} openingen gevonden bij {sideLabel(side)}</p>}

      {list.length === 0 ? (
        <div className="rounded-[18px] border-2 border-line bg-surface p-6 text-center text-sm text-muted">
          <p>Geen openingen gevonden bij {sideLabel(side)}.</p>
          {otherHits > 0 && (
            <button type="button" className="btn btn-ghost mt-3 min-h-11" onClick={() => setChosen(otherSide)}>
              Toon {otherHits} bij {sideLabel(otherSide)}
            </button>
          )}
        </div>
      ) : (
        <ul className="grid gap-2.5 sm:grid-cols-2 sm:gap-3 xl:grid-cols-3">
          {list.map(f => {
            const file = files.get(f.id)
            const p = file ? familyProgress(file, progress, cards) : null
            const mine = !!settings?.openings.includes(f.id)
            // Eigen openingen tonen altijd hun voortgang; andere alleen als je er al iets van hebt geleerd
            const showProgress = mine || (p?.learned ?? 0) > 0
            const nameNl = OPENING_INFO[f.id]?.nameNl
            return (
              <li key={f.id}>
                <Link to={`/opening/${f.id}`} className="tap flex h-full items-center gap-3 p-2.5 hover:border-brand!">
                  <span className="w-[76px] shrink-0"><CropBoard epd={f.rootEpd} uci={f.rootUci} orientation={f.side} coordsFrom="never" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[1.0625rem] font-bold leading-tight">{f.name}</span>
                      {mine && <span className="shrink-0 rounded-md bg-brand-soft px-[7px] py-px text-[0.6875rem] font-bold uppercase tracking-[0.04em] text-brand-strong">Mijn<span className="sr-only"> opening</span></span>}
                    </span>
                    <span className="block truncate text-[0.8125rem] text-muted">
                      {nameNl}
                      <span className="hidden sm:inline">{nameNl ? ' · ' : ''}{f.curated ? 'Extra' : `#${f.rank}`} · {f.ecoRange}</span>
                    </span>
                    {showProgress ? (
                      <>
                        <span className="mt-2 flex items-center gap-2">
                          <ThickBar value={p?.pct ?? 0} label={`${f.name}: varianten geleerd`} className="flex-1" />
                          <span className="w-9 text-right text-xs font-bold tabular-nums">{p ? `${Math.round(p.pct * 100)}%` : '…'}</span>
                        </span>
                        <span className="mt-1 block text-xs text-muted">
                          {p ? `${p.learned} van ${p.total} varianten geleerd` : `${f.variationCount} varianten`}
                          {p && p.mastered > 0 && <span className="hidden sm:inline"> · {p.mastered} beheerst</span>}
                        </span>
                      </>
                    ) : (
                      <span className="mt-1.5 block text-[0.8125rem] text-muted">
                        {f.variationCount} varianten
                        <span className="hidden sm:inline"> · {pct(f.share, 1)} van de partijen</span>
                      </span>
                    )}
                  </span>
                  <ChevronRight size={18} aria-hidden className="shrink-0 text-muted" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
