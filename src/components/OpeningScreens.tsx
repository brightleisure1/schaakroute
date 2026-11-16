import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Check, ChevronsUpDown } from 'lucide-react'
import type { TrainingCard, VariationProgress } from '../lib/db'
import type { FamilyFile, FamilySummary, Variation } from '../lib/types'
import { userCardIds, variationMastery, type VariationMastery } from '../lib/hooks'
import { isUserPly } from '../lib/trainer'
import { CropBoard } from './CropBoard'
import { keyMoves, shortName } from './VariationItem'
import { pct } from './ui'
import { t } from '../lib/i18n'

// Gedeelde bouwstenen voor de schermen Openingen (10i), Opening (10j) en Varianten (10k) uit ontwerpronde 10.

/** Dikke voortgangsbalk (8 of 10 px): voortgang moet altijd goed zichtbaar zijn */
export function ThickBar({ value, label, size = 'md', className = '' }: { value: number; label: string; size?: 'md' | 'lg'; className?: string }) {
  const p = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div className={`w-full overflow-hidden rounded-full bg-track ${size === 'lg' ? 'h-2.5' : 'h-2'} ${className}`} role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="relative h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${p}%` }}>
        {size === 'lg' && p >= 4 && <span aria-hidden className="absolute inset-x-1.5 top-0.5 h-[3px] rounded-full bg-white/30" />}
      </div>
    </div>
  )
}

/** Kleurkeuze als segmenten (Wit | Zwart): kiezen in plaats van invullen */
export function Segmented<T extends string>({ value, onChange, options, label, className = '' }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; label: string; className?: string }) {
  return (
    <div role="group" aria-label={label} className={`flex gap-0.5 rounded-[14px] border border-line bg-surface-2 p-[3px] ${className}`}>
      {options.map(o => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`flex min-h-11 flex-1 items-center justify-center whitespace-nowrap rounded-[11px] px-3 text-sm transition ${on ? 'bg-surface font-bold text-ink shadow-[0_1px_2px_rgb(31_42_36/0.14)]' : 'font-medium text-muted hover:text-ink'}`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Een keuzechip met een tikvlak van 44 px hoog, ook al is de chip zelf 36 px (de rij moet 4 px ruimte boven en onder hebben) */
export const PILL_HIT = "relative after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']"

// ---------- Status van een variant ----------

export type RowStatus = 'new' | 'started' | 'learned' | 'mastered' | 'hard'

export interface RowMeta extends VariationMastery {
  hard: boolean
  status: RowStatus
}

const STATUS: Record<RowStatus, { label: string; cls: string }> = {
  mastered: { label: 'Beheerst', cls: 'bg-brand text-on-brand' },
  learned: { label: 'Geleerd', cls: 'bg-brand-soft text-brand-strong' },
  started: { label: 'Bezig', cls: 'bg-accent-soft text-accent-ink' },
  hard: { label: 'Moeilijk', cls: 'bg-danger-soft text-danger-ink' },
  new: { label: 'Nieuw', cls: 'bg-surface-2 text-muted' },
}

/**
 * Status per variant. Moeilijk = vaak fout (gemiddeld een fout per keer of een positie die 2× is vergeten),
 * Beheerst = alle posities rijp, Geleerd = één keer helemaal gespeeld, Bezig = nog niet uitgespeeld maar je kent al
 * zetten ná de beginzetten van de opening (de beginzetten zelf delen alle varianten, die tellen niet mee).
 */
export function rowMetaMap(file: FamilyFile, progress: Map<string, VariationProgress>, cards: Map<string, TrainingCard>): Map<string, RowMeta> {
  const side = file.family.side
  const rootLen = file.family.rootSan.length
  let rootUserPlies = 0
  for (let i = 0; i < rootLen; i++) if (isUserPly(i, side)) rootUserPlies++
  const lapsed = new Set<string>()
  for (const c of cards.values()) if (c.lapses >= 2) for (const id of c.variationIds) lapsed.add(id)
  const m = new Map<string, RowMeta>()
  for (const v of file.variations) {
    const p = progress.get(v.id)
    const vm = variationMastery(v, side, cards, p)
    const hard = (!!p && p.completions > 0 && p.mistakes / p.completions >= 1) || lapsed.has(v.id)
    const started = !vm.learned && userCardIds(v, side).slice(rootUserPlies).some(id => cards.has(id))
    const status: RowStatus = hard ? 'hard' : vm.mastered ? 'mastered' : vm.learned ? 'learned' : started ? 'started' : 'new'
    m.set(v.id, { ...vm, hard, status })
  }
  return m
}

export function StatusBadge({ status, className = '' }: { status: RowStatus; className?: string }) {
  return <span className={`whitespace-nowrap rounded-full px-2.5 py-[3px] text-xs font-bold ${STATUS[status].cls} ${className}`}>{t(STATUS[status].label)}</span>
}

/**
 * Eén variant als regel (10j/10k): bordje, naam, kenmerkende zetten · aandeel en status. Tikken = leren of oefenen.
 * Desktop: extra kolommen met een balk voor het aandeel en de actie.
 */
export function VariationRow({ v, file, status, label, shareSuffix }: { v: Variation; file: FamilyFile; status: RowStatus; label?: string; shareSuffix?: boolean }) {
  const f = file.family
  const share = v.reach !== null ? pct(v.freq, v.freq < 0.01 ? 1 : 0) : null
  const moves = keyMoves(v, f.rootSan.length)
  const learn = status === 'new' || status === 'started'
  return (
    <li>
      <Link
        to={`/train/${f.id}/${v.id}?mode=${learn ? 'learn' : 'practice'}`}
        className="grid min-h-16 grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:-outline-offset-2! lg:grid-cols-[3.5rem_minmax(0,1fr)_10rem_6rem_6rem] lg:gap-4.5 lg:px-4.5 lg:py-3"
      >
        <CropBoard epd={v.epd} uci={v.uci} orientation={f.side} coordsFrom="never" />
        <span className="min-w-0">
          <span className="line-clamp-2 block text-[0.9375rem] font-bold leading-snug sm:truncate lg:text-base">{label ?? shortName(v, f.name)}</span>
          <span className="block text-[0.8125rem] text-muted lg:text-sm">
            {moves}
            {share && <span className="lg:hidden">{moves ? ' · ' : ''}{shareSuffix ? t('{pct} van de partijen', { pct: share }) : share}</span>}
          </span>
        </span>
        <span className="hidden items-center gap-2.5 lg:flex" aria-label={share ? t('{pct} van de partijen', { pct: share }) : t('te zeldzaam voor een percentage')}>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-(--board-dark)" style={{ width: `${Math.min(100, v.freq * 100)}%` }} /></span>
          <span className="w-10 text-right text-sm font-bold tabular-nums">{share ?? '–'}</span>
        </span>
        <StatusBadge status={status} className="justify-self-end lg:justify-self-start" />
        <span className="hidden min-h-10 items-center justify-center rounded-xl border-2 border-line bg-surface text-sm font-bold shadow-[0_2px_0_var(--line)] lg:flex">{learn ? t('Leren') : t('Oefenen')}</span>
      </Link>
    </li>
  )
}

/** Lijstkaart voor variantregels: 2 px rand, scheidingslijnen 2 px */
export const ROW_LIST = 'overflow-hidden rounded-[18px] border-2 border-line bg-surface'
export const ROW_DIVIDE = 'divide-y-2 divide-surface-2 dark:divide-track'

/** De beginzetten als kleine chips; de laatste (kenmerkende) zet in groen */
export function MoveChips({ moves, className = '' }: { moves: string[]; className?: string }) {
  return (
    <ol className={`flex flex-wrap gap-1.5 ${className}`} aria-label={t('Beginzetten')}>
      {moves.map((m, i) => {
        const last = i === moves.length - 1
        return <li key={i} className={`rounded-lg border px-[9px] py-[3px] text-[0.8125rem] font-bold lg:px-2.5 lg:text-base ${last ? 'border-brand bg-brand-soft text-brand-strong' : 'border-line bg-surface-2 text-ink'}`}>{m}</li>
      })}
    </ol>
  )
}

/**
 * Openingskeuze als één tikbare kaart (10k). Tikken klapt een paneel open met alle openingen als chips,
 * je eigen openingen eerst: kiezen in plaats van een uitklaplijst.
 */
export function OpeningSwitcher({ value, families, mine, onChange }: { value?: string; families: FamilySummary[]; mine: string[]; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const btn = useRef<HTMLButtonElement>(null)
  const cur = families.find(f => f.id === value)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  const own = families.filter(f => mine.includes(f.id))
  const groups = [
    { title: t('Mijn openingen'), list: own },
    { title: t('Wit'), list: families.filter(f => f.side === 'white' && !mine.includes(f.id)) },
    { title: t('Zwart'), list: families.filter(f => f.side === 'black' && !mine.includes(f.id)) },
  ].filter(g => g.list.length)
  const choose = (id: string) => { onChange(id); setOpen(false); btn.current?.focus() }
  return (
    <div>
      <button
        ref={btn}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(o => !o)}
        className={`tap flex min-h-16 w-full items-center gap-3 px-3 py-2.5 text-left ${open ? 'tap-on' : ''}`}
      >
        <span className="w-11 shrink-0">{cur && <CropBoard epd={cur.rootEpd} uci={cur.rootUci} orientation={cur.side} coordsFrom="never" />}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-muted">{t('Opening')}<span className="sr-only">: {t('tik om te wisselen')}</span></span>
          <span className="block truncate text-base font-bold">{cur ? `${cur.name} · ${t('{n} varianten', { n: cur.variationCount })}` : t('Kies een opening')}</span>
        </span>
        <ChevronsUpDown size={18} aria-hidden className="shrink-0 text-muted" />
      </button>
      {open && (
        <div id={panelId} className="mt-2 space-y-3 rounded-[18px] border-2 border-line bg-surface p-3 animate-fade-up lg:p-4">
          {groups.map(g => (
            <div key={g.title} role="group" aria-label={g.title}>
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted">{g.title}</h3>
              <div className="mt-2 flex flex-wrap gap-2 py-1">
                {g.list.map(f => {
                  const on = f.id === value
                  return (
                    <button key={f.id} type="button" aria-pressed={on} onClick={() => choose(f.id)} className={`pill ${on ? 'pill-on' : ''} ${PILL_HIT}`}>
                      {on && <Check size={14} strokeWidth={3} aria-hidden />}
                      {f.name}
                      <span className="text-xs font-semibold text-muted">{f.variationCount}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
