import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { buildDailyPlan, estimateMinutes, type DailyItem } from '../lib/daily'
import { loadFamily } from '../lib/data'
import { db, saveSettings, today } from '../lib/db'
import { endSession, markDailyComplete, startSession, checkBadges } from '../lib/progress'
import { Trainer, type LineResult } from '../components/Trainer'
import { PuzzleTrainer } from '../components/PuzzleTrainer'
import { Confetti, Empty, ProgressBar, Spinner, useSettings } from '../components/ui'
import type { FamilyFile } from '../lib/types'
import type { BadgeDef } from '../lib/gamification'

const KIND_LABEL: Record<DailyItem['kind'], string> = { review: 'Herhaling', new: 'Nieuwe zetten', hard: 'Moeilijke variant', puzzle: 'Tactische kans' }

export function Daily() {
  const settings = useSettings()
  const [plan, setPlan] = useState<DailyItem[] | null>(null)
  const [started, setStarted] = useState(false)
  const [index, setIndex] = useState(0)
  const [files, setFiles] = useState<Map<string, FamilyFile>>(new Map())
  const [sessionId, setSessionId] = useState<number>()
  const totals = useRef({ correct: 0, mistakes: 0, newPositions: 0, reviews: 0, xp: 0, puzzles: 0 })
  const [summary, setSummary] = useState<null | { correct: number; mistakes: number; newPositions: number; reviews: number; xp: number; puzzles: number; badges: BadgeDef[] }>(null)
  const startXp = useRef(0)

  useEffect(() => {
    if (!settings || plan) return
    buildDailyPlan(settings).then(async p => {
      setPlan(p)
      const ids = [...new Set(p.map(i => (i.kind === 'review' ? i.card.familyIds[0] : i.familyId)).filter(Boolean))] as string[]
      const loaded = await Promise.all(ids.map(id => loadFamily(id).catch(() => null)))
      setFiles(new Map(loaded.filter(Boolean).map(f => [f!.family.id, f!])))
    })
  }, [settings, plan])

  async function start() {
    setStarted(true)
    startXp.current = ((await db.meta.get('xp'))?.value as number) ?? 0
    setSessionId(await startSession('daily'))
    saveSettings({ lastRoute: '/dagelijks', lastRouteLabel: 'Dagelijkse training' }).catch(() => {})
  }

  async function finish() {
    if (sessionId) await endSession(sessionId, { correct: totals.current.correct, mistakes: totals.current.mistakes, newCards: totals.current.newPositions, reviewedCards: totals.current.reviews })
    await markDailyComplete()
    const badges = await checkBadges()
    const xpNow = ((await db.meta.get('xp'))?.value as number) ?? 0
    setSummary({ ...totals.current, xp: xpNow - startXp.current, badges })
  }

  function advance(r?: LineResult, item?: DailyItem) {
    if (r && item) {
      totals.current.correct += r.correctFirstTry
      totals.current.mistakes += r.mistakes
      if (item.kind === 'review') totals.current.reviews += 1
      else totals.current.newPositions += r.newCards
    }
    const next = index + 1
    setIndex(next)
    if (plan && next >= plan.length) finish()
  }

  if (!settings || !plan) return <Spinner label="Dagelijkse training samenstellen…" />

  if (summary) {
    return (
      <div className="mx-auto max-w-lg">
        <Confetti fire={1} />
        <div className="card p-6 text-center animate-pop">
          <div className="text-5xl">☀️</div>
          <h1 className="mt-2 text-2xl font-extrabold">Dagelijkse training voltooid!</h1>
          <p className="text-muted">{today()}</p>
          <div className="mt-5 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            <Stat label="Goede zetten" value={summary.correct} />
            <Stat label="Fouten" value={summary.mistakes} />
            <Stat label="Nieuwe posities" value={summary.newPositions} />
            <Stat label="Herhaalde posities" value={summary.reviews} />
            <Stat label="Puzzels" value={summary.puzzles} />
            <Stat label="Verdiende XP" value={`+${summary.xp}`} />
          </div>
          {summary.badges.map(b => <div key={b.id} className="mt-3 rounded-xl bg-accent-soft p-2 text-sm">{b.icon} Nieuwe badge: <b>{b.title}</b></div>)}
          <div className="mt-5 grid gap-2">
            <Link to="/statistieken" className="btn btn-primary">Bekijk je voortgang</Link>
            <Link to="/" className="btn btn-ghost">Naar het dashboard</Link>
          </div>
        </div>
      </div>
    )
  }

  if (!plan.length) {
    return <Empty title="Niets te doen vandaag" action={<Link to="/openingen" className="btn btn-primary">Kies openingen</Link>}>Alle varianten van je gekozen openingen zijn geleerd en er zijn geen herhalingen. Kies extra openingen of oefen in Mastery.</Empty>
  }

  if (!started) {
    const counts = plan.reduce((a, i) => ({ ...a, [i.kind]: (a[i.kind] ?? 0) + 1 }), {} as Record<string, number>)
    return (
      <div className="mx-auto max-w-lg">
        <div className="card p-6">
          <h1 className="text-2xl font-extrabold">Dagelijkse training</h1>
          <p className="mt-1 text-muted">Eén doorlopende sessie van ongeveer {estimateMinutes(plan)} minuten (doel: {settings.dailyMinutes}).</p>
          <ul className="mt-4 space-y-2 text-sm">
            {counts.review ? <li>🔁 <b>{counts.review}</b> herhalingen (eerdere fouten eerst)</li> : <li className="text-muted">🔁 Geen openstaande herhalingen</li>}
            {counts.new ? <li>✨ <b>{counts.new / 2}</b> nieuwe varianten (leren en direct zelf spelen)</li> : null}
            {counts.hard ? <li>💪 <b>{counts.hard}</b> moeilijke varianten opnieuw</li> : null}
            {counts.puzzle ? <li>⚔️ <b>{counts.puzzle}</b> tactische openingskansen op jouw niveau</li> : null}
          </ul>
          <div className="mt-4 flex gap-2 text-sm">
            {([5, 10, 15, 20] as const).map(m => (
              <button key={m} className={`chip ${settings.dailyMinutes === m ? 'chip-on' : ''}`} onClick={async () => { await saveSettings({ dailyMinutes: m }); setPlan(null) }}>{m} min</button>
            ))}
          </div>
          <button className="btn btn-primary mt-5 w-full py-3 text-base" onClick={start} autoFocus>Start</button>
        </div>
      </div>
    )
  }

  const item = plan[Math.min(index, plan.length - 1)]
  const header = (
    <div className="mb-2">
      <ProgressBar value={index / plan.length} />
      <div className="mt-1 flex justify-between text-xs text-muted"><span>{KIND_LABEL[item.kind]}{item.kind === 'new' ? (item.mode === 'learn' ? ' · leren' : ' · zelf spelen') : ''}</span><span>{index + 1} / {plan.length}</span></div>
    </div>
  )
  if (index >= plan.length) return <Spinner label="Afronden…" />

  if (item.kind === 'puzzle') {
    return (
      <div>
        {header}
        <PuzzleTrainer key={item.puzzle.id + index} puzzle={item.puzzle} familyId={item.familyId} nextLabel="Verder" onDone={r => { totals.current.puzzles++; if (r.solved) totals.current.correct++; else totals.current.mistakes += r.mistakes }} onNext={() => advance()} />
      </div>
    )
  }
  const file = item.kind === 'review' ? files.get(item.card.familyIds[0]) : files.get(item.familyId)
  const line = item.kind === 'review' ? { ...item.line, title: 'Vind de zet', subtitle: file?.family.name } : item.line
  const mode = item.kind === 'review' ? 'review' : item.mode
  return (
    <Trainer
      key={line.key + mode + index}
      line={line}
      mode={mode}
      family={file}
      sessionId={sessionId}
      header={header}
      autoIntro={mode === 'learn'}
      renderEnd={r => (
        <div className="card mx-auto max-w-sm p-5 text-center animate-pop">
          {header}
          <div className="text-3xl">{r.mistakes + r.hints + r.shown === 0 ? '✅' : '🔁'}</div>
          <p className="mt-1 font-semibold">{mode === 'learn' ? 'Doorlopen — nu zelf!' : r.mistakes + r.hints + r.shown === 0 ? 'Foutloos!' : 'Afgerond — oefent later opnieuw.'}</p>
          <button className="btn btn-primary mt-4 w-full" autoFocus onClick={() => advance(r, item)}>Verder</button>
        </div>
      )}
    />
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return <div className="rounded-xl bg-surface-2 p-3"><div className="text-xl font-bold">{value}</div><div className="text-muted">{label}</div></div>
}
