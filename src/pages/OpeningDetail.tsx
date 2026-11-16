import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeft, ArrowRight, Compass, Lightbulb, Play, Route, Scale, Swords, TrendingUp } from 'lucide-react'
import { familyProgress, useCardMap, useFamily, useProgressMap } from '../lib/hooks'
import { moveNumberLabel } from '../lib/chess'
import { learnLessons, learnThreshold, userMoveCount } from '../lib/course'
import { CropBoard } from '../components/CropBoard'
import { MoveChips, ROW_DIVIDE, ROW_LIST, ThickBar, VariationRow, rowMetaMap } from '../components/OpeningScreens'
import { ErrorBox, ProgressBar, Spinner, plural } from '../components/ui'
import { OPENING_INFO } from '../content/openingInfo'

// Opening (ontwerp 10j): één kaart met bord, beginzetten, het idee en de ene grote knop (verder met de cursus).
// Daaronder de twee andere trainingen als tegels en de varianten om mee te beginnen. De achtergrond
// (plannen, sterk en zwak, tip) staat lager op de pagina; de volledige lijst achter één link.

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
  const lessonsDone = lessons.filter(l => l.variationIds.every(vid => progress.get(vid)?.completions)).length
  const courseLabel = p.learned === 0 ? 'Start de cursus' : nextLesson ? `Verder met de cursus · niveau ${levels.indexOf(nextLesson.level) + 1}` : 'Cursus herhalen'
  const courseTo = nextLesson ? `/les/${f.id}/${nextLesson.id}` : `/cursus/${f.id}`

  // De vijf meest gespeelde varianten om mee te beginnen (geen basislijnen, wel lang genoeg om te leren)
  const meta = rowMetaMap(file, progress, cards)
  const min = learnThreshold(file)
  const seen = new Set<string>()
  const top = [...file.variations]
    .filter(v => v.path.length > 0 && v.freq > 0 && userMoveCount(v, f.side) >= min)
    .sort((a, b) => b.freq - a.freq)
    .filter(v => { const k = v.path.join('>'); if (seen.has(k)) return false; seen.add(k); return true })
    .slice(0, 5)

  const rootMoves = f.rootSan.map((m, i) => (i % 2 === 0 ? `${moveNumberLabel(i)}${m}` : m))
  const caption = `Met ${sideNl} · ${f.curated ? 'extra opening' : `#${f.rank} populairst`}`

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <header>
        <Link to="/openingen" className="-ml-1 inline-flex min-h-11 items-center gap-1 px-1 text-sm text-muted hover:text-ink"><ArrowLeft size={14} aria-hidden />Openingen</Link>
        <h1 className="text-[1.75rem] font-extrabold leading-[1.12] tracking-[-0.03em] lg:text-[2.5rem]">{f.name}</h1>
        {info?.nameNl && <p className="mt-0.5 text-sm text-muted">{info.nameNl} · {f.ecoRange}</p>}
        <div className="mt-2.5 flex items-center gap-2.5 lg:max-w-md">
          <ThickBar value={p.pct} size="lg" label="Varianten geleerd" className="flex-1" />
          <span className="shrink-0 text-[0.8125rem] text-muted tabular-nums"><b className="text-ink">{p.learned}</b> van {p.total}<span className="sr-only"> varianten geleerd</span>{p.mastered > 0 && <span className="hidden sm:inline"> · {p.mastered} beheerst</span>}</span>
        </div>
      </header>

      <section aria-label="Over deze opening" className="rounded-[22px] border-2 border-line bg-surface p-4 lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:items-center lg:gap-8 lg:p-6">
        <div className="flex items-center gap-3.5 lg:block">
          <div className="w-[120px] shrink-0 lg:w-full"><CropBoard epd={f.rootEpd} uci={f.rootUci} orientation={f.side} /></div>
          <div className="min-w-0 lg:hidden">
            <p className="text-xs font-bold uppercase tracking-[0.04em] text-muted">{caption}</p>
            <MoveChips moves={rootMoves} className="mt-2" />
          </div>
        </div>
        <div className="mt-3.5 flex flex-col gap-3.5 lg:mt-0 lg:gap-4">
          <div className="hidden lg:block">
            <p className="text-sm font-bold uppercase tracking-[0.04em] text-muted">{caption}</p>
            <MoveChips moves={rootMoves} className="mt-2" />
          </div>
          {info && <p className="max-w-[600px] text-base font-medium leading-[1.45] lg:text-xl lg:leading-relaxed">{info.idea}</p>}
          <Link to={courseTo} className="btn btn-primary w-full gap-2.5! lg:w-auto lg:self-start lg:px-7!"><Play size={20} aria-hidden />{courseLabel}</Link>
        </div>
      </section>

      {/* Het leerpad als kaart met voortgang (ontwerp 16f), niet meer als losse link */}
      {lessons.length > 0 && (
        <Link to={`/cursus/${f.id}`} className="tap flex items-center gap-3 p-3.5 lg:max-w-2xl" aria-label={`Leerpad, ${plural(lessons.length, 'les', 'lessen')}: ${lessonsDone} gedaan${nextLesson ? `, volgende: ${nextLesson.title}` : ''}`}>
          <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink"><Route size={20} /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold leading-tight">Leerpad · {plural(lessons.length, 'les', 'lessen')}</span>
            <ProgressBar value={lessonsDone / lessons.length} tone="accent" className="mt-1.5 h-1.5!" />
            <span className="mt-1 block truncate text-xs text-muted">{lessonsDone} gedaan · {nextLesson ? `volgende: ${nextLesson.title}` : 'alles gedaan'}</span>
          </span>
          <ArrowRight size={18} aria-hidden className="shrink-0 text-muted" />
        </Link>
      )}

      <div className="grid grid-cols-2 gap-2.5 lg:max-w-2xl lg:gap-3">
        <TrainTile to={`/crushing/${f.id}`} title="Afstraffen" text="Straf fouten van je tegenstander af" tone="danger" icon={<Swords size={20} aria-hidden />} />
        <TrainTile to={`/advantage/${f.id}`} title="Op jouw niveau" text="Oefen wat er op jouw niveau gespeeld wordt" tone="info" icon={<TrendingUp size={20} aria-hidden />} />
      </div>

      <section aria-labelledby="eerst-title" className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h2 id="eerst-title" className="text-lg font-bold tracking-[-0.01em] lg:text-xl">Leer deze varianten eerst</h2>
          <span className="text-sm text-muted">de {top.length} meest gespeelde</span>
        </div>
        <div className={ROW_LIST}>
          <ul className={ROW_DIVIDE}>
            {top.map((v, i) => <VariationRow key={v.id} v={v} file={file} status={meta.get(v.id)!.status} shareSuffix={i === 0} />)}
          </ul>
          <Link to={`/variaties?opening=${f.id}`} className="flex min-h-12 items-center justify-center gap-2 border-t-2 border-surface-2 p-4 text-sm font-semibold text-brand-strong hover:bg-surface-2 focus-visible:-outline-offset-2! lg:text-base">
            Alle {f.variationCount} varianten bekijken, zoeken en filteren<ArrowRight size={16} aria-hidden />
          </Link>
        </div>
      </section>

      {/* Ontwerp 12i: dezelfde kaarten met een icoontegel; plannen genummerd, sterk en zwak altijd zichtbaar,
          en onderaan nog eens de hoofdknop zodat je na het lezen meteen kunt beginnen */}
      {info && (
        <section aria-labelledby="weten-title" className="flex flex-col gap-3.5">
          <h2 id="weten-title" className="text-lg font-bold tracking-[-0.01em] lg:text-xl">Wat je moet weten</h2>
          <div className="grid gap-3.5 lg:grid-cols-3">
            <div className="card flex flex-col gap-2.5 p-4 lg:p-5">
              <h3 className="flex items-center gap-2.5 font-bold"><span aria-hidden className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-brand-soft text-brand-strong"><Compass size={17} /></span>Typische plannen</h3>
              <ol className="space-y-2 text-sm leading-snug">
                {info.plans.map((t, i) => <li key={t} className="flex gap-2.5"><span aria-hidden className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-extrabold text-brand-strong">{i + 1}</span><span className="pt-px">{t}</span></li>)}
              </ol>
            </div>
            <div className="flex items-start gap-3 rounded-[18px] border-2 border-accent/35 bg-accent-soft p-4 lg:p-5">
              <span aria-hidden className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-surface text-accent-ink"><Lightbulb size={17} /></span>
              <div className="min-w-0">
                <h3 className="font-bold text-accent-ink">Tip</h3>
                <p className="mt-0.5 text-sm leading-[1.45]">{info.tip}</p>
              </div>
            </div>
            <div className="card flex flex-col gap-2.5 p-4 lg:p-5">
              <h3 className="flex items-center gap-2.5 font-bold"><span aria-hidden className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-info-soft text-info-ink"><Scale size={17} /></span>Sterk en zwak</h3>
              <ProsCons strengths={info.strengths} weaknesses={info.weaknesses} />
            </div>
          </div>
          <Link to={courseTo} className="btn btn-primary w-full gap-2.5! lg:w-auto lg:self-start lg:px-7!"><Play size={20} aria-hidden />{courseLabel}</Link>
        </section>
      )}
    </div>
  )
}

const TONE = {
  danger: 'bg-danger-soft text-danger-ink',
  info: 'bg-info-soft text-info-ink',
}

function TrainTile({ to, title, text, tone, icon }: { to: string; title: string; text: string; tone: keyof typeof TONE; icon: ReactNode }) {
  return (
    <Link to={to} className="tap flex min-h-16 items-center gap-2.5 rounded-2xl! p-3 hover:border-brand! lg:p-4">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${TONE[tone]}`}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-bold leading-tight lg:text-base">{title}</span>
        <span className="hidden text-xs text-muted lg:block">{text}</span>
      </span>
    </Link>
  )
}

function ProsCons({ strengths, weaknesses }: { strengths: string[]; weaknesses: string[] }) {
  return (
    <ul className="space-y-2 text-sm leading-snug">
      {strengths.map(t => <li key={t} className="flex gap-2.5"><span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] bg-brand-soft text-[15px] font-extrabold text-brand-strong" role="img" aria-label="Sterk">+</span><span className="pt-px">{t}</span></li>)}
      {weaknesses.map(t => <li key={t} className="flex gap-2.5"><span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] bg-danger-soft text-[15px] font-extrabold text-danger-ink" role="img" aria-label="Zwak">−</span><span className="pt-px">{t}</span></li>)}
    </ul>
  )
}
