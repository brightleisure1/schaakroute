import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { familyProgress, useCardMap, useFamily, useProgressMap, variationMastery } from '../lib/hooks'
import { displayName } from '../lib/data'
import { variationLine } from '../lib/daily'
import { endSession, startSession } from '../lib/progress'
import { Check, Trophy } from 'lucide-react'
import { Trainer, ResultNumbers, type LineResult } from '../components/Trainer'
import { Confetti, ErrorBox, PageHeader, ProgressBar, Spinner, Stars } from '../components/ui'
import type { FamilyFile, Lesson, TrainMode, Variation } from '../lib/types'
import type { VariationProgress } from '../lib/db'

const LEVELS: Record<number, { title: string; text: string }> = {
  1: { title: 'Niveau 1 — Basis', text: 'De basiszetten en belangrijkste reacties' },
  2: { title: 'Niveau 2 — Hoofdvarianten', text: 'Varianten die in minstens 1% van de partijen voorkomen' },
  3: { title: 'Niveau 3 — Alternatieven', text: 'Zijvarianten en andere zetten van de tegenstander' },
  4: { title: 'Niveau 4 — Minder gebruikelijk', text: 'Zeldzamere lijnen en korte subvarianten' },
  5: { title: 'Niveau 5 — Gevorderd', text: 'Diepe subvarianten, gambieten en combinaties' },
}

function lessonState(lesson: Lesson, file: FamilyFile, progress: Map<string, VariationProgress>) {
  const vs = lesson.variationIds.map(id => file.variations.find(v => v.id === id)!)
  const done = vs.filter(v => (progress.get(v.id)?.completions ?? 0) > 0).length
  const stars = done === vs.length ? Math.min(...vs.map(v => progress.get(v.id)?.bestStars ?? 0)) : 0
  return { vs, done, stars, complete: done === vs.length }
}

export function Course() {
  const { id } = useParams()
  const { data: file, error } = useFamily(id)
  const progress = useProgressMap(id)
  const cards = useCardMap(id)
  if (error) return <ErrorBox error={error} />
  if (!file) return <Spinner />
  const p = familyProgress(file, progress, cards)
  const levels = [1, 2, 3, 4, 5].map(l => ({ level: l, lessons: file.lessons.filter(x => x.level === l) })).filter(l => l.lessons.length)
  const firstOpen = file.lessons.find(l => !lessonState(l, file, progress).complete)
  const learnedCount = file.variations.filter(v => (progress.get(v.id)?.completions ?? 0) > 0).length

  return (
    <div>
      <PageHeader back={`/opening/${file.family.id}`} title={`Course · ${file.family.name}`} subtitle={`${file.lessons.length} lessen met alle ${file.variations.length} varianten — belangrijkste lijnen eerst.`}
        actions={firstOpen && <Link to={`/les/${file.family.id}/${firstOpen.id}`} className="btn btn-primary">{learnedCount ? 'Ga verder' : 'Start eerste les'}</Link>} />
      <div className="card mb-6 p-4">
        <ProgressBar value={p.pct} />
        <div className="mt-1 text-sm text-muted">{p.learned} van {p.total} varianten afgerond · {p.mastered} beheerst</div>
      </div>
      <ol className="relative space-y-8">
        {levels.map(({ level, lessons }) => {
          const done = lessons.filter(l => lessonState(l, file, progress).complete).length
          return (
            <li key={level}>
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">{LEVELS[level].title}</h2>
                  <p className="text-sm text-muted">{LEVELS[level].text}</p>
                </div>
                <span className="text-sm tabular-nums text-muted">{done}/{lessons.length} lessen</span>
              </div>
              <div className="relative grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {lessons.map(lesson => {
                  const s = lessonState(lesson, file, progress)
                  const current = firstOpen?.id === lesson.id
                  return (
                    <Link key={lesson.id} to={`/les/${file.family.id}/${lesson.id}`} title={`${lesson.title}: ${s.done} van ${s.vs.length} varianten afgerond`} aria-current={current ? 'step' : undefined} className={`card flex items-center gap-3 p-3 transition hover:border-brand ${current ? 'border-brand ring-2 ring-brand/25' : ''}`}>
                      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-bold ${s.complete ? 'bg-brand text-on-brand' : current ? 'bg-brand-soft text-brand-strong' : 'bg-surface-2 text-muted'}`}>
                        {s.complete ? <Check size={20} aria-label="afgerond" /> : <span aria-label={`${s.done} van ${s.vs.length} afgerond`}>{s.done}/{s.vs.length}</span>}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{lesson.title}</span>
                        <span className="block text-xs text-muted">{s.vs.length} {s.vs.length === 1 ? 'variant' : 'varianten'}{current ? ' · hier ben je' : ''}</span>
                      </span>
                      {s.complete && <Stars count={s.stars} size="text-sm" />}
                    </Link>
                  )
                })}
              </div>
            </li>
          )
        })}
        <li>
          <h2 className="text-lg font-bold">Mastery</h2>
          <p className="mb-3 text-sm text-muted">Speel de geleerde varianten zonder hints uit je hoofd. Spaced repetition bepaalt wanneer je ze herhaalt.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Link to={`/mastery?family=${file.family.id}&type=lines`} className="card p-4 hover:border-brand"><div className="font-semibold">Complete varianten uit het hoofd</div><div className="text-sm text-muted">{learnedCount} geleerde varianten</div></Link>
            <Link to={`/mastery?family=${file.family.id}&type=positions`} className="card p-4 hover:border-brand"><div className="font-semibold">Losse posities herhalen</div><div className="text-sm text-muted">{p.positions} geleerde posities</div></Link>
          </div>
        </li>
      </ol>
    </div>
  )
}

export function LessonRun() {
  const { id, lessonId } = useParams()
  const { data: file, error } = useFamily(id)
  const progress = useProgressMap(id)
  const cards = useCardMap(id)
  const lesson = file?.lessons.find(l => l.id === lessonId)
  const queueRef = useRef<{ v: Variation; mode: TrainMode }[] | null>(null)
  const [index, setIndex] = useState(0)
  const [results, setResults] = useState<LineResult[]>([])
  const [sessionId, setSessionId] = useState<number>()
  const [fire, setFire] = useState(0)

  // Wachtrij één keer opbouwen: nieuwe varianten eerst leren en dan oefenen; bekende alleen oefenen
  const queue = useMemo(() => {
    if (!file || !lesson) return null
    if (queueRef.current) return queueRef.current
    const q: { v: Variation; mode: TrainMode }[] = []
    for (const vid of lesson.variationIds) {
      const v = file.variations.find(x => x.id === vid)!
      const vm = variationMastery(v, file.family.side, cards, progress.get(v.id))
      if (!vm.learned) q.push({ v, mode: 'learn' })
      q.push({ v, mode: 'practice' })
    }
    queueRef.current = q
    return q
  }, [file, lesson]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let sid: number | undefined
    startSession('lesson', id).then(s => { sid = s; setSessionId(s) })
    return () => { if (sid) endSession(sid, {}) }
  }, [id, lessonId])

  if (error) return <ErrorBox error={error} />
  if (!file || !lesson || !queue) return <Spinner />
  const item = queue[index]
  const finished = index >= queue.length
  const nextLesson = file.lessons[file.lessons.findIndex(l => l.id === lesson.id) + 1]

  if (finished) {
    const practice = results.filter((_, i) => queue[i].mode !== 'learn')
    const stars = practice.length ? Math.min(...practice.map(r => r.stars)) : 0
    const total = results.reduce((a, r) => ({ ...a, userMoves: a.userMoves + r.userMoves, correctFirstTry: a.correctFirstTry + r.correctFirstTry, mistakes: a.mistakes + r.mistakes, xp: a.xp + r.xp, badges: [...a.badges, ...r.badges] }), { userMoves: 0, correctFirstTry: 0, mistakes: 0, hints: 0, alternatives: 0, shown: 0, stars, xp: 0, newCards: 0, badges: [], misses: [] } as LineResult)
    return (
      <div className="card mx-auto max-w-md p-6 text-center animate-pop">
        <Confetti fire={1} />
        <Trophy size={40} strokeWidth={1.5} aria-hidden className="mx-auto text-star" />
        <h2 className="mt-2 text-xl font-bold">Les afgerond: {lesson.title}</h2>
        <div className="mt-2"><Stars count={stars} size="text-3xl" /></div>
        <ResultNumbers result={total} />
        <div className="mt-4 grid gap-2">
          {nextLesson && <Link to={`/les/${file.family.id}/${nextLesson.id}`} className="btn btn-primary" onClick={() => { queueRef.current = null; setIndex(0); setResults([]) }}>Volgende les: {nextLesson.title}</Link>}
          <Link to={`/cursus/${file.family.id}`} className="btn btn-ghost">Terug naar het leerpad</Link>
        </div>
      </div>
    )
  }

  const line = variationLine(file, item.v)
  return (
    <div>
      <Confetti fire={fire} />
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link to={`/cursus/${file.family.id}`} className="inline-flex min-h-11 items-center text-sm text-muted hover:text-ink">← Leerpad</Link>
        <div className="flex-1 sm:max-w-sm"><ProgressBar value={index / queue.length} /><div className="mt-1 text-right text-xs text-muted">{lesson.title} · stap {index + 1} van {queue.length}</div></div>
      </div>
      <Trainer
        key={`${item.v.id}-${item.mode}-${index}`}
        line={line}
        mode={item.mode}
        family={file}
        sessionId={sessionId}
        autoIntro={item.mode === 'learn'}
        onComplete={r => { if (r.stars === 3) setFire(f => f + 1) }}
        renderEnd={r => {
          const nextItem = queue[index + 1]
          return (
            <button className="btn btn-primary min-h-12" autoFocus onClick={() => { setResults(x => [...x, r]); setIndex(i => i + 1) }}>
              {!nextItem ? 'Les afronden' : nextItem.v.id === item.v.id ? 'Nu zelf spelen, zonder pijlen' : `Verder: ${displayName(nextItem.v, file.family.name)}`}
            </button>
          )
        }}
      />
    </div>
  )
}
