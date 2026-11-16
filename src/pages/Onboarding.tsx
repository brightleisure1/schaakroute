import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, CircleCheck, ShieldCheck } from 'lucide-react'
import { saveSettings, type UserSettings } from '../lib/db'
import { useManifest } from '../lib/hooks'
import { OpeningPicker } from '../components/OpeningPicker'
import { PieceIcon } from '../components/CropBoard'
import { ThickProgress, useCloseTraining } from '../components/TrainingModeChrome'
import { ErrorBox, Spinner, useSettings } from '../components/ui'

const STRENGTHS: { value: UserSettings['strength']; label: string; elo: number; text: string }[] = [
  { value: 'beginner', label: 'Beginner', elo: 900, text: 'Ik ken de regels en speel af en toe' },
  { value: 'club', label: 'Clubspeler', elo: 1400, text: 'Ik speel regelmatig online of op de club' },
  { value: 'gevorderd', label: 'Gevorderd', elo: 1800, text: 'Ik ken de basistheorie van mijn openingen' },
  { value: 'expert', label: 'Sterk', elo: 2100, text: 'Ik speel competitief en wil diepere theorie' },
]

const SIDES: { value: UserSettings['sides']; label: string; text: string; piece: string }[] = [
  { value: 'white', label: 'Wit', text: 'Jij doet de eerste zet', piece: 'wP' },
  { value: 'black', label: 'Zwart', text: 'Jij antwoordt op wit', piece: 'bP' },
  { value: 'both', label: 'Beide', text: 'Openingen voor allebei de kanten', piece: 'bN' },
]

const MINUTES: { value: UserSettings['dailyMinutes']; label: string }[] = [
  { value: 5, label: 'Rustig' },
  { value: 10, label: 'Normaal' },
  { value: 15, label: 'Serieus' },
  { value: 20, label: 'Fanatiek' },
]

export function Onboarding() {
  const nav = useNavigate()
  const current = useSettings()
  const { data: manifest, error } = useManifest()
  const [step, setStep] = useState(0)
  const [elo, setElo] = useState(1400)
  const [strength, setStrength] = useState<UserSettings['strength']>('club')
  const [sides, setSides] = useState<UserSettings['sides']>('both')
  const [openings, setOpenings] = useState<string[]>([])
  const [minutes, setMinutes] = useState<UserSettings['dailyMinutes']>(10)
  const [finished, setFinished] = useState(false)
  const close = useCloseTraining()
  const stepRef = useRef<HTMLDivElement>(null)
  const firstRender = useRef(true)

  // Bij een nieuwe stap de focus naar de stap zelf, zodat een schermlezer de nieuwe vraag voorleest
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    stepRef.current?.focus({ preventScroll: true })
    window.scrollTo(0, 0)
  }, [step])

  // pas navigeren als de opgeslagen instellingen zichtbaar zijn (anders stuurt de app je terug naar /welkom)
  useEffect(() => {
    if (finished && current?.onboarded) nav('/')
  }, [finished, current?.onboarded]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (current?.onboarded) {
      setElo(current.elo)
      setStrength(current.strength)
      setSides(current.sides)
      setOpenings(current.openings)
      setMinutes(current.dailyMinutes)
    }
  }, [current?.onboarded]) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <ErrorBox error={error} />
  if (!manifest) return <Spinner />

  async function finish() {
    if (!openings.length) return
    await saveSettings({ onboarded: true, elo, strength, sides, openings, dailyMinutes: minutes })
    setFinished(true)
  }

  const steps = [
    <div key="0" className="space-y-4">
      <StepTitle title="Hoe sterk speel je?" text="Dan kiezen we varianten die bij je passen." />
      <div className="grid gap-2 sm:grid-cols-2">
        {STRENGTHS.map(s => (
          <button key={s.value} aria-pressed={strength === s.value} className={`tap p-4 text-left ${strength === s.value ? 'tap-on' : ''}`} onClick={() => { setStrength(s.value); setElo(s.elo) }}>
            <div className="font-semibold">{s.label}</div>
            <div className="text-sm text-muted">{s.text}</div>
          </button>
        ))}
      </div>
      <label className="block">
        <span className="text-sm font-medium">Geschatte rating (Elo, Lichess of Chess.com): <b className="tabular-nums">{elo}</b></span>
        <input type="range" min={400} max={2800} step={25} value={elo} onChange={e => setElo(Number(e.target.value))} className="mt-2 w-full accent-[var(--brand)]" />
      </label>
    </div>,
    // Ontwerp 12a: drie grote kaarten met een schaakstuk, de gekozen kaart groen met een vinkje
    <div key="1" className="space-y-3.5">
      <StepTitle title="Met welke kleur wil je oefenen?" text="Je kunt dit later per opening aanpassen." />
      <div className="flex flex-col gap-3">
        {SIDES.map(s => {
          const on = sides === s.value
          return (
            <button key={s.value} aria-pressed={on} className={`tap flex items-center gap-3.5 p-3.5 text-left ${on ? 'tap-on' : ''}`} onClick={() => { setSides(s.value); setOpenings(o => o.filter(id => s.value === 'both' || manifest.families.find(f => f.id === id)?.side === s.value)) }}>
              <span aria-hidden className={`flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[15px] ${on ? 'bg-surface' : 'bg-surface-2'}`}><PieceIcon piece={s.piece} size={37} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-bold leading-tight">{s.label}</span>
                <span className={`block text-sm ${on ? 'text-brand-strong' : 'text-muted'}`}>{s.text}</span>
              </span>
              <CircleCheck size={24} strokeWidth={2.25} aria-hidden className={`shrink-0 ${on ? 'text-brand' : 'text-line'}`} />
            </button>
          )
        })}
      </div>
    </div>,
    <OpeningPicker key="2" families={manifest.families} sides={sides} value={openings} onChange={setOpenings} />,
    // Ontwerp 12b: vier tegels in twee kolommen, met een woord dat zegt hoe zwaar het is
    <div key="3" className="space-y-3.5">
      <StepTitle title="Hoeveel minuten per dag?" text="Met 10 minuten leer je ongeveer één variant per dag." />
      <div className="grid grid-cols-2 gap-3">
        {MINUTES.map(m => {
          const on = minutes === m.value
          return (
            <button key={m.value} aria-pressed={on} className={`tap flex flex-col items-center gap-0.5 px-2 py-4 text-center ${on ? 'tap-on' : ''}`} onClick={() => setMinutes(m.value)}>
              <span className="text-[34px] font-extrabold leading-none tracking-[-0.03em] tabular-nums">{m.value}</span>
              <span className="text-[13px] text-muted">minuten</span>
              <span className={`mt-2 rounded-full px-2.5 py-0.5 text-xs font-bold ${on ? 'bg-surface text-brand-strong' : 'bg-surface-2 text-muted'}`}>{m.label}</span>
            </button>
          )
        })}
      </div>
      <p className="card flex items-center gap-2.5 px-3.5 py-3 text-sm leading-snug text-muted"><ShieldCheck size={18} aria-hidden className="shrink-0 text-brand-strong" />Geen account nodig. Alles blijft op dit apparaat.</p>
    </div>,
  ]
  const needOpening = !openings.length && (step === 2 || step === steps.length - 1)
  const last = step === steps.length - 1

  // Ontwerp 10a/12a: geen kop en geen losse Vorige-knop; terug zit linksboven, de voortgang is één balk
  // en de hoofdknop staat vast onderaan
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.25rem)] max-w-2xl flex-col lg:min-h-0">
      <h1 className="sr-only">Welkom bij SchaakRoute</h1>
      <div className="flex items-center gap-3">
        {(step > 0 || current?.onboarded) && (
          <button type="button" className="-ml-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-ink" onClick={() => (step > 0 ? setStep(s => s - 1) : close())} aria-label={step > 0 ? 'Vorige stap' : 'Terug zonder op te slaan'}>
            <ArrowLeft size={22} aria-hidden />
          </button>
        )}
        <div className={`min-w-0 flex-1 ${step > 0 || current?.onboarded ? '' : 'py-[15px]'}`}><ThickProgress value={(step + 1) / steps.length} label={`Stap ${step + 1} van ${steps.length}`} /></div>
        <span className="shrink-0 text-sm font-bold tabular-nums text-muted" aria-hidden>{step + 1}/{steps.length}</span>
      </div>
      <div ref={stepRef} tabIndex={-1} className="mt-2.5 outline-none" aria-label={`Stap ${step + 1} van ${steps.length}`} role="group">{steps[step]}</div>
      <div className="sticky bottom-0 -mx-4 mt-auto border-t-2 border-line bg-bg px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3.5 sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:mt-6 lg:border-0 lg:bg-transparent lg:p-0">
        {!last
          ? <button className="btn btn-primary w-full" onClick={() => setStep(s => s + 1)} disabled={needOpening} aria-describedby={needOpening ? 'onboarding-reason' : undefined}>Volgende</button>
          : <button className="btn btn-primary w-full" onClick={finish} disabled={needOpening} aria-describedby={needOpening ? 'onboarding-reason' : undefined}>Aan de slag</button>}
        {needOpening && <p id="onboarding-reason" className="btn-reason text-center">Kies eerst minstens één opening.</p>}
      </div>
    </div>
  )
}

function StepTitle({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <h2 className="text-[28px] font-extrabold leading-[1.12] tracking-[-0.03em]">{title}</h2>
      <p className="mt-1 text-[15px] leading-snug text-muted">{text}</p>
    </div>
  )
}
