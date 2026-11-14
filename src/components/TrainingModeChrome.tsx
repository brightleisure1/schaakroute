import { useEffect, useId, useRef, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { SlidersHorizontal, X } from 'lucide-react'

/**
 * Bouwstenen voor de trainingsmodus van ontwerpronde 10 (Afstraffen, Op jouw niveau):
 * een bovenbalk met alleen sluiten, een dikke voortgangsbalk en een teller; een kop met een
 * gekleurd label per trainingssoort; één vierkante filterknop; en een filterpaneel als dialoog.
 */

/** Sluiten: terug naar waar je vandaan kwam, of naar Vandaag als je hier direct binnenkwam */
export function useCloseTraining() {
  const nav = useNavigate()
  return () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) nav(-1)
    else nav('/')
  }
}

/** Dikke voortgangsbalk (14px) met een lichte glans, zoals in het ontwerp */
export function ThickProgress({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div className="h-3.5 w-full overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="relative h-full min-w-3.5 rounded-full bg-brand transition-[width] duration-500" style={{ width: `${pct}%`, opacity: pct ? 1 : 0 }}>
        <span className="absolute inset-x-1.5 top-0.5 h-[3px] rounded-full bg-white/30" aria-hidden />
      </div>
    </div>
  )
}

/** Bovenbalk in de trainingsmodus: sluiten, voortgang, teller. Blijft op de telefoon bovenin staan. */
export function TrainingTopBar({ value, count, countLabel, onClose, closeLabel = 'Sluiten' }: { value?: number; count?: string; countLabel?: string; onClose: () => void; closeLabel?: string }) {
  return (
    <div className="sticky top-0 z-20 -mx-4 flex items-center gap-3 bg-bg/95 px-4 py-1.5 backdrop-blur sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:backdrop-blur-none">
      <button type="button" className="-ml-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-ink" onClick={onClose} aria-label={closeLabel} title={closeLabel}>
        <X size={22} aria-hidden />
      </button>
      <div className="min-w-0 flex-1">{value !== undefined && <ThickProgress value={value} label={countLabel ?? 'Voortgang'} />}</div>
      {count && <span className="shrink-0 text-sm font-bold tabular-nums text-muted" aria-label={countLabel}>{count}</span>}
    </div>
  )
}

/** Kop van een trainingsscherm: klein label in de kleur van de trainingssoort, titel en eventueel één knop rechts */
export function TrainingHeading({ label, title, tone, action, sub }: { label: ReactNode; title: ReactNode; tone: 'danger' | 'info'; action?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <div className={`truncate text-xs font-bold uppercase tracking-[0.04em] ${tone === 'danger' ? 'text-danger-ink' : 'text-info-ink'}`}>{label}</div>
        <h1 className="mt-0.5 text-xl font-extrabold leading-tight tracking-tight lg:text-2xl">{title}</h1>
        {sub && <div className="mt-0.5 truncate text-sm text-muted">{sub}</div>}
      </div>
      {action}
    </div>
  )
}

/** Vierkante filterknop (44px) die het filterpaneel opent; een stip als er iets anders dan standaard is gekozen */
export function FilterKey({ onClick, expanded, active, label = 'Filters' }: { onClick: () => void; expanded: boolean; active?: boolean; label?: string }) {
  return (
    <button type="button" className="tap relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]!" onClick={onClick} aria-haspopup="dialog" aria-expanded={expanded} aria-label={active ? `${label} (aangepast)` : label} title={label}>
      <SlidersHorizontal size={18} aria-hidden />
      {active && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-bg bg-brand" aria-hidden />}
    </button>
  )
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Paneel als modale dialoog: op de telefoon schuift het van onderen in, op een groot scherm staat het in het midden.
 * Escape en de achtergrond sluiten; de focus blijft in het paneel en gaat daarna terug naar de knop.
 */
export function TrainingSheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const el = panel.current
    const items = () => (el ? [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(n => n.getClientRects().length > 0 || n.matches('input')) : [])
    ;(items()[0] ?? el)?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close.current(); return }
      if (e.key !== 'Tab' || !el) return
      const list = items()
      if (!list.length) return
      const first = list[0], last = list[list.length - 1]
      if (e.shiftKey && (document.activeElement === first || !el.contains(document.activeElement))) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && (document.activeElement === last || !el.contains(document.activeElement))) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      prev?.focus?.()
    }
  }, [open])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center lg:p-6" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="absolute inset-0 bg-black/40 animate-fade-in" aria-hidden onClick={() => close.current()} />
      <div ref={panel} tabIndex={-1} className="safe-bottom relative flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-3xl bg-surface shadow-2xl outline-none animate-fade-up lg:rounded-3xl">
        <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-line lg:hidden" aria-hidden />
        <div className="flex shrink-0 items-center justify-between px-4 pt-2 lg:px-6 lg:pt-5">
          <h2 id={titleId} className="text-lg font-bold">{title}</h2>
          <button type="button" className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink" onClick={() => close.current()} aria-label="Sluiten">
            <X size={22} aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-4 pt-2 lg:px-6">{children}</div>
        {footer && <div className="shrink-0 border-t border-line px-4 pb-4 pt-3 lg:px-6 lg:pb-6">{footer}</div>}
      </div>
    </div>
  )
}

/** Keuze uit een paar opties als grote pillen (echte radioknoppen, dus pijltjestoetsen werken) */
export function PillChoice<T extends string | number>({ legend, value, onChange, options, hint }: { legend: string; value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; hint?: ReactNode }) {
  const name = useId()
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(o => {
          const on = o.value === value
          return (
            <label key={String(o.value)} className={`pill min-h-11! cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand ${on ? 'pill-on' : ''}`}>
              <input type="radio" className="sr-only" name={name} checked={on} onChange={() => onChange(o.value)} />
              {o.label}
            </label>
          )
        })}
      </div>
      {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}
    </fieldset>
  )
}

/** Vaste onderbalk met de hoofdactie (telefoon); op een groot scherm gewoon onder de inhoud */
export function BottomAction({ children, tone }: { children: ReactNode; tone?: 'good' | 'bad' }) {
  const toneCls = tone === 'good' ? 'max-lg:bg-brand-soft max-lg:border-brand lg:bg-brand-soft lg:border-brand' : tone === 'bad' ? 'max-lg:bg-danger-soft max-lg:border-danger lg:bg-danger-soft lg:border-danger' : 'max-lg:bg-bg max-lg:border-line lg:border-transparent'
  return (
    <div className={`sticky bottom-0 z-10 -mx-4 flex flex-col gap-2.5 border-t-2 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3.5 sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:rounded-2xl lg:border-2 lg:p-4 ${toneCls} ${tone ? '' : 'lg:p-0'}`}>
      {children}
    </div>
  )
}
