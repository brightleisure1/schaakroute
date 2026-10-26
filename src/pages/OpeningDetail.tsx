import { Link, useParams } from 'react-router'
import { ArrowRight, ChevronDown, Lightbulb, Play, Swords, TrendingUp } from 'lucide-react'
import { familyProgress, useCardMap, useFamily, useProgressMap, variationMastery } from '../lib/hooks'
import { moveNumberLabel } from '../lib/chess'
import { learnLessons, learnThreshold, userMoveCount } from '../lib/course'
import { CropBoard } from '../components/CropBoard'
import { ErrorBox, ProgressBar, Spinner, pct } from '../components/ui'
import { OPENING_INFO } from '../content/openingInfo'
import type { Variation } from '../lib/types'

// Opening details (ontwerp 7a/7b): één boodschap per blok. Wat is de opening, wat is het idee, wat moet je
// weten en welke varianten leer je eerst. De volledige lijst met zoeken en filters staat achter één link.

/** "5…a6" of "3…Bc5 4.d3": de laatste (kenmerkende) zetten van een variant, niet vóór de beginzetten */
function keyMoves(v: Variation, rootLen: number, max = 2) {
  const from = Math.max(rootLen, v.san.length - max)
  return v.san.slice(from).map((m, i) => {
    const ply = from + i
    return ply % 2 === 0 ? `${moveNumberLabel(ply)}${m}` : i === 0 ? `${moveNumberLabel(ply).replace('...', '…')}${m}` : m
  }).join(' ')
}

/** Laatste deel van de naam; algemene namen ("Main Line", "Normal") krijgen de bovenliggende variant erbij */
function shortName(v: Variation) {
  const last = v.path[v.path.length - 1]
  return v.path.length > 1 && /^(main line|normal( variation)?|main variation)$/i.test(last) ? `${v.path[v.path.length - 2]}: ${last}` : last
}

const STATUS = {
  learned: { label: 'Geleerd', cls: 'bg-brand-soft text-brand-strong' },
  hard: { label: 'Moeilijk', cls: 'bg-danger-soft text-danger-ink' },
  new: { label: 'Nieuw', cls: 'bg-surface-2 text-muted' },
} as const

export function OpeningDetail() {
  const { id } = useParams()
  const { data: file, error, loading } = useFamily(id)
  const progress = useProgressMap(id)
  const cards = useCardMap(id)
  if (error) return <ErrorBox error={error} />
  if (loading || !file) return <Spinner />
  const f = file.family
  const info = OPENING_INFO[f.id]
  const p = familyProgress(file, progress, cards)
  const sideNl = f.side === 'white' ? 'wit' : 'zwart'

  // Volgende les van het leerpad: de eerste met een variant die nog niet is afgerond
  const lessons = learnLessons(file)
  const levels = [...new Set(lessons.map(l => l.level))].sort((a, b) => a - b)
  const nextLesson = lessons.find(l => l.variationIds.some(vid => !progress.get(vid)?.completions))
  const courseLabel = p.learned === 0 ? 'Start de Course' : nextLesson ? `Verder met de Course · niveau ${levels.indexOf(nextLesson.level) + 1}` : 'Course herhalen'
  const courseTo = nextLesson ? `/les/${f.id}/${nextLesson.id}` : `/cursus/${f.id}`

  // De vijf meest gespeelde varianten om mee te beginnen (geen basislijnen, wel lang genoeg om te leren)
  const min = learnThreshold(file)
  const seen = new Set<string>()
  const top = [...file.variations]
    .filter(v => v.path.length > 0 && v.freq > 0 && userMoveCount(v, f.side) >= min)
    .sort((a, b) => b.freq - a.freq)
    .filter(v => { const k = v.path.join('>'); if (seen.has(k)) return false; seen.add(k); return true })
    .slice(0, 5)
    .map(v => {
      const pr = progress.get(v.id)
      const m = variationMastery(v, f.side, cards, pr)
      const hard = !!pr && pr.completions > 0 && pr.mistakes / pr.completions >= 1
      const status = hard ? 'hard' : m.learned ? 'learned' : 'new'
      return { v, status, name: shortName(v), moves: keyMoves(v, f.rootSan.length), share: pct(v.freq, v.freq < 0.01 ? 1 : 0) } as const
    })

  const rootMoves = f.rootSan.map((m, i) => (i % 2 === 0 ? `${moveNumberLabel(i)}${m}` : m))

  return (
    <div className="space-y-6 lg:space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-x-5 gap-y-3">
        <div>
          <Link to="/openingen" className="inline-flex min-h-11 items-center text-sm text-muted hover:text-ink">← Openingen</Link>
          <h1 className="text-3xl font-extrabold leading-none tracking-tight lg:text-[2.5rem]">{f.name}</h1>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {[info?.nameNl, `Met ${sideNl}`, `#${f.rank} populairst voor ${sideNl}`].filter(Boolean).map(t => <span key={t} className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-sm font-semibold">{t}</span>)}
          </div>
        </div>
        <div className="w-full sm:w-64">
          <div className="flex justify-between text-sm text-muted"><span><b className="text-ink">{p.learned}</b> van {p.total} varianten geleerd</span><span>{Math.round(p.pct * 100)}%</span></div>
          <ProgressBar value={p.pct} className="mt-1.5" label="Varianten geleerd" />
        </div>
      </header>

      <section className="card p-4 sm:p-5 lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:items-center lg:gap-9 lg:p-7">
        <div className="flex items-center gap-3.5 lg:block">
          <div className="w-32 shrink-0 overflow-hidden rounded-xl shadow-[0_6px_22px_rgb(30_40_30/0.12)] lg:w-full"><CropBoard epd={f.rootEpd} uci={f.rootUci} orientation={f.side} inset={5} /></div>
          <ol className="flex flex-wrap gap-1 lg:hidden" aria-label="Beginzetten">
            {rootMoves.map((m, i) => <MoveChip key={i} m={m} last={i === rootMoves.length - 1} />)}
          </ol>
        </div>
        <div className="mt-4 flex flex-col lg:mt-0">
          <ol className="hidden flex-wrap gap-1.5 lg:flex" aria-label="Beginzetten">
            {rootMoves.map((m, i) => <MoveChip key={i} m={m} last={i === rootMoves.length - 1} />)}
          </ol>
          {info && <>
            <h2 className="text-xs font-bold uppercase tracking-wide text-muted lg:mt-5 lg:text-sm">Het idee</h2>
            <p className="mt-1 max-w-[600px] text-[1.0625rem] font-medium leading-relaxed lg:mt-1.5 lg:text-xl">{info.idea}</p>
          </>}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:mt-6 lg:gap-2.5">
            <Link to={courseTo} className="btn btn-primary min-h-13 px-5 text-base"><Play size={20} aria-hidden />{courseLabel}</Link>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Link to={`/crushing/${f.id}`} className="btn btn-ghost min-h-11 sm:min-h-13"><Swords size={16} aria-hidden />Crushing</Link>
              <Link to={`/advantage/${f.id}`} className="btn btn-ghost min-h-11 sm:min-h-13"><TrendingUp size={16} aria-hidden />Advantage</Link>
            </div>
          </div>
        </div>
      </section>

      {info && (
        <section aria-labelledby="weten-title">
          <h2 id="weten-title" className="mb-3 text-lg font-bold lg:text-xl">Wat je moet weten</h2>
          <div className="grid gap-2.5 lg:grid-cols-3 lg:gap-3.5">
            <div className="card p-4 lg:p-5">
              <h3 className="font-bold">Typische plannen</h3>
              <ul className="mt-2.5 space-y-2.5 text-sm leading-relaxed">
                {info.plans.map(t => <li key={t} className="flex gap-2.5"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden />{t}</li>)}
              </ul>
            </div>
            <div className="card hidden p-5 lg:block">
              <h3 className="font-bold">Sterk en zwak</h3>
              <ProsCons strengths={info.strengths} weaknesses={info.weaknesses} />
            </div>
            <div className="rounded-2xl bg-accent-soft p-4 lg:p-5">
              <h3 className="flex items-center gap-2 font-bold text-accent-ink"><Lightbulb size={16} aria-hidden />Tip</h3>
              <p className="mt-2 text-sm leading-relaxed">{info.tip}</p>
            </div>
            {/* Telefoon: sterk en zwak ingeklapt, zodat de varianten sneller in beeld komen */}
            <details className="card group p-4 lg:hidden">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between font-bold">Sterk en zwak<ChevronDown size={18} aria-hidden className="text-muted transition group-open:rotate-180" /></summary>
              <ProsCons strengths={info.strengths} weaknesses={info.weaknesses} />
            </details>
          </div>
        </section>
      )}

      <section aria-labelledby="eerst-title">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3">
          <h2 id="eerst-title" className="text-lg font-bold lg:text-xl">Leer deze varianten eerst</h2>
          <span className="text-sm text-muted">de {top.length} meest gespeelde</span>
        </div>
        <div className="card overflow-hidden">
          <ul className="divide-y divide-line">
            {top.map(({ v, status, name, moves, share }) => (
              <li key={v.id}>
                <Link to={`/train/${f.id}/${v.id}?mode=${status === 'new' ? 'learn' : 'practice'}`} className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-2.5 hover:bg-surface-2 lg:grid-cols-[3.5rem_minmax(0,1fr)_10rem_6rem_6rem] lg:gap-4.5 lg:px-4.5 lg:py-3">
                  <CropBoard epd={v.epd} uci={v.uci} orientation={f.side} coordsFrom="never" />
                  <span className="min-w-0">
                    <span className="line-clamp-2 block font-bold leading-snug lg:truncate lg:text-base">{name}</span>
                    <span className="block text-sm text-muted">{moves}<span className="lg:hidden"> · {share}</span></span>
                  </span>
                  <span className="hidden items-center gap-2.5 lg:flex" aria-label={`${share} van de partijen`}>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-(--board-dark)" style={{ width: `${Math.min(100, v.freq * 100)}%` }} /></span>
                    <span className="w-10 text-right text-sm font-bold tabular-nums">{share}</span>
                  </span>
                  <span className={`justify-self-start rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS[status].cls}`}>{STATUS[status].label}</span>
                  <span className="hidden min-h-10 items-center justify-center rounded-xl border border-line bg-surface-2 text-sm font-semibold lg:flex">{status === 'new' ? 'Leren' : 'Oefenen'}</span>
                </Link>
              </li>
            ))}
          </ul>
          <Link to={`/variaties?opening=${f.id}`} className="flex min-h-12 items-center justify-center gap-2 border-t border-line p-4 text-sm font-semibold text-brand-strong hover:bg-surface-2 lg:text-base">
            Alle {f.variationCount} varianten bekijken, zoeken en filteren<ArrowRight size={16} aria-hidden />
          </Link>
        </div>
      </section>
    </div>
  )
}

function MoveChip({ m, last }: { m: string; last: boolean }) {
  return <li className={`rounded-lg border px-2 py-1 text-sm font-bold lg:px-2.5 lg:text-base ${last ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line bg-surface-2'}`}>{m}</li>
}

function ProsCons({ strengths, weaknesses }: { strengths: string[]; weaknesses: string[] }) {
  return (
    <ul className="mt-2.5 space-y-2.5 text-sm leading-relaxed">
      {strengths.map(t => <li key={t} className="flex gap-2.5"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-brand-soft font-extrabold text-brand-strong" aria-label="Sterk">+</span>{t}</li>)}
      {weaknesses.map(t => <li key={t} className="flex gap-2.5"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-danger-soft font-extrabold text-danger-ink" aria-label="Zwak">−</span>{t}</li>)}
    </ul>
  )
}
