import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { BookMarked, ChartColumn, ChessKnight, Download, GitBranch, House, Menu, Repeat, Settings as SettingsIcon, Sun, Swords, TrendingUp, X, type LucideIcon } from 'lucide-react'
import { HashRouter, NavLink, Navigate, Route, Routes, useLocation } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './lib/db'
import { Spinner, useSettings } from './components/ui'
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
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })))
const Sources = lazy(() => import('./pages/Sources').then(m => ({ default: m.Sources })))

// Navigatie in drie groepen. De trainingsmodi houden bewust hun Engelse namen (Course, Variations, …).
const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Trainen',
    items: [
      { to: '/', label: 'Start', icon: House, mobile: true },
      { to: '/dagelijks', label: 'Daily Training', short: 'Daily', icon: Sun, mobile: true },
      { to: '/mastery', label: 'Mastery', icon: Repeat, mobile: true, badge: true },
      { to: '/openingen', label: 'Openingen', icon: ChessKnight, mobile: true },
      { to: '/variaties', label: 'Variations', icon: GitBranch },
    ],
  },
  {
    title: 'Verdiepen',
    items: [
      { to: '/crushing', label: 'Crushing', icon: Swords },
      { to: '/advantage', label: 'Advantage', icon: TrendingUp },
      { to: '/repertoire', label: 'Repertoire', icon: BookMarked },
      { to: '/import', label: 'Mijn partijen', icon: Download },
    ],
  },
  {
    title: 'Jij',
    items: [
      { to: '/statistieken', label: 'Statistieken', icon: ChartColumn },
      { to: "/instellingen", label: "Instellingen", icon: SettingsIcon },
    ],
  },
]
interface NavItem { to: string; label: string; short?: string; icon: LucideIcon; mobile?: boolean; badge?: boolean }
const NAV = NAV_GROUPS.flatMap(g => g.items)
// Op deze schermen wordt getraind: geen bodemnavigatie, zodat bord, feedback en knoppen in beeld blijven.
// Daily en Mastery staan zelf in het bodemmenu en houden het menu, ook tijdens het trainen.
const FOCUS_ROUTES = /^\/(train|les|crushing|advantage|repertoire\/\d+\/train)/

/**
 * Zet --bottom-nav op de pagina: de ruimte die het zwevende menu inneemt. Vastgeplakte knoppen blijven erboven
 * en scrollen (scroll-padding) houdt er rekening mee, zodat het menu nooit een knop afdekt.
 */
function BottomNavSpace({ active }: { active: boolean }) {
  useEffect(() => {
    const root = document.documentElement
    if (active) root.style.setProperty('--bottom-nav', 'calc(5.25rem + env(safe-area-inset-bottom))')
    else root.style.removeProperty('--bottom-nav')
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
    const apply = () => document.documentElement.classList.toggle('dark', s.theme === 'dark' || (s.theme === 'system' && mq.matches))
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
        <ChessKnight size={32} strokeWidth={1.5} aria-hidden className="mx-auto text-muted" />
        <h2 className="mt-2 font-bold">Er ging iets mis op deze pagina</h2>
        <p className="mt-1 text-sm text-muted">{this.state.error.message}</p>
        <p className="mt-1 text-xs text-muted">Je voortgang is veilig opgeslagen.</p>
        <button className="btn btn-primary mt-4" onClick={() => this.setState({ error: null })}>Opnieuw proberen</button>
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

function Shell() {
  const settings = useSettings()
  const due = useLiveQuery(() => db.cards.where('dueAt').belowOrEqual(Date.now()).filter(c => !c.suspended).count(), [], 0)
  const loc = useLocation()
  if (!settings) return <Spinner />
  const onboarding = loc.pathname === '/welkom' && !settings.onboarded
  if (!settings.onboarded && loc.pathname !== '/welkom' && loc.pathname !== '/bronnen') return <Navigate to="/welkom" replace />
  const focus = FOCUS_ROUTES.test(loc.pathname)
  const navClass = ({ isActive }: { isActive: boolean }) => `flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-brand-soft text-brand-strong' : 'text-muted hover:bg-surface-2 hover:text-ink'}`
  return (
    <div className="min-h-dvh lg:flex">
      <BottomNavSpace active={!focus && !onboarding} />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:shadow-lg">Naar de inhoud</a>
      {!onboarding && (
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col overflow-y-auto border-r border-line bg-surface px-3 py-5 lg:flex">
          <NavLink to="/" className="mb-5 flex items-center gap-2 px-2 text-xl font-extrabold tracking-tight">
            <img src="./icon.svg" alt="" className="h-9 w-9" /><span>Schaak<span className="text-brand-strong">Route</span></span>
          </NavLink>
          <nav aria-label="Hoofdmenu" className="flex flex-col gap-4">
            {NAV_GROUPS.map(g => (
              <div key={g.title}>
                <h2 className="px-3 pb-1 text-xs font-semibold text-muted">{g.title}</h2>
                <ul className="flex flex-col gap-0.5">
                  {g.items.map(n => (
                    <li key={n.to}>
                      <NavLink to={n.to} end={n.to === '/'} className={navClass}>
                        <n.icon size={18} strokeWidth={1.75} aria-hidden />{n.label}
                        {n.badge && due > 0 && <span className="ml-auto rounded-full bg-accent px-2 text-xs font-bold text-ink" aria-label={`${due} herhalingen`}>{due}</span>}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
          <div className="mt-auto px-2 pt-4 text-xs text-muted">Gratis en open source · <NavLink to="/bronnen" className="underline">bronnen</NavLink></div>
        </aside>
      )}

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-bg/90 px-4 py-2 backdrop-blur lg:hidden">
          <NavLink to="/" className="flex min-h-11 items-center gap-2 text-lg font-extrabold"><img src="./icon.svg" alt="" className="h-8 w-8" /><span>Schaak<span className="text-brand-strong">Route</span></span></NavLink>
          {!onboarding && <MoreMenu due={due} />}
        </header>
        <main id="main" className={`mx-auto w-full max-w-6xl px-4 pt-5 sm:px-6 lg:pb-10 lg:pt-8 ${focus || onboarding ? 'pb-8' : 'pb-28'}`}>
          <ErrorBoundary resetKey={loc.pathname}>
          <Suspense fallback={<Spinner />}>
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
              <Route path="/instellingen" element={<Settings />} />
              <Route path="/bronnen" element={<Sources />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
          </ErrorBoundary>
        </main>
        {!focus && !onboarding && (
          // Zwevende balk: alleen het actieve onderdeel krijgt een zichtbaar label
          <nav className="fixed inset-x-4 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 flex h-16 gap-1 rounded-full border border-(--nav-border) bg-(--nav-bg) p-1.5 shadow-(--nav-shadow) backdrop-blur-md lg:hidden" aria-label="Hoofdmenu">
            {NAV.filter(n => n.mobile).map(n => (
              <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `relative flex min-w-0 basis-0 items-center justify-center gap-3.5 rounded-full text-sm font-bold transition-[flex-grow,background-color,color] duration-300 motion-reduce:transition-none ${isActive ? 'grow-[1.6] bg-(--nav-active-bg) text-(--nav-active-ink)' : 'grow text-(--nav-ink) hover:text-(--nav-hover)'}`}>
                {({ isActive }) => (
                  <>
                    <span className="relative shrink-0">
                      <n.icon size={22} strokeWidth={2} aria-hidden />
                      {n.badge && due > 0 && <span className="absolute -right-3 -top-2.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-(--nav-bg) bg-(--nav-badge) px-1 text-xs font-extrabold text-(--nav-badge-ink)" aria-label={`${due} herhalingen`}>{due}</span>}
                    </span>
                    <span className={isActive ? 'truncate' : 'sr-only'}>{n.short ?? n.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        )}
      </div>
    </div>
  )
}

function MoreMenu({ due }: { due: number }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const loc = useLocation()
  useEffect(() => setOpen(false), [loc.pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown) }
  }, [open])
  return (
    <div className="relative" ref={ref}>
      <button className="btn btn-ghost min-h-11 min-w-11 px-3" aria-label={open ? 'Menu sluiten' : 'Menu openen'} aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen(o => !o)}>
        {open ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
      </button>
      {open && (
        <nav id="mobile-menu" aria-label="Alle onderdelen" className="card absolute right-0 z-40 mt-2 max-h-[75dvh] w-64 overflow-y-auto p-2 shadow-xl animate-fade-up">
          {NAV_GROUPS.map(g => (
            <div key={g.title} className="py-1">
              <h2 className="px-3 pb-1 text-xs font-semibold text-muted">{g.title}</h2>
              {g.items.map(n => (
                <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm ${isActive ? 'bg-brand-soft text-brand-strong' : 'hover:bg-surface-2'}`}>
                  <n.icon size={18} strokeWidth={1.75} aria-hidden />{n.label}
                  {n.badge && due > 0 && <span className="ml-auto rounded-full bg-accent px-2 text-xs font-bold text-ink">{due}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      )}
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <ThemeSync />
      <RouteMemory />
      <ScrollTop />
      <Shell />
    </HashRouter>
  )
}
