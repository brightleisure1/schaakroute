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

export function Dashboard() {
  const settings = useSettings()
  const families = useFamilies(settings?.openings ?? [])
  const progress = useProgressMap()
  const cards = useCardMap()
  const xp = useLiveQuery(() => totalXp(), [], 0)
  const st = useLiveQuery(() => streak(), [], { current: 0, best: 0 })
  const todayAct = useLiveQuery(() => db.daily.get(today()), [])
  const now = Date.now()

  if (!settings) return <Spinner />
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
          <TopStat icon={<Flame size={15} />} tone="text-star" label="Streak" value={plural(st.current, 'dag', 'dagen')} hint={`record ${st.best}`} />
          <TopStat icon={<Brain size={15} />} tone="text-brand-strong" label="Geleerde posities" value={learnedPositions} hint={`${mature} al 7+ dagen vast`} />
        </div>
      )}

      <section className="card grid grid-cols-[minmax(0,1fr)] gap-y-5 p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_296px] lg:items-center lg:gap-x-12 lg:p-10">
        {/* Telefoon: tekst, bord, knoppen onder elkaar. Desktop: tekst en knoppen links, bord rechts */}
        <div className="contents lg:flex lg:flex-col lg:gap-7">
        <div>
          <DaySegments minutes={minutesToday} goal={settings.dailyMinutes} />
          <h1 className="mt-3 text-4xl font-extrabold leading-none tracking-tight lg:mt-4 lg:text-5xl">{greeting()}</h1>
          <p className="mt-2 text-base text-muted lg:mt-3 lg:text-lg">
            {todayAct?.dailyCompleted ? 'Dagdoel gehaald. Mooi werk.' : xp === 0 ? 'De Daily Training kiest je eerste variant.' : due > 0 ? `${plural(due, 'positie', 'posities')} om te herhalen.` : 'Tijd voor nieuwe zetten.'}
          </p>
        </div>
        <div className="order-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-3 lg:order-none">
          <Link to="/dagelijks" className="btn btn-primary min-h-13 px-6 text-base"><Sun size={20} aria-hidden />Start Daily Training</Link>
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

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-bold lg:text-xl">Mijn openingen</h2>
          <Link to="/welkom" className="text-sm text-muted underline">aanpassen</Link>
        </div>
        {families.loading ? <Spinner /> : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {famStats.map(({ f, p }) => (
              <Link key={f.family.id} to={`/opening/${f.family.id}`} className="card flex flex-col p-2.5 transition hover:border-brand sm:p-3">
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
            <Link to="/openingen" className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line p-3 text-center text-sm font-semibold text-muted transition hover:border-brand hover:text-ink"><Plus size={20} aria-hidden />Alle 20 openingen bekijken</Link>
          </div>
        )}
      </section>

      <section aria-labelledby="meer-title">
        <h2 id="meer-title" className="mb-3 text-lg font-bold lg:text-xl">Meer trainen</h2>
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
          <QuickLink to="/variaties" icon={<GitBranch size={20} />} title="Variations" text="Alle varianten oefenen" />
          <QuickLink to="/crushing" icon={<Swords size={20} />} title="Crushing" text="Fouten afstraffen" />
          <QuickLink to="/advantage" icon={<TrendingUp size={20} />} title="Advantage" text="Wat werkt op jouw niveau" />
          <QuickLink to="/repertoire" icon={<BookMarked size={20} />} title="Repertoire" text="Je eigen openingen" />
        </div>
      </section>
    </div>
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
    <Link to={to} className="card flex flex-col gap-2 p-3.5 transition hover:border-brand lg:flex-row lg:items-center lg:gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-strong" aria-hidden>{icon}</span>
      <span className="min-w-0"><span className="block font-semibold">{title}</span><span className="block text-sm leading-snug text-muted">{text}</span></span>
    </Link>
  )
}

function greeting() {
  const h = new Date().getHours()
  return h < 6 ? 'Goedenacht' : h < 12 ? 'Goedemorgen' : h < 18 ? 'Goedemiddag' : 'Goedenavond'
}
