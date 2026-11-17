import { Link } from 'react-router'
import { ArrowRight, BookMarked, Brain, ChevronRight, Flame, Play, Plus, Repeat, Star, Sun, Swords, TrendingUp, GitBranch } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, today } from '../lib/db'
import { familyProgress, useCardMap, useFamilies, useProgressMap } from '../lib/hooks'
import { streak, totalXp } from '../lib/progress'
import { levelFromXp } from '../lib/gamification'
import { stageOf } from '../lib/srs'
import { fenFromEpd, moveNumberLabel } from '../lib/chess'
import { courseOrder, DAILY_REVIEWS } from '../lib/daily'
import { displayName } from '../lib/data'
import { MiniBoard } from '../components/Board'
import { CropBoard } from '../components/CropBoard'
import { ProgressBar, Spinner, useSettings, sideLabel, nf } from '../components/ui'
import { getLang, t, tn } from '../lib/i18n'
import { OPENING_INFO } from '../content/openingInfo'
import { LaunchNotices } from '../components/LaunchNotices'
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

  // Het bord in de hero toont de variant die je als volgende leert
  const heroFile = fams[0]
  const order = heroFile ? courseOrder(heroFile) : []
  const heroVar = order.find(v => !progress.get(v.id)?.completions) ?? order[0]

  const lvl = levelFromXp(xp)

  // Telefoon: alles onder elkaar (ongewijzigd). Desktop (ontwerp 15a): kop met groet en reeks, links de dag en je
  // openingen, rechts (vanaf 1280px) een smalle kolom met Herhalen en Meer trainen, zodat alles zonder scrollen in beeld is.
  return (
    <div className="space-y-6 lg:space-y-[22px] xl:grid xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start xl:gap-[22px] xl:space-y-0">
      {xp > 0 && (
        <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted lg:hidden" aria-label={t('Jouw voortgang')}>
          <TopStat icon={<Flame size={15} />} tone="text-star" label={t('Reeks')} value={tn(st.current, '{n} dag', '{n} dagen')} hint={t('record {n}', { n: st.best })} />
          <TopStat icon={<Brain size={15} />} tone="text-brand-strong" label={t('Geleerde posities')} value={learnedPositions} hint={t('{n} al 7+ dagen vast', { n: mature })} />
        </div>
      )}

      {!firstTime && (
        <header className="hidden items-end justify-between gap-4 lg:flex xl:col-span-2">
          <h1 className="text-[38px] font-extrabold leading-[1.05] tracking-[-0.03em]">{greeting()}</h1>
          {xp > 0 && (
            <div className="flex shrink-0 gap-2" aria-label={t('Jouw voortgang')}>
              {st.current > 0 && (
                <span className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-accent-soft px-3.5 text-sm font-bold text-accent-ink" title={t('Record {n}', { n: st.best })}>
                  <Flame size={16} aria-hidden className="text-accent" />{tn(st.current, '{n} dag', '{n} dagen')}<span className="sr-only"> {t('op rij getraind')}</span>
                </span>
              )}
              <span className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full border-2 border-line bg-surface px-3.5 text-sm font-bold" title={t('{n} geleerde posities', { n: nf(learnedPositions) })}>
                <Star size={16} aria-hidden className="text-accent" />Level {lvl.level} · {nf(xp)} XP
              </span>
            </div>
          )}
        </header>
      )}

      <div className="space-y-6 lg:space-y-[22px]">
      {firstTime ? (
        <FirstTraining file={heroFile} variation={heroVar} />
      ) : (
      <section className="card grid grid-cols-[minmax(0,1fr)] gap-y-5 p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-center lg:gap-x-7 lg:gap-y-0 lg:rounded-3xl lg:p-6">
        {/* Telefoon: tekst, bord, knoppen onder elkaar. Desktop (15a): links de dag, rechts het bord met de knop eronder */}
        <div className="contents lg:flex lg:flex-col lg:gap-5">
        <div>
          <h1 className="text-4xl font-extrabold leading-none tracking-tight lg:hidden">{greeting()}</h1>
          <p className="mt-2 text-base text-muted lg:mt-5 lg:text-[22px] lg:font-extrabold lg:leading-tight lg:tracking-[-0.02em] lg:text-ink">
            {todayAct?.dailyCompleted ? t('Dagtraining gedaan. Mooi werk.') : xp === 0 ? t('De dagtraining kiest je eerste variant.') : due > DAILY_REVIEWS ? t('Vandaag herhaal je {n} posities en leer je iets nieuws.', { n: DAILY_REVIEWS }) : due > 0 ? tn(due, '{n} positie om te herhalen.', '{n} posities om te herhalen.', { n: nf(due) }) : t('Tijd voor nieuwe zetten.')}
          </p>
        </div>
        <div className={`order-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-3 lg:order-none ${settings.lastRoute ? '' : 'lg:hidden'}`}>
          <Link to="/dagelijks" className="btn btn-primary min-h-13 px-6 text-base lg:hidden!"><Sun size={20} aria-hidden />{t('Start de dagtraining')}</Link>
          {settings.lastRoute && (
            <Link to={settings.lastRoute} className="btn btn-ghost min-h-13 min-w-0 justify-between gap-4 text-left sm:max-w-xs lg:w-full lg:max-w-none">
              <span className="min-w-0"><span className="block text-xs font-normal text-muted">{t('Ga verder waar je was')}</span><span className="block truncate">{settings.lastRouteLabel && settings.lastRouteLabel !== 'SchaakRoute' ? t(settings.lastRouteLabel) : t('Laatste training')}</span></span>
              <ArrowRight size={18} aria-hidden className="shrink-0" />
            </Link>
          )}
        </div>
        </div>
        <div className="order-2 lg:order-none lg:flex lg:flex-col lg:gap-3.5">
          {heroFile && heroVar && (
            <Link to={`/train/${heroFile.family.id}/${heroVar.id}?mode=learn`} className="group block" aria-label={t('Leer {name}', { name: displayName(heroVar, heroFile.family.name) })}>
              <div className="rounded-xl shadow-[0_6px_22px_rgb(30_40_30/0.14)] transition group-hover:shadow-[0_8px_28px_rgb(30_40_30/0.2)]">
                <MiniBoard id="dash-hero" fen={fenFromEpd(heroVar.epd)} orientation={heroFile.family.side} />
              </div>
              <div className="mt-2 flex items-baseline justify-between gap-3 text-sm text-muted">
                <span className="min-w-0 truncate">{displayName(heroVar, heroFile.family.name)}</span>
                {heroVar.san.length > 0 && <span className="shrink-0 font-semibold text-ink">{moveNumberLabel(heroVar.san.length - 1)}{heroVar.san[heroVar.san.length - 1]}</span>}
              </div>
            </Link>
          )}
          <Link to="/dagelijks" className="btn btn-primary hidden! w-full gap-2.5! lg:flex!"><Sun size={20} aria-hidden />{t('Start de dagtraining')}</Link>
        </div>
      </section>
      )}

      <LaunchNotices settings={settings} hasProgress={!firstTime} />

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-bold lg:tracking-[-0.01em]">{t('Mijn openingen')}</h2>
          <div className="flex items-baseline gap-4">
            <Link to="/openingen" className="hidden min-h-11 items-center text-sm text-muted underline lg:inline-flex">{t('alle openingen')}</Link>
            <Link to="/welkom" className="inline-flex min-h-11 items-center text-sm text-muted underline">{t('aanpassen')}</Link>
          </div>
        </div>
        {families.loading ? <Spinner /> : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4 lg:gap-3">
            {famStats.map(({ f, p }) => (
              <Link key={f.family.id} to={`/opening/${f.family.id}`} className="tap flex flex-col p-2.5 sm:p-3 lg:flex-row lg:items-center lg:gap-3 lg:p-2.5">
                <div className="lg:w-[72px] lg:shrink-0"><CropBoard epd={f.family.rootEpd} uci={f.family.rootUci} orientation={f.family.side} inset={4} coordsFrom="below-lg" /></div>
                <div className="px-0.5 pt-2.5 lg:min-w-0 lg:flex-1 lg:p-0">
                  <div className="text-xs font-semibold text-muted lg:hidden">{sideLabel(f.family.side)} · {f.family.ecoRange}</div>
                  <div className="truncate font-bold sm:text-base">{f.family.name}</div>
                  <div className="hidden truncate text-xs text-muted sm:block"><span className="hidden lg:inline">{sideLabel(f.family.side)}{nameNl(f.family.id) ? ' · ' : ''}</span>{nameNl(f.family.id)}</div>
                  <div className="lg:mt-2 lg:flex lg:items-center lg:gap-2">
                    <ProgressBar className="mt-2 lg:mt-0 lg:flex-1" value={p.pct} label={t('{n} van {m} varianten', { n: p.learned, m: p.total })} />
                    <span className="hidden text-xs font-bold tabular-nums lg:inline" aria-hidden>{Math.round(p.pct * 100)}%</span>
                  </div>
                  <div className="mt-1 text-xs text-muted lg:hidden">{t('{n}/{m} varianten', { n: p.learned, m: p.total })}</div>
                </div>
              </Link>
            ))}
            <Link to="/openingen" className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line p-3 text-center text-sm font-semibold text-muted transition hover:border-brand hover:text-ink lg:hidden"><Plus size={20} aria-hidden />{t('Alle openingen bekijken')}</Link>
          </div>
        )}
      </section>
      </div>

      {/* Tussen 1024 en 1280 is de smalle kolom te krap naast het bord: dan staan Herhalen en Meer trainen naast elkaar onderaan */}
      <aside className={`space-y-6 lg:space-y-0 xl:block xl:space-y-4 ${firstTime ? '' : 'lg:grid lg:grid-cols-2 lg:items-start lg:gap-4'}`}>
        {!firstTime && (
          // Desktop (15a): Herhalen in de smalle kolom; op de telefoon zit Herhalen in het bodemmenu
          <section className="card hidden flex-col gap-3 p-4 lg:flex" aria-labelledby="herhalen-title">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] bg-info-soft text-info-ink" aria-hidden><Repeat size={22} /></span>
              <div className="min-w-0">
                <h2 id="herhalen-title" className="text-xl font-extrabold leading-[1.1] tracking-[-0.02em]">{due > 0 ? tn(due, '{n} positie', '{n} posities', { n: nf(due) }) : t('Alles herhaald')}</h2>
                <p className="text-[13px] text-muted">{due > 0 ? t('klaar om te herhalen') : t('nieuwe herhalingen komen vanzelf')}</p>
              </div>
            </div>
            <Link to="/mastery" className="btn btn-ghost w-full gap-2! text-[15px]!"><Play size={18} aria-hidden className="text-muted" />{due > 0 ? t('Nu herhalen') : t('Naar Herhalen')}</Link>
          </section>
        )}

        <section aria-labelledby="meer-title">
          <h2 id="meer-title" className="mb-3 text-lg font-bold lg:mb-2.5 lg:tracking-[-0.01em]">{t('Meer trainen')}</h2>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:flex lg:flex-col lg:gap-2">
            <QuickLink to="/variaties" icon={<GitBranch size={20} />} tone="brand" title={t('Varianten')} text={t('Alle varianten oefenen')} />
            <QuickLink to="/crushing" icon={<Swords size={20} />} tone="danger" title={t('Afstraffen')} text={t('Fouten afstraffen')} />
            <QuickLink to="/advantage" icon={<TrendingUp size={20} />} tone="info" title={t('Op jouw niveau')} text={t('Wat scoort het best')} />
            {/* Op desktop staat Repertoire al in het zijmenu */}
            <QuickLink to="/repertoire" icon={<BookMarked size={20} />} tone="accent" title={t('Repertoire')} text={t('Je eigen openingen')} className="lg:hidden" />
          </div>
        </section>
      </aside>
    </div>
  )
}

/** Eerste keer (ontwerp 16a): uitnodiging voor de eerste training, de variant die je gaat leren en hoe het werkt */
function FirstTraining({ file, variation }: { file?: FamilyFile; variation?: Variation }) {
  return (
    <>
      <section className="card flex flex-col gap-4 p-5 sm:p-8 lg:p-10" aria-labelledby="eerste-training-title">
        <div>
          <h1 id="eerste-training-title" className="text-[1.75rem] font-extrabold leading-[1.12] tracking-[-0.02em] lg:text-4xl">{t('Klaar voor je eerste training?')}</h1>
          <p className="mt-1.5 text-base text-muted lg:text-lg">{t('Een paar minuten, daarna ken je je eerste variant.')}</p>
        </div>
        {file && variation && (
          <div className="flex items-center gap-3.5 rounded-[14px] border-2 border-line bg-bg p-3 lg:max-w-xl">
            <div className="w-[104px] shrink-0 sm:w-28"><CropBoard epd={file.family.rootEpd} uci={file.family.rootUci} orientation={file.family.side} inset={4} coordsFrom="never" /></div>
            <div className="min-w-0">
              <span className="inline-block rounded-md bg-accent-soft px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] text-accent-ink">{t('Je eerste variant')}</span>
              <div className="mt-1 text-lg font-bold leading-tight" title={displayName(variation, file.family.name)}>{variation.path[0] ?? displayName(variation, file.family.name)}</div>
              <div className="mt-0.5 text-sm text-muted">{file.family.name} · {file.family.side === 'white' ? t('met wit') : t('met zwart')}</div>
            </div>
          </div>
        )}
        <Link to="/dagelijks" className="btn btn-primary w-full gap-2.5! lg:w-auto lg:self-start lg:px-8!"><Sun size={20} aria-hidden />{t('Start je eerste training')}</Link>
      </section>

      <section className="card p-4 sm:p-5" aria-label={t('Zo werkt het')}>
        <ol className="grid grid-cols-3 gap-2 text-center">
          {[
            { title: t('Leer'), text: t('Speel de variant na met pijlen') },
            { title: t('Herhaal'), text: t('Hij komt morgen terug') },
            { title: t('Beheers'), text: t('Na een week zit hij vast') },
          ].map((step, i) => (
            <li key={step.title} className="flex flex-col items-center gap-1">
              <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft font-extrabold text-brand-strong">{i + 1}</span>
              <span className="font-bold"><span className="sr-only">{t('Stap {n}:', { n: i + 1 })} </span>{step.title}</span>
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

/** Kleur van het icoon op desktop (ontwerp 15a): de kleur van die training, zoals in het zijmenu */
const QUICK_TONE = { brand: '', danger: 'lg:bg-danger-soft lg:text-danger-ink', info: 'lg:bg-info-soft lg:text-info-ink', accent: 'lg:bg-accent-soft lg:text-accent-ink' }

function QuickLink({ to, icon, title, text, tone, className = '' }: { to: string; icon: React.ReactNode; title: string; text: string; tone: keyof typeof QUICK_TONE; className?: string }) {
  return (
    <Link to={to} className={`tap flex flex-col gap-2 p-3.5 lg:flex-row lg:items-center lg:gap-3 lg:rounded-2xl! lg:px-3 lg:py-2.5 ${className}`}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-strong lg:h-[38px] lg:w-[38px] lg:rounded-[11px] ${QUICK_TONE[tone]}`} aria-hidden>{icon}</span>
      <span className="min-w-0 lg:flex-1"><span className="block font-semibold lg:text-sm lg:font-bold">{title}</span><span className="block text-sm leading-snug text-muted lg:text-xs">{text}</span></span>
      <ChevronRight size={16} aria-hidden className="hidden shrink-0 text-muted lg:block" />
    </Link>
  )
}

function greeting() {
  const h = new Date().getHours()
  return h < 6 ? t('Goedenacht') : h < 12 ? t('Goedemorgen') : h < 18 ? t('Goedemiddag') : t('Goedenavond')
}

/** Nederlandse naam van een opening (bijv. "Italiaanse partij"); in het Engels is de gewone naam al genoeg */
function nameNl(id: string) {
  return getLang() === 'nl' ? OPENING_INFO[id]?.nameNl : undefined
}
