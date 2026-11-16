import { Link } from 'react-router'
import { ArrowRight, BookMarked, Brain, Flame, Plus, Sun, Swords, TrendingUp, GitBranch } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, today } from '../lib/db'
import { familyProgress, useCardMap, useFamilies, useProgressMap } from '../lib/hooks'
import { streak, totalXp } from '../lib/progress'
import { stageOf } from '../lib/srs'
import { fenFromEpd, moveNumberLabel } from '../lib/chess'
import { courseOrder } from '../lib/daily'
import { displayName } from '../lib/data'
import { MiniBoard } from '../components/Board'
import { CropBoard } from '../components/CropBoard'
import { ProgressBar, Spinner, useSettings, sideLabel, plural } from '../components/ui'
import { OPENING_INFO } from '../content/openingInfo'
import type { FamilyFile, Variation } from '../lib/types'

export function Dashboard() {
  const settings = useSettings()
  const families = useFamilies(settings?.openings ?? [])
  const progress = useProgressMap()
  const cards = useCardMap()
  const xp = useLiveQuery(() => totalXp(), [], 0)
  const st = useLiveQuery(() => streak(), [], { current: 0, best: 0 })
  const todayAct = useLiveQuery(() => db.daily.get(today()), [])
  // Nieuwe gebruiker (ontwerp 16a): nog niets getraind, dus geen XP, geen dagen, geen posities en geen varianten
  const firstTime = useLiveQuery(async () => {
    const [x, days, cardCount, progressCount] = await Promise.all([totalXp(), db.daily.count(), db.cards.count(), db.progress.count()])
    return x === 0 && days === 0 && cardCount === 0 && progressCount === 0
  }, [])
  const now = Date.now()

  if (!settings || firstTime === undefined) return <Spinner />
  const cardList = [...cards.values()]
  const due = cardList.filter(c => !c.suspended && c.dueAt <= now).length
  const learnedPositions = cardList.filter(c => c.correct > 0).length
  const mature = cardList.filter(c => stageOf(c) === 'mature').length
  const fams = families.data ?? []
  const famStats = fams.map(f => ({ f, p: familyProgress(f, progress, cards) }))
  const minutesToday = Math.min(settings.dailyMinutes, Math.round((todayAct?.seconds ?? 0) / 60))

  // Het bord in de hero toont de variant die je als volgende leert
  const heroFile = fams[0]
  const order = heroFile ? courseOrder(heroFile) : []
  const heroVar = order.find(v => !progress.get(v.id)?.completions) ?? order[0]

  return (
    <div className="space-y-6 lg:space-y-7">
      {xp > 0 && (
        <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted" aria-label="Jouw voortgang">
          <TopStat icon={<Flame size={15} />} tone="text-star" label="Reeks" value={plural(st.current, 'dag', 'dagen')} hint={`record ${st.best}`} />
          <TopStat icon={<Brain size={15} />} tone="text-brand-strong" label="Geleerde posities" value={learnedPositions} hint={`${mature} al 7+ dagen vast`} />
        </div>
      )}

      {firstTime ? (
        <FirstTraining minutes={settings.dailyMinutes} file={heroFile} variation={heroVar} />
      ) : (
      <section className="card grid grid-cols-[minmax(0,1fr)] gap-y-5 p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_296px] lg:items-center lg:gap-x-12 lg:p-10">
        {/* Telefoon: tekst, bord, knoppen onder elkaar. Desktop: tekst en knoppen links, bord rechts */}
        <div className="contents lg:flex lg:flex-col lg:gap-7">
        <div>
          <DaySegments minutes={minutesToday} goal={settings.dailyMinutes} />
          <h1 className="mt-3 text-4xl font-extrabold leading-none tracking-tight lg:mt-4 lg:text-5xl">{greeting()}</h1>
          <p className="mt-2 text-base text-muted lg:mt-3 lg:text-lg">
            {todayAct?.dailyCompleted ? 'Dagdoel gehaald. Mooi werk.' : xp === 0 ? 'De dagtraining kiest je eerste variant.' : due > 0 ? `${plural(due, 'positie', 'posities')} om te herhalen.` : 'Tijd voor nieuwe zetten.'}
          </p>
        </div>
        <div className="order-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-3 lg:order-none">
          <Link to="/dagelijks" className="btn btn-primary min-h-13 px-6 text-base"><Sun size={20} aria-hidden />Start de dagtraining</Link>
          {settings.lastRoute && (
            <Link to={settings.lastRoute} className="btn btn-ghost min-h-13 min-w-0 justify-between gap-4 text-left sm:max-w-xs">
              <span className="min-w-0"><span className="block text-xs font-normal text-muted">Ga verder waar je was</span><span className="block truncate">{settings.lastRouteLabel && settings.lastRouteLabel !== 'SchaakRoute' ? settings.lastRouteLabel : 'Laatste training'}</span></span>
              <ArrowRight size={18} aria-hidden className="shrink-0" />
            </Link>
          )}
        </div>
        </div>
        {heroFile && heroVar && (
          <Link to={`/train/${heroFile.family.id}/${heroVar.id}?mode=learn`} className="group order-2 block lg:order-none" aria-label={`Leer ${displayName(heroVar, heroFile.family.name)}`}>
            <div className="rounded-xl shadow-[0_6px_22px_rgb(30_40_30/0.14)] transition group-hover:shadow-[0_8px_28px_rgb(30_40_30/0.2)]">
              <MiniBoard id="dash-hero" fen={fenFromEpd(heroVar.epd)} orientation={heroFile.family.side} />
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-3 text-sm text-muted">
              <span className="min-w-0 truncate">{displayName(heroVar, heroFile.family.name)}</span>
              {heroVar.san.length > 0 && <span className="shrink-0 font-semibold text-ink">{moveNumberLabel(heroVar.san.length - 1)}{heroVar.san[heroVar.san.length - 1]}</span>}
            </div>
          </Link>
        )}
      </section>
      )}

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-bold lg:text-xl">Mijn openingen</h2>
          <Link to="/welkom" className="inline-flex min-h-11 items-center text-sm text-muted underline">aanpassen</Link>
        </div>
        {families.loading ? <Spinner /> : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {famStats.map(({ f, p }) => (
              <Link key={f.family.id} to={`/opening/${f.family.id}`} className="tap flex flex-col p-2.5 sm:p-3">
                <CropBoard epd={f.family.rootEpd} uci={f.family.rootUci} orientation={f.family.side} inset={4} />
                <div className="px-0.5 pt-2.5">
                  <div className="text-xs font-semibold text-muted">{sideLabel(f.family.side)} · {f.family.ecoRange}</div>
                  <div className="truncate font-bold sm:text-base">{f.family.name}</div>
                  <div className="hidden text-xs text-muted sm:block">{OPENING_INFO[f.family.id]?.nameNl}</div>
                  <ProgressBar className="mt-2" value={p.pct} />
                  <div className="mt-1 text-xs text-muted">{p.learned}/{p.total} varianten</div>
                </div>
              </Link>
            ))}
            <Link to="/openingen" className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line p-3 text-center text-sm font-semibold text-muted transition hover:border-brand hover:text-ink"><Plus size={20} aria-hidden />Alle openingen bekijken</Link>
          </div>
        )}
      </section>

      <section aria-labelledby="meer-title">
        <h2 id="meer-title" className="mb-3 text-lg font-bold lg:text-xl">Meer trainen</h2>
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
          <QuickLink to="/variaties" icon={<GitBranch size={20} />} title="Varianten" text="Alle varianten oefenen" />
          <QuickLink to="/crushing" icon={<Swords size={20} />} title="Afstraffen" text="Fouten afstraffen" />
          <QuickLink to="/advantage" icon={<TrendingUp size={20} />} title="Op jouw niveau" text="Wat scoort het best" />
          <QuickLink to="/repertoire" icon={<BookMarked size={20} />} title="Repertoire" text="Je eigen openingen" />
        </div>
      </section>
    </div>
  )
}

/** Eerste keer (ontwerp 16a): uitnodiging voor de eerste training, de variant die je gaat leren en hoe het werkt */
function FirstTraining({ minutes, file, variation }: { minutes: number; file?: FamilyFile; variation?: Variation }) {
  return (
    <>
      <section className="card flex flex-col gap-4 p-5 sm:p-8 lg:p-10" aria-labelledby="eerste-training-title">
        <div>
          <h1 id="eerste-training-title" className="text-[1.75rem] font-extrabold leading-[1.12] tracking-[-0.02em] lg:text-4xl">Klaar voor je eerste training?</h1>
          <p className="mt-1.5 text-base text-muted lg:text-lg">Die duurt {minutes} minuten. Daarna ken je je eerste variant.</p>
        </div>
        {file && variation && (
          <div className="flex items-center gap-3.5 rounded-[14px] border-2 border-line bg-bg p-3 lg:max-w-xl">
            <div className="w-[104px] shrink-0 sm:w-28"><CropBoard epd={file.family.rootEpd} uci={file.family.rootUci} orientation={file.family.side} inset={4} coordsFrom="never" /></div>
            <div className="min-w-0">
              <span className="inline-block rounded-md bg-accent-soft px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] text-accent-ink">Je eerste variant</span>
              <div className="mt-1 text-lg font-bold leading-tight" title={displayName(variation, file.family.name)}>{variation.path[0] ?? displayName(variation, file.family.name)}</div>
              <div className="mt-0.5 text-sm text-muted">{file.family.name} · met {file.family.side === 'white' ? 'wit' : 'zwart'}</div>
            </div>
          </div>
        )}
        <Link to="/dagelijks" className="btn btn-primary w-full gap-2.5! lg:w-auto lg:self-start lg:px-8!"><Sun size={20} aria-hidden />Start je eerste training</Link>
      </section>

      <section className="card p-4 sm:p-5" aria-label="Zo werkt het">
        <ol className="grid grid-cols-3 gap-2 text-center">
          {[
            { title: 'Leer', text: 'Speel de variant na met pijlen' },
            { title: 'Herhaal', text: 'Hij komt morgen terug' },
            { title: 'Beheers', text: 'Na een week zit hij vast' },
          ].map((step, i) => (
            <li key={step.title} className="flex flex-col items-center gap-1">
              <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft font-extrabold text-brand-strong">{i + 1}</span>
              <span className="font-bold"><span className="sr-only">Stap {i + 1}: </span>{step.title}</span>
              <span className="text-[13px] leading-snug text-muted">{step.text}</span>
            </li>
          ))}
        </ol>
      </section>
    </>
  )
}

function TopStat({ icon, tone, label, value, hint }: { icon: React.ReactNode; tone: string; label: string; value: React.ReactNode; hint: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span aria-hidden className={tone}>{icon}</span>
      <span>{label}</span>
      <span className="font-bold tabular-nums text-ink">{value}</span>
      <span className="hidden sm:inline">· {hint}</span>
    </div>
  )
}

/** Dagdoel als blokjes: één blokje per minuut */
function DaySegments({ minutes, goal }: { minutes: number; goal: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex w-full max-w-60 gap-1" role="img" aria-label={`Dagdoel: ${minutes} van ${goal} minuten`}>
        {Array.from({ length: goal }, (_, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i < minutes ? 'bg-accent' : 'bg-line'}`} />)}
      </div>
      <span className="shrink-0 text-xs font-semibold text-muted sm:text-sm" aria-hidden>{minutes} van {goal} min vandaag</span>
    </div>
  )
}

function QuickLink({ to, icon, title, text }: { to: string; icon: React.ReactNode; title: string; text: string }) {
  return (
    <Link to={to} className="tap flex flex-col gap-2 p-3.5 lg:flex-row lg:items-center lg:gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-strong" aria-hidden>{icon}</span>
      <span className="min-w-0"><span className="block font-semibold">{title}</span><span className="block text-sm leading-snug text-muted">{text}</span></span>
    </Link>
  )
}

function greeting() {
  const h = new Date().getHours()
  return h < 6 ? 'Goedenacht' : h < 12 ? 'Goedemorgen' : h < 18 ? 'Goedemiddag' : 'Goedenavond'
}
