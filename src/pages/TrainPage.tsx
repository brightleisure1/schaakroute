import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { useFamily, useProgressMap } from '../lib/hooks'
import { displayName, relatedVariations } from '../lib/data'
import { courseOrder, variationLine } from '../lib/daily'
import { db } from '../lib/db'
import { addLine } from '../lib/repertoire'
import { startSession, endSession } from '../lib/progress'
import { Trainer, ResultNumbers, type LineResult } from '../components/Trainer'
import { Confetti, ErrorBox, Spinner, Stars, Tabs } from '../components/ui'
import type { FamilyFile, TrainMode, Variation } from '../lib/types'

export function TrainPage() {
  const { familyId, variationId } = useParams()
  const [search, setSearch] = useSearchParams()
  const mode = (search.get('mode') as TrainMode) || 'learn'
  const { data: file, error } = useFamily(familyId)
  const [sessionId, setSessionId] = useState<number>()
  const [fire, setFire] = useState(0)
  const variation = file?.variations.find(v => v.id === variationId)
  const line = useMemo(() => (file && variation ? variationLine(file, variation) : null), [file, variation])

  useEffect(() => {
    if (!familyId) return
    let id: number | undefined
    startSession('variation', familyId).then(s => { id = s; setSessionId(s) })
    return () => { if (id) endSession(id, {}) }
  }, [familyId, variationId, mode])

  useEffect(() => {
    if (variation && file) document.title = `${displayName(variation, file.family.name)} · SchaakRoute`
  }, [variation, file])

  if (error) return <ErrorBox error={error} />
  if (!file || !line) return <Spinner />
  if (!variation) return <ErrorBox error="Variant niet gevonden" />

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link to={`/opening/${file.family.id}`} className="text-sm text-muted hover:text-ink">← {file.family.name}</Link>
        <Tabs<TrainMode>
          value={mode}
          onChange={m => setSearch({ mode: m })}
          options={[{ value: 'learn', label: 'Leren' }, { value: 'practice', label: 'Oefenen' }, { value: 'mastery', label: 'Mastery' }]}
        />
      </div>
      <Confetti fire={fire} />
      <Trainer
        key={line.key + mode}
        line={line}
        mode={mode}
        family={file}
        sessionId={sessionId}
        onComplete={r => { if (r.stars === 3 || r.badges.length) setFire(f => f + 1) }}
        renderEnd={(r, restart) => <EndScreen file={file} variation={variation} result={r} mode={mode} restart={restart} />}
      />
    </div>
  )
}

function EndScreen({ file, variation, result, mode, restart }: { file: FamilyFile; variation: Variation; result: LineResult; mode: TrainMode; restart: () => void }) {
  const nav = useNavigate()
  const progress = useProgressMap(file.family.id)
  const related = relatedVariations(file, variation)
  const next = courseOrder(file).find(v => v.id !== variation.id && !progress.get(v.id)?.completions)
  const reps = useLiveQuery(() => db.repertoires.where('side').equals(file.family.side).toArray(), [file.family.side], [])
  const [repMsg, setRepMsg] = useState<string | null>(null)

  async function addToRepertoire(repId?: number) {
    let id = repId
    if (!id) id = (await db.repertoires.add({ name: `Mijn ${file.family.name}`, side: file.family.side, familyId: file.family.id, createdAt: Date.now(), updatedAt: Date.now() })) as number
    const r = await addLine(id, file.family.side, variation.uci)
    setRepMsg(r.conflicts.length
      ? `Toegevoegd. Let op: op ${r.conflicts.length} plek(ken) had je al een andere hoofdzet (${r.conflicts.map(c => `${c.existing} i.p.v. ${c.added}`).join(', ')}); de nieuwe zet is als alternatief bewaard.`
      : r.added ? `${r.added} zetten toegevoegd aan je repertoire.` : 'Deze variant staat al in je repertoire.')
  }

  return (
    <div className="mx-auto grid max-w-3xl gap-4 md:grid-cols-2">
      <div className="card p-6 text-center animate-pop">
        <div className="text-4xl">{mode === 'learn' ? '📘' : result.stars === 3 ? '🏆' : '✅'}</div>
        <h2 className="mt-2 text-xl font-bold">{mode === 'learn' ? 'Variant doorlopen!' : 'Variant afgerond!'}</h2>
        <div className="text-sm text-muted">{displayName(variation, file.family.name)}</div>
        {mode !== 'learn' && <div className="mt-2"><Stars count={result.stars} size="text-3xl" /></div>}
        <ResultNumbers result={result} />
        <div className="mt-4 grid gap-2">
          {mode === 'learn'
            ? <button className="btn btn-primary" onClick={() => nav(`?mode=practice`)}>Nu zelf oefenen (zonder pijlen)</button>
            : <button className="btn btn-primary" onClick={restart}>Dezelfde variant opnieuw</button>}
          {mode === 'learn' && <button className="btn btn-ghost" onClick={restart}>Nog eens doorlopen</button>}
          {next && <Link className="btn btn-ghost" to={`/train/${file.family.id}/${next.id}?mode=learn`}>Volgende training: {displayName(next, file.family.name)}</Link>}
          <Link className="btn btn-ghost" to={`/opening/${file.family.id}`}>Terug naar de variantenboom</Link>
        </div>
      </div>
      <div className="space-y-4">
        <div className="card p-4">
          <h3 className="font-semibold">Toevoegen aan repertoire</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {reps.map(r => <button key={r.id} className="btn btn-ghost" onClick={() => addToRepertoire(r.id)}>+ {r.name}</button>)}
            <button className="btn btn-ghost" onClick={() => addToRepertoire()}>+ Nieuw repertoire</button>
          </div>
          {repMsg && <p className="mt-2 text-sm text-brand-strong">{repMsg}</p>}
        </div>
        {related.length > 0 && (
          <div className="card p-4">
            <h3 className="font-semibold">Verwante varianten</h3>
            <ul className="mt-2 space-y-1">
              {related.map(v => (
                <li key={v.id}>
                  <Link className="flex justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2" to={`/train/${file.family.id}/${v.id}?mode=${mode === 'learn' ? 'learn' : 'practice'}`}>
                    <span className="truncate">{displayName(v, file.family.name)}</span>
                    <span className="shrink-0 text-xs text-muted">{progress.get(v.id)?.bestStars ? '★'.repeat(progress.get(v.id)!.bestStars) : v.eco}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
