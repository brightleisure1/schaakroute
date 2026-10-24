import { Component, lazy, Suspense, useEffect, type ReactNode } from 'react'
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

const NAV = [
  { to: '/', label: 'Start', icon: '⌂', mobile: true },
  { to: '/openingen', label: 'Openingen', icon: '♞', mobile: true },
  { to: '/dagelijks', label: 'Dagelijks', icon: '☀', mobile: true },
  { to: '/mastery', label: 'Mastery', icon: '🔁', mobile: true },
  { to: '/variaties', label: 'Variaties', icon: '🌳' },
  { to: '/crushing', label: 'Crushing', icon: '⚔' },
  { to: '/advantage', label: 'Advantage', icon: '📈' },
  { to: '/repertoire', label: 'Repertoire', icon: '📖' },
  { to: '/statistieken', label: 'Statistieken', icon: '📊' },
  { to: '/import', label: 'Mijn partijen', icon: '⤓' },
  { to: '/instellingen', label: 'Instellingen', icon: '⚙' },
]

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
        <div className="text-3xl">♘</div>
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
      db.settings.update('me', { lastRoute: p, lastRouteLabel: document.title }).catch(() => {})
    }
  }, [loc])
  return null
}

function Shell() {
  const settings = useSettings()
  const due = useLiveQuery(() => db.cards.where('dueAt').belowOrEqual(Date.now()).filter(c => !c.suspended).count(), [], 0)
  const loc = useLocation()
  if (!settings) return <Spinner />
  if (!settings.onboarded && loc.pathname !== '/welkom' && loc.pathname !== '/bronnen') return <Navigate to="/welkom" replace />
  return (
    <div className="min-h-dvh lg:flex">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface px-3 py-5 lg:flex">
        <NavLink to="/" className="mb-6 flex items-center gap-2 px-2 text-xl font-extrabold tracking-tight">
          <img src="./icon.svg" alt="" className="h-8 w-8" /> SchaakRoute
        </NavLink>
        <nav className="flex flex-col gap-0.5">
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-brand-soft text-brand-strong' : 'text-muted hover:bg-surface-2 hover:text-ink'}`}>
              <span className="w-5 text-center" aria-hidden>{n.icon}</span>{n.label}
              {n.to === '/mastery' && due > 0 && <span className="ml-auto rounded-full bg-accent px-2 text-xs font-bold text-white">{due}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto px-2 text-xs text-muted">Gratis & open source · <NavLink to="/bronnen" className="underline">bronnen</NavLink></div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-bg/90 px-4 py-3 backdrop-blur lg:hidden">
          <NavLink to="/" className="flex items-center gap-2 text-lg font-extrabold"><img src="./icon.svg" alt="" className="h-7 w-7" />SchaakRoute</NavLink>
          <MoreMenu />
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:pb-10 lg:pt-8">
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
        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/95 backdrop-blur lg:hidden" aria-label="Hoofdmenu">
          {NAV.filter(n => n.mobile).map(n => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${isActive ? 'text-brand' : 'text-muted'}`}>
              <span className="text-lg leading-none" aria-hidden>{n.icon}</span>{n.label}
              {n.to === '/mastery' && due > 0 && <span className="absolute right-[22%] top-1 rounded-full bg-accent px-1.5 text-[10px] font-bold text-white">{due}</span>}
            </NavLink>
          ))}
          <NavLink to="/repertoire" className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${isActive ? 'text-brand' : 'text-muted'}`}>
            <span className="text-lg leading-none" aria-hidden>📖</span>Repertoire
          </NavLink>
        </nav>
      </div>
    </div>
  )
}

function MoreMenu() {
  return (
    <details className="relative">
      <summary className="btn btn-ghost list-none px-3 py-1.5" aria-label="Meer">☰</summary>
      <div className="card absolute right-0 z-40 mt-2 w-56 p-2 shadow-xl">
        {NAV.filter(n => !n.mobile).map(n => (
          <NavLink key={n.to} to={n.to} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-surface-2" onClick={e => (e.currentTarget.closest('details') as HTMLDetailsElement)?.removeAttribute('open')}>
            <span className="w-5 text-center" aria-hidden>{n.icon}</span>{n.label}
          </NavLink>
        ))}
      </div>
    </details>
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
