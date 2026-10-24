import { Link } from 'react-router'
import { ArrowRight, BookMarked, Brain, Flame, Repeat, Star, Sun, Swords, TrendingUp, GitBranch } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, today } from '../lib/db'
import { familyProgress, useCardMap, useFamilies, useProgressMap } from '../lib/hooks'
import { levelFromXp } from '../lib/gamification'
import { streak, totalXp } from '../lib/progress'
import { stageOf } from '../lib/srs'
import { fenFromEpd } from '../lib/chess'
import { MiniBoard } from '../components/Board'
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
  const lvl = levelFromXp(xp)
  const fams = families.data ?? []
  const famStats = fams.map(f => ({ f, p: familyProgress(f, progress, cards) }))
  const goalSeconds = settings.dailyMinutes * 60

  return (
    <div className="space-y-6">
      <section className="card overflow-hidden">
        <div className="flex flex-col gap-4 bg-gradient-to-br from-brand-soft to-transparent p-5 sm:flex-row sm:items-center sm:p-6">
          <div className="flex-1">
            <div className="text-sm font-semibold text-brand-strong">{todayAct?.dailyCompleted ? 'Daily Training van vandaag voltooid' : `Vandaag: ${settings.dailyMinutes} minuten`}</div>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">{greeting()}</h1>
            <p className="mt-1 text-ink/80">{xp === 0 ? 'Begin met je eerste variant: de Daily Training kiest hem voor je.' : due > 0 ? `${due} ${due === 1 ? 'positie wacht' : 'posities wachten'} op herhaling.` : 'Geen openstaande herhalingen: tijd voor nieuwe zetten.'}</p>
            <ProgressBar className="mt-3 max-w-sm" value={(todayAct?.seconds ?? 0) / goalSeconds} label="Dagdoel" />
            <div className="mt-1 text-xs text-ink/75">{Math.round((todayAct?.seconds ?? 0) / 60)} van {settings.dailyMinutes} min · {plural(todayAct?.correct ?? 0, 'goede zet', 'goede zetten')} vandaag</div>
          </div>
          <div className="flex flex-col gap-2 sm:w-64">
            <Link to="/dagelijks" className="btn btn-primary min-h-12 text-base"><Sun size={20} aria-hidden />Start Daily Training</Link>
            {settings.lastRoute && (
              <Link to={settings.lastRoute} className="btn btn-ghost min-h-11 justify-between text-left">
                <span className="min-w-0"><span className="block text-xs font-normal text-muted">Ga verder waar je was</span><span className="block truncate">{settings.lastRouteLabel && settings.lastRouteLabel !== 'SchaakRoute' ? settings.lastRouteLabel : 'Laatste training'}</span></span>
                <ArrowRight size={18} aria-hidden className="shrink-0" />
              </Link>
            )}
          </div>
        </div>
      </section>

      {xp > 0 && (
        <section aria-label="Jouw voortgang" className="card grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x">
          <Metric icon={<Flame size={18} />} label="Streak" value={plural(st.current, 'dag', 'dagen')} hint={`record ${st.best}`} />
          <Metric icon={<Star size={18} />} label={`Level ${lvl.level}`} value={`${xp.toLocaleString('nl-NL')} XP`} hint={<ProgressBar value={lvl.progress} tone="accent" className="mt-1.5" label="Voortgang naar het volgende level" />} />
          <Metric icon={<Brain size={18} />} label="Geleerde posities" value={learnedPositions} hint={`${mature} op de lange termijn (7+ dagen)`} />
          <Metric icon={<Repeat size={18} />} label="Herhalingen" value={due} hint={due ? <Link to="/mastery" className="underline">nu herhalen</Link> : 'niets openstaand'} />
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Mijn openingen</h2>
          <Link to="/welkom" className="text-sm text-muted underline">aanpassen</Link>
        </div>
        {families.loading ? <Spinner /> : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {famStats.map(({ f, p }) => (
              <Link key={f.family.id} to={`/opening/${f.family.id}`} className="card flex gap-3 p-3 transition hover:border-brand">
                <div className="w-24 shrink-0"><MiniBoard id={`dash-${f.family.id}`} fen={fenFromEpd(f.family.rootEpd)} orientation={f.family.side} /></div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-muted">{sideLabel(f.family.side)} · {f.family.ecoRange}</div>
                  <div className="truncate font-bold">{f.family.name}</div>
                  <div className="text-xs text-muted">{OPENING_INFO[f.family.id]?.nameNl}</div>
                  <ProgressBar className="mt-2" value={p.pct} />
                  <div className="mt-1 text-xs text-muted">{p.learned}/{p.total} varianten · {p.mastered} beheerst · {plural(p.positions, 'positie', 'posities')}</div>
                </div>
              </Link>
            ))}
            <Link to="/openingen" className="card flex items-center justify-center p-6 text-sm font-semibold text-muted hover:border-brand hover:text-ink">+ Alle 20 openingen bekijken</Link>
          </div>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <QuickLink to="/variaties" icon={<GitBranch size={20} />} title="Variations" text="Alle varianten van een opening oefenen" />
        <QuickLink to="/crushing" icon={<Swords size={20} />} title="Crushing" text="Leer openingsfouten afstraffen" />
        <QuickLink to="/advantage" icon={<TrendingUp size={20} />} title="Advantage" text="Wat werkt in de praktijk op jouw niveau" />
        <QuickLink to="/repertoire" icon={<BookMarked size={20} />} title="Repertoire" text="Stel je eigen openingen samen" />
      </section>
    </div>
  )
}

function Metric({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-1.5 text-sm text-muted"><span aria-hidden className="text-brand-strong">{icon}</span>{label}</div>
      <div className="mt-0.5 text-xl font-bold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  )
}

function QuickLink({ to, icon, title, text }: { to: string; icon: React.ReactNode; title: string; text: string }) {
  return (
    <Link to={to} className="card flex items-start gap-3 p-4 transition hover:border-brand">
      <span className="mt-0.5 text-brand-strong" aria-hidden>{icon}</span>
      <span><span className="block font-semibold">{title}</span><span className="block text-sm text-muted">{text}</span></span>
    </Link>
  )
}

function greeting() {
  const h = new Date().getHours()
  return h < 6 ? 'Goedenacht' : h < 12 ? 'Goedemorgen' : h < 18 ? 'Goedemiddag' : 'Goedenavond'
}
