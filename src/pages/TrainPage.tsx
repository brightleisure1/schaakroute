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
import { Confetti, ErrorBox, useWide } from '../components/ui'
import { BoardLoading } from '../components/PieceMotion'
import { useCloseTraining } from '../components/TrainingModeChrome'
import type { FamilyFile, TrainMode, Variation } from '../lib/types'
import { t, tn, tr } from '../lib/i18n'

const MODE_NAME: Record<string, string> = { learn: 'Leren', practice: 'Oefenen', mastery: 'Uit het hoofd' }

export function TrainPage() {
  const { familyId, variationId } = useParams()
  const [search, setSearch] = useSearchParams()
  const mode = (search.get('mode') as TrainMode) || 'learn'
  const { data: file, error } = useFamily(familyId)
  const [sessionId, setSessionId] = useState<number>()
  const [fire, setFire] = useState(0)
  const inProgress = useRef(false)
  const [pendingMode, setPendingMode] = useState<TrainMode | null>(null)
  const variation = file?.variations.find(v => v.id === variationId)
  const close = useCloseTraining()
  const wide = useWide()
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
  if (!file || !line) return <BoardLoading />
  if (!variation) return <ErrorBox error={t('Variant niet gevonden')} />

  function switchMode(m: TrainMode) {
    if (m === mode) return
    // Midden in een lijn eerst vragen (in de app zelf; browservensters worden soms geblokkeerd)
    if (inProgress.current) { setPendingMode(m); return }
    setPendingMode(null)
    setSearch({ mode: m })
  }

  const pending = pendingMode && (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-info-soft px-4 py-3 text-sm text-info-ink lg:mb-0" role="alertdialog" aria-live="assertive">
      <span>{tr(
        <>Je bent halverwege deze variant. Naar <b>{t(MODE_NAME[pendingMode])}</b> gaan begint de lijn opnieuw.</>,
        <>You're halfway through this variation. Switching to <b>{t(MODE_NAME[pendingMode])}</b> restarts the line.</>,
      )}</span>
      <span className="flex gap-2">
        <button className="btn btn-primary min-h-11" onClick={() => { const m = pendingMode; setPendingMode(null); setSearch({ mode: m }) }} autoFocus>{t('Toch overschakelen')}</button>
        <button className="btn btn-ghost min-h-11" onClick={() => setPendingMode(null)}>{t('Blijven')}</button>
      </span>
    </div>
  )

  return (
    <div>
      {/* Telefoon: de soort training zit achter Meer (ontwerp 12f). Desktop: onderaan het paneel naast het bord (ontwerp 15b),
          en de vraag of je echt wilt wisselen staat dan bovenin dat paneel. */}
      {!wide && pending}
      <Confetti fire={fire} />
      <Trainer
        key={line.key + mode}
        line={line}
        mode={mode}
        family={file}
        sessionId={sessionId}
        onProgressChange={p => { inProgress.current = p }}
        onClose={close}
        closeLabel={t('Stoppen, terug naar {name}', { name: file.family.name })}
        modes={{ value: mode, onChange: switchMode }}
        fullScreen
        notice={wide ? pending : undefined}
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
    ? { label: t('Nu zelf oefenen, zonder pijlen'), go: () => nav('?mode=practice') }
    : next
      ? { label: t('Volgende variant: {name}', { name: displayName(next, file.family.name) }), go: () => nav(`/train/${file.family.id}/${next.id}?mode=learn`) }
      : { label: t('Dezelfde variant opnieuw'), go: restart }

  // Enter = de hoofdactie, ook zonder muis
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.key === 'Enter' && !['INPUT', 'TEXTAREA', 'BUTTON', 'A', 'SELECT'].includes(el.tagName)) {
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
        ? <button className="btn btn-ghost min-h-11" onClick={restart}>{t('Nog eens doorlopen')}</button>
        : next && <button className="btn btn-ghost min-h-11" onClick={restart}>{t('Dezelfde variant opnieuw')}</button>}
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
    if (!id) id = (await db.repertoires.add({ name: t('Mijn {name}', { name: file.family.name }), side: file.family.side, familyId: file.family.id, createdAt: Date.now(), updatedAt: Date.now() })) as number
    const r = await addLine(id, file.family.side, variation.uci)
    setRepMsg(r.conflicts.length
      ? t('Toegevoegd. Op {places} had je al een andere hoofdzet ({list}); de nieuwe zet is als alternatief bewaard.', {
        places: tn(r.conflicts.length, 'één plek', '{n} plekken'),
        list: r.conflicts.map(c => t('{a} i.p.v. {b}', { a: c.existing, b: c.added })).join(', '),
      })
      : r.added ? tn(r.added, '{n} zet toegevoegd aan je repertoire.', '{n} zetten toegevoegd aan je repertoire.') : t('Deze variant staat al in je repertoire.'))
  }

  return (
    <>
      <Link className="btn btn-ghost min-h-11" to={`/opening/${file.family.id}`}>{t('Terug naar de variantenboom')}</Link>
      <details className="rounded-xl border border-line p-3">
        <summary className="cursor-pointer text-sm font-semibold">{t('Toevoegen aan repertoire')}</summary>
        <div className="mt-2 flex flex-wrap gap-2">
          {reps.map(r => <button key={r.id} className="btn btn-ghost min-h-11" onClick={() => addToRepertoire(r.id)}>+ {r.name}</button>)}
          <button className="btn btn-ghost min-h-11" onClick={() => addToRepertoire()}>+ {t('Nieuw repertoire')}</button>
        </div>
        {repMsg && <p className="mt-2 text-sm text-brand-strong" role="status">{repMsg}</p>}
      </details>
      {related.length > 0 && (
        <details className="rounded-xl border border-line p-3">
          <summary className="cursor-pointer text-sm font-semibold">{t('Verwante varianten ({n})', { n: related.length })}</summary>
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
