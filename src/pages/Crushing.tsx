import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { loadPuzzles } from '../lib/data'
import { useAsync, useManifest } from '../lib/hooks'
import { endSession, startSession } from '../lib/progress'
import { CrushingPuzzle } from '../components/CrushingPuzzle'
import { FilterKey, PillChoice, TrainingHeading, TrainingSheet, TrainingTopBar, useCloseTraining } from '../components/TrainingModeChrome'
import { Confetti, Empty, ErrorBox, Spinner, nf, useSettings } from '../components/ui'
import { FamilyPicker } from './Variations'

const DEFAULT_RANGE = 300

/** Afstraffen (ontwerp 10l): trainingsmodus met alleen sluiten, voortgang en het bord; filters achter één knop */
export function Crushing() {
  const { id: paramId } = useParams()
  const nav = useNavigate()
  const close = useCloseTraining()
  const settings = useSettings()
  const { data: manifest, error } = useManifest()
  const id = paramId ?? settings?.openings[0] ?? manifest?.families[0]?.id
  const puzzles = useAsync(() => (id ? loadPuzzles(id) : Promise.resolve(null)), [id])
  const progress = useLiveQuery(() => (id ? db.puzzles.where('familyId').equals(id).toArray() : []), [id], [])
  const [range, setRange] = useState(DEFAULT_RANGE)
  const [variation, setVariation] = useState('')
  const [current, setCurrent] = useState<string | null>(null)
  const [fire, setFire] = useState(0)
  const [sheet, setSheet] = useState(false)
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
  const family = manifest.families.find(f => f.id === id)
  const solvedInPool = pool.filter(p => solvedIds.has(p.id)).length
  const filtered = range !== DEFAULT_RANGE || !!variation

  const heading = (
    <TrainingHeading
      tone="danger"
      label={`Afstraffen${family ? ` · ${family.name}` : ''}`}
      title="Vind de sterkste zet"
      action={<FilterKey onClick={() => setSheet(true)} expanded={sheet} active={filtered} label="Opening en filters" />}
    />
  )

  return (
    <div className="flex flex-col gap-2.5">
      <TrainingTopBar
        value={pool.length ? solvedInPool / pool.length : 0}
        count={`${solvedInPool}/${pool.length}`}
        countLabel={`${solvedInPool} van ${pool.length} puzzels opgelost`}
        onClose={close}
        closeLabel="Stoppen met afstraffen"
      />
      <Confetti fire={fire} />
      {puzzles.loading ? <><div>{heading}</div><Spinner /></> : puzzles.error ? <><div>{heading}</div><ErrorBox error={puzzles.error} /></> : !puzzle ? (
        <>
          <div>{heading}</div>
          <Empty title="Geen puzzels in dit bereik" action={<button type="button" className="btn btn-primary" onClick={() => setSheet(true)}>Filters aanpassen</button>}>
            Kies een breder niveau of een andere variant.
          </Empty>
        </>
      ) : (
        <CrushingPuzzle
          key={puzzle.id}
          puzzle={puzzle}
          familyId={id!}
          heading={heading}
          onDone={r => r.solved && setFire(f => f + 1)}
          onNext={() => setCurrent(pick())}
        />
      )}

      <TrainingSheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="Opening en filters"
        footer={<button type="button" className="btn btn-primary w-full" onClick={() => setSheet(false)}>Klaar</button>}
      >
        <div>
          <div className="mb-2 text-sm font-semibold" aria-hidden>Opening</div>
          <div className="[&_select]:max-w-none">
            <FamilyPicker value={id ?? ''} onChange={v => nav(`/crushing/${v}`, { replace: true })} families={manifest.families} mine={settings.openings} />
          </div>
        </div>
        <PillChoice
          legend="Moeilijkheid"
          value={range}
          onChange={setRange}
          options={[
            { value: 150, label: '± 150' },
            { value: 300, label: '± 300' },
            { value: 600, label: 'Breed (± 600)' },
            { value: 5000, label: 'Alle niveaus' },
          ]}
          hint={`Puzzels rond jouw rating (${elo}). Je rating pas je aan in Instellingen.`}
        />
        {variations.length > 1 && (
          <div>
            <label className="mb-2 block text-sm font-semibold" htmlFor="crushing-variation">Variant</label>
            <select id="crushing-variation" className="input min-h-11" value={variation} onChange={e => setVariation(e.target.value)}>
              <option value="">Alle varianten</option>
              {variations.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        )}
        <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted" aria-live="polite">
          <b className="text-ink">{nf(pool.length)}</b> puzzels in deze keuze · <b className="text-ink">{nf(solvedInPool)}</b> opgelost
        </p>
      </TrainingSheet>
    </div>
  )
}
