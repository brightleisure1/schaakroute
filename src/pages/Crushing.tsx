import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { loadPuzzles } from '../lib/data'
import { useAsync, useManifest } from '../lib/hooks'
import { endSession, startSession } from '../lib/progress'
import { PuzzleTrainer } from '../components/PuzzleTrainer'
import { Confetti, ErrorBox, PageHeader, Spinner, useSettings } from '../components/ui'
import { FamilyPicker } from './Variations'

export function Crushing() {
  const { id: paramId } = useParams()
  const nav = useNavigate()
  const settings = useSettings()
  const { data: manifest, error } = useManifest()
  const id = paramId ?? settings?.openings[0] ?? manifest?.families[0]?.id
  const puzzles = useAsync(() => (id ? loadPuzzles(id) : Promise.resolve(null)), [id])
  const progress = useLiveQuery(() => (id ? db.puzzles.where('familyId').equals(id).toArray() : []), [id], [])
  const [range, setRange] = useState(300)
  const [variation, setVariation] = useState('')
  const [current, setCurrent] = useState<string | null>(null)
  const [fire, setFire] = useState(0)
  const [sessionId, setSessionId] = useState<number>()
  const elo = settings?.elo ?? 1500

  useEffect(() => {
    let sid: number | undefined
    startSession('crushing', id).then(s => { sid = s; setSessionId(s) })
    return () => { if (sid) endSession(sid, {}) }
  }, [id])
  void sessionId

  const solvedIds = new Set(progress.filter(p => p.solved > 0).map(p => p.id))
  const pool = useMemo(() => {
    const list = puzzles.data?.puzzles ?? []
    return list.filter(p => Math.abs(p.rating - elo) <= range && (!variation || p.variation === variation))
  }, [puzzles.data, elo, range, variation])
  const variations = useMemo(() => [...new Set((puzzles.data?.puzzles ?? []).map(p => p.variation).filter(Boolean))].sort() as string[], [puzzles.data])

  const pick = () => {
    const fresh = pool.filter(p => !solvedIds.has(p.id) && p.id !== current)
    const from = fresh.length ? fresh : pool.filter(p => p.id !== current)
    return from[Math.floor(Math.random() * from.length)]?.id ?? null
  }
  useEffect(() => { setCurrent(null) }, [id, range, variation])
  // Ook opnieuw kiezen als de lijst verandert (bijv. als je rating uit de instellingen later binnenkomt)
  useEffect(() => { if (pool.length && !pool.some(p => p.id === current)) setCurrent(pick()) }, [current, pool]) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <ErrorBox error={error} />
  if (!manifest || !settings) return <Spinner />
  const puzzle = pool.find(p => p.id === current)

  return (
    <div>
      <PageHeader title="Crushing" subtitle="Je tegenstander maakt een fout in de opening: vind de zet die hem afstraft. Alle stellingen komen uit echte partijen." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FamilyPicker value={id ?? ''} onChange={v => nav(`/crushing/${v}`)} families={manifest.families} mine={settings.openings} />
        <select className="input sm:max-w-xs" value={range} onChange={e => setRange(Number(e.target.value))} aria-label="Moeilijkheid">
          <option value={150}>Rond mijn rating ({elo} ± 150)</option>
          <option value={300}>Rond mijn rating ({elo} ± 300)</option>
          <option value={600}>Breed ({elo} ± 600)</option>
          <option value={5000}>Alle niveaus</option>
        </select>
        {variations.length > 1 && (
          <select className="input sm:max-w-xs" value={variation} onChange={e => setVariation(e.target.value)} aria-label="Variant">
            <option value="">Alle varianten</option>
            {variations.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        )}
        <span className="text-sm text-muted">{pool.length} puzzels · {pool.filter(p => solvedIds.has(p.id)).length} opgelost</span>
      </div>
      <Confetti fire={fire} />
      {puzzles.loading ? <Spinner /> : !puzzle ? (
        <div className="card p-6 text-center text-muted">Geen puzzels in dit bereik. Kies een breder niveau.</div>
      ) : (
        <PuzzleTrainer
          key={puzzle.id}
          puzzle={puzzle}
          familyId={id!}
          onDone={r => r.solved && setFire(f => f + 1)}
          onNext={() => setCurrent(pick())}
        />
      )}
    </div>
  )
}
