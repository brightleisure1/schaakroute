import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { familyProgress, useCardMap, useFamily, useProgressMap, userCardIds } from '../lib/hooks'
import { displayName } from '../lib/data'
import { variationLine } from '../lib/daily'
import { learnLessons, lessonTitle } from '../lib/course'
import { t, tn } from '../lib/i18n'
import { endSession, startSession } from '../lib/progress'
import { db } from '../lib/db'
import { AUTO_NEXT_MS, MAX_REDO, knownUserMoves, moveNo, planVariation, redoSteps, userPliesOf, type LessonStep, type StepKind } from '../lib/lessonPlan'
import { Check, Trophy } from 'lucide-react'
import { Trainer, ResultNumbers, type LineResult } from '../components/Trainer'
import { Confetti, ErrorBox, PageHeader, ProgressBar, Spinner, Stars } from '../components/ui'
import { BoardLoading } from '../components/PieceMotion'
import type { FamilyFile, Lesson, TrainingLine } from '../lib/types'
import type { VariationProgress } from '../lib/db'

// Niveaus worden doorlopend genummerd: als korte lijnen een niveau leeg maken, begint het leerpad niet bij 'Niveau 2'
const LEVELS: Record<number, { title: string }> = {
  1: { title: 'Basis' },
  2: { title: 'Hoofdvarianten' },
  3: { title: 'Alternatieven' },
  4: { title: 'Minder gebruikelijk' },
  5: { title: 'Gevorderd' },
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
  const allLessons = learnLessons(file)
  const levels = [1, 2, 3, 4, 5].map(l => ({ level: l, lessons: allLessons.filter(x => x.level === l) })).filter(l => l.lessons.length)
  const firstOpen = allLessons.find(l => !lessonState(l, file, progress).complete)
  const inCourse = allLessons.reduce((n, l) => n + l.variationIds.length, 0)
  // Telling binnen het leerpad, zodat die klopt met het aantal varianten in de lessen
  const doneInCourse = allLessons.reduce((n, l) => n + l.variationIds.filter(id => (progress.get(id)?.completions ?? 0) > 0).length, 0)
  const learnedCount = file.variations.filter(v => (progress.get(v.id)?.completions ?? 0) > 0).length

  return (
    <div>
      <PageHeader back={`/opening/${file.family.id}`} title={t('Cursus · {name}', { name: file.family.name })} subtitle={t('{n} lessen · {m} varianten', { n: allLessons.length, m: inCourse })}
        actions={firstOpen && <Link to={`/les/${file.family.id}/${firstOpen.id}`} className="btn btn-primary">{learnedCount ? t('Ga verder') : t('Start eerste les')}</Link>} />
      <div className="card mb-6 p-4">
        <ProgressBar value={inCourse ? doneInCourse / inCourse : 0} />
        <div className="mt-1 text-sm text-muted">{t('{done} van {n} varianten afgerond', { done: doneInCourse, n: inCourse })}</div>
      </div>
      <ol className="relative space-y-8">
        {levels.map(({ level, lessons }, li) => {
          const done = lessons.filter(l => lessonState(l, file, progress).complete).length
          return (
            <li key={level}>
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">{t('Niveau {n} · {title}', { n: li + 1, title: t(LEVELS[level].title) })}</h2>
                </div>
                <span className="text-sm tabular-nums text-muted">{t('{done}/{n} lessen', { done, n: lessons.length })}</span>
              </div>
              <div className="relative grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {lessons.map(lesson => {
                  const s = lessonState(lesson, file, progress)
                  const current = firstOpen?.id === lesson.id
                  return (
                    <Link key={lesson.id} to={`/les/${file.family.id}/${lesson.id}`} title={t('{title}: {done} van {n} varianten afgerond', { title: lessonTitle(lesson.title), done: s.done, n: s.vs.length })} aria-current={current ? 'step' : undefined} className={`tap flex items-center gap-3 p-3 ${current ? 'border-brand!' : ''}`}>
                      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-bold ${s.complete ? 'bg-brand text-on-brand' : current ? 'bg-brand-soft text-brand-strong' : 'bg-surface-2 text-muted'}`}>
                        {s.complete ? <Check size={20} aria-label={t('afgerond')} /> : <span aria-label={t('{done} van {n} afgerond', { done: s.done, n: s.vs.length })}>{s.done}/{s.vs.length}</span>}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold leading-snug line-clamp-2">{lessonTitle(lesson.title)}</span>
                        <span className="block text-xs text-muted">{tn(s.vs.length, '{n} variant', '{n} varianten')}{current ? ` · ${t('hier ben je')}` : ''}</span>
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
          <h2 className="text-lg font-bold">{t('Herhalen')}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Link to={`/mastery?family=${file.family.id}&type=lines`} className="tap p-4"><div className="font-semibold">{t('Complete varianten uit het hoofd')}</div><div className="text-sm text-muted">{t('{n} geleerde varianten', { n: learnedCount })}</div></Link>
            <Link to={`/mastery?family=${file.family.id}&type=positions`} className="tap p-4"><div className="font-semibold">{t('Losse posities herhalen')}</div><div className="text-sm text-muted">{t('{n} geleerde posities', { n: p.positions })}</div></Link>
          </div>
        </li>
      </ol>
    </div>
  )
}

interface StepResult { step: LessonStep; result: LineResult }

export function LessonRun() {
  const { id, lessonId } = useParams()
  const { data: file, error } = useFamily(id)
  const lesson = file ? learnLessons(file).find(l => l.id === lessonId) : undefined
  const [steps, setSteps] = useState<LessonStep[]>([])
  const [planned, setPlanned] = useState(0) // aantal varianten waarvan de stappen al klaarstaan
  const [index, setIndex] = useState(0)
  const [results, setResults] = useState<StepResult[]>([])
  const misses = useRef(new Map<string, Set<number>>())
  const advanced = useRef(-1) // laatste stap waarvoor al is doorgegaan (knop en automatisch tegelijk)
  const [sessionId, setSessionId] = useState<number>()
  const [fire, setFire] = useState(0)

  // Nieuwe les: alles opnieuw
  useEffect(() => {
    setSteps([]); setPlanned(0); setIndex(0); setResults([]); misses.current = new Map(); advanced.current = -1
  }, [lessonId])

  // De stappen van een variant worden pas bepaald als je eraan begint, zodat zetten die je net in deze les
  // leerde (bijvoorbeeld een gedeeld begin) al als bekend gelden
  useEffect(() => {
    if (!file || !lesson || index < steps.length || planned >= lesson.variationIds.length) return
    let alive = true
    const v = file.variations.find(x => x.id === lesson.variationIds[planned])!
    const ids = userCardIds(v, file.family.side)
    db.cards.bulkGet(ids).then(cards => {
      if (!alive) return
      const known = knownUserMoves(ids, cid => (cards[ids.indexOf(cid)]?.correct ?? 0) > 0)
      setSteps(s => [...s, ...planVariation(v.id, v.uci.length, file.family.side, known)])
      setPlanned(n => n + 1)
    })
    return () => { alive = false }
  }, [file, lesson, index, steps.length, planned])

  useEffect(() => {
    let sid: number | undefined
    startSession('lesson', id).then(s => { sid = s; setSessionId(s) })
    return () => { if (sid) endSession(sid, {}) }
  }, [id, lessonId])

  if (error) return <ErrorBox error={error} />
  // Een les met alleen korte lijnen bestaat niet meer: terug naar het leerpad
  if (file && !lesson) return <Navigate to={`/cursus/${file.family.id}`} replace />
  if (!file || !lesson) return <BoardLoading />
  const lessons = learnLessons(file)
  const nextLesson = lessons[lessons.findIndex(l => l.id === lesson.id) + 1]
  const finished = planned >= lesson.variationIds.length && index >= steps.length

  if (finished) {
    const counted = results.filter(r => r.step.kind !== 'learn' && r.step.kind !== 'redo')
    const finals = results.filter(r => r.step.completes)
    const stars = finals.length ? Math.min(...finals.map(r => r.result.stars)) : 0
    const total = counted.map(r => r.result).reduce((a, r) => ({ ...a, userMoves: a.userMoves + r.userMoves, correctFirstTry: a.correctFirstTry + r.correctFirstTry, mistakes: a.mistakes + r.mistakes, xp: a.xp + r.xp, badges: [...a.badges, ...r.badges] }), { userMoves: 0, correctFirstTry: 0, mistakes: 0, hints: 0, alternatives: 0, shown: 0, stars, xp: results.filter(r => r.step.kind === 'learn' || r.step.kind === 'redo').reduce((a, r) => a + r.result.xp, 0), newCards: 0, badges: [], misses: [] } as LineResult)
    return (
      <div className="card mx-auto max-w-md p-6 text-center animate-pop">
        <Confetti fire={1} />
        <Trophy size={40} strokeWidth={1.5} aria-hidden className="mx-auto text-star" />
        <h2 className="mt-2 text-xl font-bold">{t('Les afgerond: {title}', { title: lessonTitle(lesson.title) })}</h2>
        <div className="mt-2"><Stars count={stars} size="text-3xl" /></div>
        <ResultNumbers result={total} />
        <div className="mt-4 grid gap-2">
          {nextLesson && <Link to={`/les/${file.family.id}/${nextLesson.id}`} className="btn btn-primary">{t('Volgende les: {title}', { title: lessonTitle(nextLesson.title) })}</Link>}
          <Link to={`/cursus/${file.family.id}`} className="btn btn-ghost">{t('Terug naar het leerpad')}</Link>
        </div>
      </div>
    )
  }
  const step = steps[index]
  if (!step) return <BoardLoading />
  const v = file.variations.find(x => x.id === step.variationId)!
  const vIndex = lesson.variationIds.indexOf(v.id)
  const side = file.family.side
  const user = userPliesOf(v.uci.length, side).filter(p => p >= step.startPly && p < step.endPly)
  // "zet 3" of "zet 3–5" (in het Engels "move 3" of "moves 3–5")
  const range = !user.length ? t('zet') : user.length > 1 ? t('zet {a}–{b}', { a: moveNo(user[0]), b: moveNo(user[user.length - 1]) }) : t('zet {a}', { a: moveNo(user[0]) })
  const label: Record<StepKind, string> = {
    learn: t('Kijk en speel na: {moves}', { moves: range }),
    recall: t('Nu uit je hoofd: {moves}', { moves: range }),
    final: step.startPly === 0 ? t('De hele variant uit je hoofd') : t('Alle nieuwe zetten uit je hoofd: {moves}', { moves: range }),
    redo: t('Fout herstellen: {moves}', { moves: range }),
  }
  const stepsOfVariation = steps.filter(s => s.variationId === v.id)
  const posInVariation = stepsOfVariation.indexOf(step)
  const line = { ...variationLine(file, v), key: `${v.id}:${index}`, startPly: step.startPly, endPly: step.endPly, previewFrom: step.previewFrom }

  function done(r: LineResult) {
    if (advanced.current === index) return
    advanced.current = index
    setResults(x => [...x, { step, result: r }])
    const extra: LessonStep[] = []
    if (step.kind === 'recall' || step.kind === 'final') {
      const set = misses.current.get(v.id) ?? new Set<number>()
      for (const m of r.misses) set.add(m.ply)
      misses.current.set(v.id, set)
      // Aan het eind van de variant: de fouten opnieuw, met de zetten ervoor voorgespeeld
      if (step.kind === 'final' && set.size) extra.push(...redoSteps(v.id, set))
    } else if (step.kind === 'redo' && r.mistakes + r.hints + r.shown > 0 && (step.attempt ?? 1) < MAX_REDO) {
      extra.push(...redoSteps(v.id, [step.startPly], (step.attempt ?? 1) + 1))
    }
    if (extra.length) {
      // achter de herstelstappen die al klaarstaan voor deze variant
      let at = index + 1
      while (at < steps.length && steps[at].variationId === v.id) at++
      setSteps(s => [...s.slice(0, at), ...extra, ...s.slice(at)])
    }
    setIndex(i => i + 1)
  }

  const next = steps[index + 1]
  // Herstelstappen worden pas na deze stap ingepland; het label kijkt daarom ook naar de fouten van nu
  const nextLabel = (r: LineResult) => {
    const failed = r.mistakes + r.hints + r.shown > 0
    if (step.kind === 'learn') return t('Nu zelf, zonder pijlen')
    if (step.kind === 'final' && (failed || misses.current.get(v.id)?.size)) return t('Fouten herstellen')
    if (step.kind === 'redo' && failed && (step.attempt ?? 1) < MAX_REDO) return t('Verder, deze zet komt nog terug')
    if (next?.variationId === v.id) return next.kind === 'redo' ? t('Volgende fout herstellen') : next.kind === 'final' ? t('Nu alles uit je hoofd') : t('Volgende zetten leren')
    if (vIndex + 1 < lesson.variationIds.length) return t('Verder: {name}', { name: displayName(file.variations.find(x => x.id === lesson.variationIds[vIndex + 1])!, file.family.name) })
    return t('Les afronden')
  }
  const endTitle = (r: LineResult) => step.kind === 'learn' ? t('Bekeken. Nu uit je hoofd.')
    : r.mistakes + r.hints + r.shown === 0 ? t('Goed gedaan!') : step.kind === 'redo' ? t('Nog niet helemaal') : t('Afgerond, met fouten')

  return (
    <div>
      <Confetti fire={fire} />
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link to={`/cursus/${file.family.id}`} className="inline-flex min-h-11 items-center text-sm text-muted hover:text-ink">← {t('Leerpad')}</Link>
        <div className="flex-1 sm:max-w-sm">
          <ProgressBar value={(vIndex + Math.max(0, posInVariation) / Math.max(1, stepsOfVariation.length)) / lesson.variationIds.length} />
          <div className="mt-1 text-right text-xs text-muted">{lesson.variationIds.length > 1 ? `${t('Variant {n} van {m}', { n: vIndex + 1, m: lesson.variationIds.length })} · ` : ''}{label[step.kind]}</div>
        </div>
      </div>
      <StepTrainer
        key={line.key}
        line={line}
        step={step}
        family={file}
        sessionId={sessionId}
        endTitle={endTitle}
        onComplete={r => {
          if (step.completes && r.stars === 3) setFire(f => f + 1)
          // Een stap van één zet die meteen goed ging: vanzelf door, zonder op de knop te hoeven klikken
          if (user.length <= 1 && r.mistakes + r.hints + r.shown === 0) setTimeout(() => done(r), AUTO_NEXT_MS)
        }}
        renderEnd={r => <button className="btn btn-primary min-h-12" autoFocus onClick={() => done(r)}>{nextLabel(r)}</button>}
      />
    </div>
  )
}

/** De trainer voor één stap; houdt het resultaat vast voor de eindkop */
function StepTrainer({ line, step, family, sessionId, endTitle, onComplete, renderEnd }: {
  line: TrainingLine; step: LessonStep; family: FamilyFile; sessionId?: number
  endTitle: (r: LineResult) => string; onComplete: (r: LineResult) => void; renderEnd: (r: LineResult) => ReactNode
}) {
  const [title, setTitle] = useState<string>()
  return (
    <Trainer
      line={line}
      mode={step.kind === 'learn' ? 'learn' : 'practice'}
      family={family}
      sessionId={sessionId}
      autoIntro={false}
      completes={!!step.completes}
      endTitle={title}
      onComplete={r => { setTitle(endTitle(r)); onComplete(r) }}
      renderEnd={renderEnd}
    />
  )
}
