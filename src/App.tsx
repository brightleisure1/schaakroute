import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { BookMarked, ChartColumn, ChessKnight, ChevronRight, Download, Flame, MessageSquare, Microscope, GitBranch, House, Ellipsis, Repeat, Settings as SettingsIcon, Sun, Swords, TrendingUp, X, type LucideIcon } from 'lucide-react'
import { deviceLang, setLang, t, tn, type Lang } from './lib/i18n'
import { feedbackHref } from './lib/feedback'
import './lib/install' // vangt het installatieverzoek van de browser zo vroeg mogelijk op
import { HashRouter, NavLink, Navigate, Route, Routes, useLocation } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './lib/db'
import { streak } from './lib/progress'
import { FocusContext, useSettings } from './components/ui'
import { AppLoading, EmptyKnight } from './components/PieceMotion'
import { Dashboard } from './pages/Dashboard'
import { Onboarding } from './pages/Onboarding'
import { Openings } from './pages/Openings'
import { OpeningDetail } from './pages/OpeningDetail'
import { TrainPage } from './pages/TrainPage'

// Minder vaak gebruikte schermen pas laden wanneer nodig
const Course = lazy(() => import('./pages/Course').then(m => ({ default: m.Course })))
const LessonRun = lazy(() => import('./pages/Course').then(m => ({ default: m.LessonRun })))
const Variations = lazy(() => import('./pages/Variations').then(m => ({ default: m.Variations })))
const Crushing = lazy(() => import('./pages/Crushing').then(m => ({ default: m.Crushing })))
const Advantage = lazy(() => import('./pages/Advantage').then(m => ({ default: m.Advantage })))
const Mastery = lazy(() => import('./pages/Mastery').then(m => ({ default: m.Mastery })))
const Daily = lazy(() => import('./pages/Daily').then(m => ({ default: m.Daily })))
const RepertoireList = lazy(() => import('./pages/Repertoire').then(m => ({ default: m.RepertoireList })))
const RepertoireEditor = lazy(() => import('./pages/Repertoire').then(m => ({ default: m.RepertoireEditor })))
const RepertoireTrain = lazy(() => import('./pages/Repertoire').then(m => ({ default: m.RepertoireTrain })))
const Statistics = lazy(() => import('./pages/Statistics').then(m => ({ default: m.Statistics })))
const ImportGames = lazy(() => import('./pages/ImportGames').then(m => ({ default: m.ImportGames })))
const GameReviewList = lazy(() => import('./pages/GameReview').then(m => ({ default: m.GameReviewList })))
const BrilliantsView = lazy(() => import('./pages/GameReview').then(m => ({ default: m.BrilliantsView })))
const SharedGameView = lazy(() => import('./pages/GameReview').then(m => ({ default: m.SharedGameView })))
const MistakeTrainerView = lazy(() => import('./pages/GameReview').then(m => ({ default: m.MistakeTrainerView })))
const ReviewReplayView = lazy(() => import('./pages/GameReview').then(m => ({ default: m.ReviewReplayView })))
const GameReviewView = lazy(() => import('./pages/GameReview').then(m => ({ default: m.GameReviewView })))
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })))
const Sources = lazy(() => import('./pages/Sources').then(m => ({ default: m.Sources })))
const Privacy = lazy(() => import('./pages/Privacy').then(m => ({ default: m.Privacy })))

// Navigatie in drie groepen. De teksten zijn Nederlandse sleutels: vertalen gebeurt bij het tekenen (t(n.label)).
const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Trainen',
    items: [
      { to: '/', label: 'Start', icon: House, mobile: true, color: 'var(--brand)' },
      { to: '/dagelijks', label: 'Dagtraining', short: 'Vandaag', icon: Sun, mobile: true, color: 'var(--accent)' },
      { to: '/mastery', label: 'Herhalen', icon: Repeat, mobile: true, badge: true, color: 'var(--info)' },
      { to: '/openingen', label: 'Openingen', icon: ChessKnight, mobile: true, color: 'var(--brand)' },
      { to: '/variaties', label: 'Varianten', icon: GitBranch, desc: 'Alles van één opening', tone: 'brand', color: 'var(--brand)' },
    ],
  },
  {
    title: 'Verdiepen',
    items: [
      { to: '/crushing', label: 'Afstraffen', icon: Swords, desc: 'Fouten afstraffen', tone: 'danger', color: 'var(--danger)' },
      { to: '/advantage', label: 'Op jouw niveau', icon: TrendingUp, desc: 'Wat scoort het best', tone: 'info', color: 'var(--info)' },
      { to: '/repertoire', label: 'Repertoire', icon: BookMarked, desc: 'Je eigen openingen', tone: 'accent', color: 'var(--accent)' },
      { to: '/analyse', label: 'Partij-analyse', short: 'Analyse', icon: Microscope, mobile: true, color: 'var(--teal)', desc: 'Je partijen zet voor zet laten beoordelen' },
      { to: '/import', label: 'Mijn partijen', icon: Download, desc: 'Lichess of Chess.com' },
    ],
  },
  {
    title: 'Jij',
    items: [
      { to: '/statistieken', label: 'Statistieken', icon: ChartColumn, desc: 'Je voortgang' },
      { to: '/instellingen', label: 'Instellingen', icon: SettingsIcon, desc: 'Niveau, weergave en back-up', wide: true },
    ],
  },
]
interface NavItem {
  to: string; label: string; short?: string; icon: LucideIcon; mobile?: boolean; badge?: boolean; desc?: string
  /** Kleur van het icoon in het bodemmenu (ontwerp 14k) en in het zijmenu (ontwerp 15a); zonder kleur grijs */
  color?: string
  /** Kleur van de tegel in het Meer-paneel: de kleur van die training (ontwerp 12c) */
  tone?: keyof typeof TILE_TONE
  /** In het Meer-paneel als brede regel onderaan in plaats van een tegel */
  wide?: boolean
}
const TILE_TONE = {
  brand: 'bg-brand-soft text-brand-strong',
  danger: 'bg-danger-soft text-danger-ink',
  info: 'bg-info-soft text-info-ink',
  accent: 'bg-accent-soft text-accent-ink',
  neutral: 'bg-surface-2 text-ink',
}
const NAV = NAV_GROUPS.flatMap(g => g.items)
// Op deze schermen wordt getraind: geen bodemnavigatie, zodat bord, feedback en knoppen in beeld blijven.
// Dagtraining en Herhalen staan zelf in het bodemmenu en houden het menu, ook tijdens het trainen.
/** Trainingsmodus (ontwerp ronde 10): geen kop en geen menu, alleen sluiten, voortgang en het bord */
const TRAINING_MODE = /^\/((crushing|advantage)\/|train\/|analyse\/[^/]+\/(naspelen|fouten))/
/** Desktop (ontwerp 15b): het zijmenu maakt plaats voor een balk over de volle breedte met sluiten, voortgang en je reeks */
const FULL_TRAINING = /^\/train\//
const FOCUS_ROUTES = /^\/(train|les|crushing|advantage|repertoire\/\d+\/train|analyse\/[^/]+\/(naspelen|fouten))/

/**
 * Zet --bottom-nav op de pagina: de ruimte die de tabbalk inneemt. Vastgeplakte knoppen blijven erboven
 * en scrollen (scroll-padding) houdt er rekening mee, zodat het menu nooit een knop afdekt.
 */
function BottomNavSpace({ active }: { active: boolean }) {
  useEffect(() => {
    const root = document.documentElement
    if (!active) { root.style.removeProperty('--bottom-nav'); return }
    // De echte hoogte van het menu meten (ontwerp 14k is hoger dan het oude menu, en het label onder de actieve tab telt mee)
    const nav = document.getElementById('bottom-nav')
    const apply = () => root.style.setProperty('--bottom-nav', nav && nav.offsetHeight ? `${nav.offsetHeight}px` : 'calc(5.5rem + env(safe-area-inset-bottom))')
    apply()
    if (!nav) return
    const ro = new ResizeObserver(apply)
    ro.observe(nav)
    return () => ro.disconnect()
  }, [active])
  return null
}

function ThemeSync() {
  const s = useSettings()
  useEffect(() => {
    if (!s) return
    try {
      localStorage.setItem('sr-theme', s.theme)
    } catch {
      // geen localStorage beschikbaar
    }
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = s.theme === 'dark' || (s.theme === 'system' && mq.matches)
      document.documentElement.classList.toggle('dark', dark)
      // Statusbalk (iOS/Android) volgt het thema: in het donker het bosgroen van de achtergrond
      document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#141a16' : '#2f7d4f')
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [s?.theme]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="card mx-auto max-w-lg p-6 text-center">
        <EmptyKnight className="mx-auto bg-brand-soft" />
        <h2 className="mt-3 font-bold">{t('Er ging iets mis op deze pagina')}</h2>
        <p className="mt-1 text-sm text-muted">{this.state.error.message}</p>
        <p className="mt-1 text-xs text-muted">{t('Je voortgang is veilig opgeslagen.')}</p>
        <button className="btn btn-primary mt-4" onClick={() => this.setState({ error: null })}>{t('Opnieuw proberen')}</button>
      </div>
    )
  }
}

function ScrollTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
    document.title = 'SchaakRoute'
  }, [pathname])
  return null
}

/** Onthoudt waar je gebleven was, voor de knop 'Ga verder' */
function RouteMemory() {
  const loc = useLocation()
  useEffect(() => {
    const p = loc.pathname + loc.search
    if (/^\/(train|cursus|les|crushing\/|advantage\/|repertoire\/\d+\/train|mastery)/.test(p)) {
      // het label (naam van de variant) zet het scherm zelf zodra die bekend is
      db.settings.update('me', { lastRoute: p }).catch(() => {})
    }
  }, [loc])
  return null
}

/** Reeks in de kop op de telefoon: hoeveel dagen op rij je traint (opent je statistieken) */
function StreakPill() {
  const st = useLiveQuery(() => streak(), [], { current: 0, best: 0 })
  if (!st.current) return null
  return (
    <NavLink to="/statistieken" className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-accent-soft px-3 text-sm font-bold text-accent-ink" aria-label={tn(st.current, '{n} dag op rij getraind', '{n} dagen op rij getraind')}>
      <Flame size={16} className="text-accent" aria-hidden />{tn(st.current, '{n} dag', '{n} dagen')}
    </NavLink>
  )
}

/**
 * Vraagt de browser je gegevens blijvend te bewaren. Zonder die toestemming mag een browser de opslag van
 * een website opruimen (bij ruimtegebrek, of bij Safari na een tijd niet gebruiken), en dan zijn je
 * openingskeuzes, voortgang en analyses weg. Pas vragen als er iets te bewaren is.
 */
function PersistStorage() {
  const active = !!useSettings()?.onboarded
  useEffect(() => {
    if (!active || !navigator.storage?.persist) return
    navigator.storage.persisted().then(p => (p ? true : navigator.storage.persist())).catch(() => {})
  }, [active])
  return null
}

function Shell() {
  const settings = useSettings()
  const due = useLiveQuery(() => db.cards.where('dueAt').belowOrEqual(Date.now()).filter(c => !c.suspended).count(), [], 0)
  const loc = useLocation()
  const [sessionFocus, setSessionFocus] = useState(false)
  if (!settings) return <AppLoading fullscreen />
  // Welkom is een eigen modus (ontwerp 10a/12a): geen kop en geen menu, ook als je je keuzes later aanpast
  const onboarding = loc.pathname === '/welkom'
  // Een gedeelde partij is ook zonder account te bekijken
  const openWithoutOnboarding = /^\/(welkom|bronnen|privacy|delen\/|analyse\/)/.test(loc.pathname)
  if (!settings.onboarded && !openWithoutOnboarding) return <Navigate to="/welkom" replace />
  const focus = FOCUS_ROUTES.test(loc.pathname) || sessionFocus
  // Zijmenu (ontwerp 15a): iconen in de kleur van elke training, zoals in het bodemmenu; actief met groene rand en onderrand
  const navClass = ({ isActive }: { isActive: boolean }) => `flex min-h-[42px] items-center gap-3 rounded-xl border-2 px-2.5 text-sm transition-colors ${isActive ? 'border-brand bg-brand-soft font-bold text-brand-strong shadow-[0_2px_0_var(--brand)]' : 'border-transparent font-medium text-ink hover:bg-surface-2'}`
  const fullTraining = FULL_TRAINING.test(loc.pathname)
  return (
    <FocusContext.Provider value={setSessionFocus}>
    <div className="min-h-dvh lg:flex">
      <BottomNavSpace active={!focus && !onboarding} />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:shadow-lg">{t('Naar de inhoud')}</a>
      {!onboarding && !fullTraining && (
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col overflow-y-auto border-r-2 border-line bg-surface px-3 py-5 lg:flex">
          <NavLink to="/" className="mb-[18px] flex items-center gap-2 px-2 text-xl font-extrabold tracking-[-0.025em]">
            <img src="./icon.svg" alt="" className="h-9 w-9 rounded-[22%] ring-1 ring-line" /><span>Schaak<span className="text-brand-strong">Route</span></span>
          </NavLink>
          <nav aria-label={t('Hoofdmenu')} className="flex flex-col gap-[18px]">
            {NAV_GROUPS.map(g => (
              <div key={g.title}>
                <h2 className="px-3 pb-1.5 text-xs font-bold uppercase tracking-[0.04em] text-muted">{t(g.title)}</h2>
                <ul className="flex flex-col gap-0.5">
                  {g.items.map(n => (
                    <li key={n.to}>
                      <NavLink to={n.to} end={n.to === '/'} className={navClass}>
                        {({ isActive }) => (
                          <>
                            <n.icon size={20} strokeWidth={isActive ? 2.25 : 2} aria-hidden className="shrink-0" style={{ color: isActive ? 'var(--brand)' : n.color ?? 'var(--muted)' }} />{t(n.label)}
                            {n.badge && due > 0 && <span className="ml-auto rounded-full bg-danger px-[7px] text-xs leading-5 font-extrabold text-white" aria-label={t('{n} herhalingen', { n: due })}>{due}</span>}
                          </>
                        )}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
          <div className="mt-auto px-2.5 pt-4 text-xs text-muted">{t('Gratis en open source')} · <NavLink to="/bronnen" className="underline">{t('bronnen')}</NavLink> · <NavLink to="/privacy" className="underline">{t('privacy')}</NavLink></div>
        </aside>
      )}

      <div className="min-w-0 flex-1">
        {/* De kopbalk scrolt gewoon mee weg; alleen de menuknop blijft vast rechtsboven staan (geen scroll-JavaScript) */}
        <header className={`relative z-20 items-center justify-between border-b border-line bg-bg px-4 py-2 lg:hidden ${sessionFocus || onboarding || TRAINING_MODE.test(loc.pathname) ? 'hidden' : 'flex'}`}>
          <NavLink to="/" className="flex min-h-11 items-center gap-2 text-lg font-extrabold"><img src="./icon.svg" alt="" className="h-8 w-8 rounded-[22%] ring-1 ring-line" /><span>Schaak<span className="text-brand-strong">Route</span></span></NavLink>
          <StreakPill />
        </header>
        <main id="main" className={`mx-auto w-full px-4 sm:px-6 ${fullTraining ? 'lg:max-w-none lg:p-0' : 'max-w-6xl lg:pb-10 lg:pt-8'} ${sessionFocus ? 'pt-1' : 'pt-5'} ${focus || onboarding ? 'pb-8' : 'pb-[calc(var(--bottom-nav,6rem)+1.5rem)] lg:pb-10'}`}>
          <ErrorBoundary resetKey={loc.pathname}>
          <Suspense fallback={<AppLoading />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/welkom" element={<Onboarding />} />
              <Route path="/openingen" element={<Openings />} />
              <Route path="/opening/:id" element={<OpeningDetail />} />
              <Route path="/cursus/:id" element={<Course />} />
              <Route path="/les/:id/:lessonId" element={<LessonRun />} />
              <Route path="/train/:familyId/:variationId" element={<TrainPage />} />
              <Route path="/variaties" element={<Variations />} />
              <Route path="/crushing" element={<Crushing />} />
              <Route path="/crushing/:id" element={<Crushing />} />
              <Route path="/advantage" element={<Advantage />} />
              <Route path="/advantage/:id" element={<Advantage />} />
              <Route path="/mastery" element={<Mastery />} />
              <Route path="/dagelijks" element={<Daily />} />
              <Route path="/repertoire" element={<RepertoireList />} />
              <Route path="/repertoire/:id" element={<RepertoireEditor />} />
              <Route path="/repertoire/:id/train" element={<RepertoireTrain />} />
              <Route path="/statistieken" element={<Statistics />} />
              <Route path="/import" element={<ImportGames />} />
              <Route path="/analyse" element={<GameReviewList />} />
              <Route path="/analyse/briljant" element={<BrilliantsView />} />
              <Route path="/analyse/:id" element={<GameReviewView />} />
              <Route path="/analyse/:id/fouten" element={<MistakeTrainerView />} />
              <Route path="/analyse/:id/naspelen" element={<ReviewReplayView />} />
              <Route path="/delen/:code" element={<SharedGameView />} />
              <Route path="/instellingen" element={<Settings />} />
              <Route path="/bronnen" element={<Sources />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
          </ErrorBoundary>
        </main>
        {!focus && !onboarding && (
          // Zwevende balk: alleen het actieve onderdeel krijgt een zichtbaar label
          // Vaste tabbalk: de pagina eindigt erboven, dus hij dekt nooit iets af en verspringt niet
          // Bodemmenu (ontwerp 14k): grote iconen in een eigen kleur; alleen de actieve tab toont zijn naam, in een vakje met rand
          <nav id="bottom-nav" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 items-start border-t-2 border-line bg-surface px-1.5 pt-2.5 lg:hidden" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }} aria-label={t('Hoofdmenu')}>
            {NAV.filter(n => n.mobile).map(n => (
              <NavLink key={n.to} to={n.to} end={n.to === '/'} aria-label={t(n.short ?? n.label)} className="flex flex-col items-center gap-1 text-[11px] font-extrabold text-brand-strong">
                {({ isActive: exact }) => {
                  // Een losse opening (/opening/…) hoort bij de tab Openingen
                  const isActive = exact || (n.to === '/openingen' && loc.pathname.startsWith('/opening/'))
                  return (
                  <>
                    <TabIcon active={isActive} color={n.color}>
                      <n.icon size={27} strokeWidth={isActive ? 2.25 : 2} aria-hidden />
                      {n.badge && due > 0 && <span className="absolute -top-1 right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-surface bg-danger px-1 text-[11px] leading-none font-extrabold text-white" aria-label={t('{n} herhalingen', { n: due })}>{due}</span>}
                    </TabIcon>
                    {isActive && <span className="animate-fade-in whitespace-nowrap">{t(n.short ?? n.label)}</span>}
                  </>
                  )
                }}
              </NavLink>
            ))}
            <MoreTab />
          </nav>
        )}
      </div>
    </div>
    </FocusContext.Provider>
  )
}

/** Icoon van een tab in het bodemmenu: actief in een groen vakje met onderrand, anders alleen het icoon in zijn eigen kleur */
function TabIcon({ active, color, children }: { active: boolean; color?: string; children: React.ReactNode }) {
  return (
    <span
      className={`relative flex h-[46px] w-[52px] items-center justify-center rounded-[14px] border-2 transition-[background-color,border-color,box-shadow] duration-150 ${active ? 'border-brand bg-brand-soft shadow-[0_3px_0_var(--brand)]' : 'border-transparent'}`}
      style={{ color: active ? 'var(--brand)' : color ?? 'var(--muted)' }}
    >
      {children}
    </span>
  )
}

/** Vijfde tab "Meer": opent van onderen een paneel met de overige onderdelen als tegels (ontwerp 12c) */
function MoreTab() {
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  const btn = useRef<HTMLButtonElement>(null)
  const first = useRef<HTMLAnchorElement>(null)
  const items = NAV.filter(n => !n.mobile)
  const tiles = items.filter(n => !n.wide)
  const rows = items.filter(n => n.wide)
  const active = items.some(n => loc.pathname.startsWith(n.to))
  useEffect(() => setOpen(false), [loc.pathname])
  useEffect(() => {
    if (!open) return
    first.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); btn.current?.focus() }
  }, [open])
  return (
    <>
      <button ref={btn} className="flex flex-col items-center gap-1 text-[11px] font-extrabold text-brand-strong" aria-label={t('Meer')} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <TabIcon active={active || open} color="var(--muted)"><Ellipsis size={27} strokeWidth={active || open ? 2.25 : 2} aria-hidden /></TabIcon>
        {(active || open) && <span className="animate-fade-in">{t('Meer')}</span>}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-labelledby="more-title">
          <div className="absolute inset-0 bg-black/40 animate-fade-in" aria-hidden onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col gap-3.5 overflow-y-auto rounded-t-[26px] bg-bg px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2.5 shadow-2xl animate-fade-up">
            <div className="mx-auto h-[5px] w-11 shrink-0 rounded-full bg-line" aria-hidden />
            <div className="flex items-center justify-between">
              <h2 id="more-title" className="text-[22px] font-extrabold tracking-[-0.02em]">{t('Meer')}</h2>
              <button className="-mr-0.5 flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-ink hover:bg-line" onClick={() => setOpen(false)} aria-label={t('Sluiten')}><X size={18} strokeWidth={2.5} aria-hidden /></button>
            </div>
            <ul className="grid grid-cols-2 gap-2.5">
              {tiles.map((n, i) => (
                <li key={n.to} className="flex">
                  <NavLink ref={i === 0 ? first : undefined} to={n.to} className={({ isActive }) => `tap flex w-full flex-col gap-2.5 p-3.5 ${isActive ? 'tap-on' : ''}`}>
                    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] ${TILE_TONE[n.tone ?? 'neutral']}`} aria-hidden><n.icon size={22} strokeWidth={2} /></span>
                    <span className="min-w-0"><span className="block font-bold leading-tight">{t(n.label)}</span>{n.desc && <span className="mt-0.5 block text-[13px] leading-snug text-muted">{t(n.desc)}</span>}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
            {rows.map(n => (
              <NavLink key={n.to} to={n.to} className={({ isActive }) => `tap flex items-center gap-3 px-3.5 py-3 ${isActive ? 'tap-on' : ''}`}>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${TILE_TONE[n.tone ?? 'neutral']}`} aria-hidden><n.icon size={18} strokeWidth={2} /></span>
                <span className="min-w-0 flex-1 font-bold">{t(n.label)}</span>
                <ChevronRight size={18} aria-hidden className="shrink-0 text-muted" />
              </NavLink>
            ))}
            {/* Feedback (voor de testfase): opent de mailapp met een kant-en-klaar bericht */}
            <a href={feedbackHref()} className="tap flex items-center gap-3 px-3.5 py-3">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${TILE_TONE.brand}`} aria-hidden><MessageSquare size={18} strokeWidth={2} /></span>
              <span className="min-w-0 flex-1"><span className="block font-bold">{t('Feedback geven')}</span><span className="block text-sm text-muted">{t('Zie je iets geks of heb je een idee? Laat het weten.')}</span></span>
              <ChevronRight size={18} aria-hidden className="shrink-0 text-muted" />
            </a>
          </div>
        </div>
      )}
    </>
  )
}

/**
 * Zet de taal vóór de app tekent, en tekent alles opnieuw als je van taal wisselt.
 * Nog niets gekozen: bestaande gebruikers houden Nederlands, nieuwe krijgen de taal van hun apparaat.
 */
function LangShell() {
  const s = useSettings()
  const lang: Lang = s?.language ?? (s?.onboarded ? 'nl' : deviceLang())
  setLang(lang)
  return <Shell key={lang} />
}

export default function App() {
  return (
    <HashRouter>
      <ThemeSync />
      <PersistStorage />
      <RouteMemory />
      <ScrollTop />
      <LangShell />
    </HashRouter>
  )
}
