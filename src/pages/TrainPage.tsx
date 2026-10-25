import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight } from 'lucide-react'
import { useFamily, useProgressMap } from '../lib/hooks'
import { displayName, relatedVariations } from '../lib/data'
import { courseOrder, variationLine } from '../lib/daily'
import { db, saveSettings } from '../lib/db'
import { addLine } from '../lib/repertoire'
import { startSession, endSession } from '../lib/progress'
import { Trainer, type LineResult } from '../components/Trainer'
import { Confetti, ErrorBox, Spinner, Tabs } from '../components/ui'
import type { FamilyFile, TrainMode, Variation } from '../lib/types'

const MODE_NAME: Record<string, string> = { learn: 'Leren', practice: 'Oefenen', mastery: 'Mastery' }

export function TrainPage() {
  const { familyId, variationId } = useParams()
  const [search, setSearch] = useSearchParams()
  const mode = (search.get('mode') as TrainMode) || 'learn'
  const { data: file, error } = useFamily(familyId)
  const [sessionId, setSessionId] = useState<number>()
  const [fire, setFire] = useState(0)
  const inProgress = useRef(false)
  const variation = file?.variations.find(v => v.id === variationId)
  const line = useMemo(() => (file && variation ? variationLine(file, variation) : null), [file, variation])

  useEffect(() => {
    if (!familyId) return
    let id: number | undefined
    startSession('variation', familyId).then(s => { id = s; setSessionId(s) })
    return () => { if (id) endSession(id, {}) }
  }, [familyId, variationId, mode])

  useEffect(() => {
    if (!variation || !file) return
    const name = displayName(variation, file.family.name)
    document.title = `${name} · SchaakRoute`
    saveSettings({ lastRouteLabel: `${file.family.name}: ${name}` }).catch(() => {})
  }, [variation, file])

  if (error) return <ErrorBox error={error} />
  if (!file || !line) return <Spinner />
  if (!variation) return <ErrorBox error="Variant niet gevonden" />

  function switchMode(m: TrainMode) {
    // per ongeluk wisselen midden in een lijn zou je voortgang in die lijn wissen
    if (inProgress.current && m !== mode && !window.confirm(`Je bent halverwege deze variant. Overschakelen naar "${MODE_NAME[m]}" begint de lijn opnieuw. Doorgaan?`)) return
    setSearch({ mode: m })
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link to={`/opening/${file.family.id}`} className="inline-flex min-h-11 items-center text-sm text-muted hover:text-ink">← {file.family.name}</Link>
        <Tabs<TrainMode>
          value={mode}
          onChange={switchMode}
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
        onProgressChange={p => { inProgress.current = p }}
        onComplete={r => { if (r.stars === 3 || r.badges.length) setFire(f => f + 1) }}
        renderEnd={(r, restart) => <EndActions file={file} variation={variation} result={r} mode={mode} restart={restart} />}
        renderEndExtra={() => <EndExtras file={file} variation={variation} mode={mode} />}
      />
    </div>
  )
}

function EndActions({ file, variation, mode, restart }: { file: FamilyFile; variation: Variation; result: LineResult; mode: TrainMode; restart: () => void }) {
  const nav = useNavigate()
  const progress = useProgressMap(file.family.id)
  const next = courseOrder(file).find(v => v.id !== variation.id && !progress.get(v.id)?.completions)
  const primary = mode === 'learn'
    ? { label: 'Nu zelf oefenen, zonder pijlen', go: () => nav('?mode=practice') }
    : next
      ? { label: `Volgende variant: ${displayName(next, file.family.name)}`, go: () => nav(`/train/${file.family.id}/${next.id}?mode=learn`) }
      : { label: 'Dezelfde variant opnieuw', go: restart }

  // Enter = de hoofdactie, ook zonder muis
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key === 'Enter' && !['INPUT', 'TEXTAREA', 'BUTTON', 'A', 'SELECT'].includes(t.tagName)) {
        e.preventDefault()
        primary.go()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <>
      <button className="btn btn-primary min-h-12 justify-between text-left" onClick={primary.go} autoFocus>
        <span className="min-w-0 truncate">{primary.label}</span>
        <span className="flex shrink-0 items-center gap-1"><kbd className="hidden rounded border border-current/40 px-1 text-xs font-normal opacity-80 lg:inline">Enter</kbd><ArrowRight size={18} aria-hidden /></span>
      </button>
      {mode === 'learn'
        ? <button className="btn btn-ghost min-h-11" onClick={restart}>Nog eens doorlopen</button>
        : next && <button className="btn btn-ghost min-h-11" onClick={restart}>Dezelfde variant opnieuw</button>}
    </>
  )
}

/** Alles wat niet nodig is om verder te gaan: onder de terugblik */
function EndExtras({ file, variation, mode }: { file: FamilyFile; variation: Variation; mode: TrainMode }) {
  const related = relatedVariations(file, variation)
  const reps = useLiveQuery(() => db.repertoires.where('side').equals(file.family.side).toArray(), [file.family.side], [])
  const [repMsg, setRepMsg] = useState<string | null>(null)

  async function addToRepertoire(repId?: number) {
    let id = repId
    if (!id) id = (await db.repertoires.add({ name: `Mijn ${file.family.name}`, side: file.family.side, familyId: file.family.id, createdAt: Date.now(), updatedAt: Date.now() })) as number
    const r = await addLine(id, file.family.side, variation.uci)
    setRepMsg(r.conflicts.length
      ? `Toegevoegd. Op ${r.conflicts.length === 1 ? 'één plek' : `${r.conflicts.length} plekken`} had je al een andere hoofdzet (${r.conflicts.map(c => `${c.existing} i.p.v. ${c.added}`).join(', ')}); de nieuwe zet is als alternatief bewaard.`
      : r.added ? `${r.added} ${r.added === 1 ? 'zet' : 'zetten'} toegevoegd aan je repertoire.` : 'Deze variant staat al in je repertoire.')
  }

  return (
    <>
      <Link className="btn btn-ghost min-h-11" to={`/opening/${file.family.id}`}>Terug naar de variantenboom</Link>
      <details className="rounded-xl border border-line p-3">
        <summary className="cursor-pointer text-sm font-semibold">Toevoegen aan repertoire</summary>
        <div className="mt-2 flex flex-wrap gap-2">
          {reps.map(r => <button key={r.id} className="btn btn-ghost min-h-11" onClick={() => addToRepertoire(r.id)}>+ {r.name}</button>)}
          <button className="btn btn-ghost min-h-11" onClick={() => addToRepertoire()}>+ Nieuw repertoire</button>
        </div>
        {repMsg && <p className="mt-2 text-sm text-brand-strong" role="status">{repMsg}</p>}
      </details>
      {related.length > 0 && (
        <details className="rounded-xl border border-line p-3">
          <summary className="cursor-pointer text-sm font-semibold">Verwante varianten ({related.length})</summary>
          <ul className="mt-2 space-y-1">
            {related.map(v => (
              <li key={v.id}>
                <Link className="flex min-h-10 items-center justify-between gap-2 rounded-lg px-2 text-sm hover:bg-surface-2" to={`/train/${file.family.id}/${v.id}?mode=${mode === 'learn' ? 'learn' : 'practice'}`}>
                  <span className="truncate">{displayName(v, file.family.name)}</span>
                  <span className="shrink-0 text-xs text-muted">{v.eco}</span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  )
}
