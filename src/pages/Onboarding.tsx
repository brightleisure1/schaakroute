import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { ChessKing } from 'lucide-react'
import { saveSettings, type UserSettings } from '../lib/db'
import { useManifest } from '../lib/hooks'
import { OpeningPicker } from '../components/OpeningPicker'
import { ErrorBox, Spinner, useSettings } from '../components/ui'

const STRENGTHS: { value: UserSettings['strength']; label: string; elo: number; text: string }[] = [
  { value: 'beginner', label: 'Beginner', elo: 900, text: 'Ik ken de regels en speel af en toe' },
  { value: 'club', label: 'Clubspeler', elo: 1400, text: 'Ik speel regelmatig online of op de club' },
  { value: 'gevorderd', label: 'Gevorderd', elo: 1800, text: 'Ik ken de basistheorie van mijn openingen' },
  { value: 'expert', label: 'Sterk', elo: 2100, text: 'Ik speel competitief en wil diepere theorie' },
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
      <h2 className="text-xl font-bold">Hoe sterk speel je?</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {STRENGTHS.map(s => (
          <button key={s.value} aria-pressed={strength === s.value} className={`card p-4 text-left transition ${strength === s.value ? 'border-brand ring-2 ring-brand/30' : 'hover:border-brand'}`} onClick={() => { setStrength(s.value); setElo(s.elo) }}>
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
    <div key="1" className="space-y-4">
      <h2 className="text-xl font-bold">Met welke kleur wil je oefenen?</h2>
      <div className="grid grid-cols-3 gap-2">
        {(['white', 'black', 'both'] as const).map(s => (
          <button key={s} aria-pressed={sides === s} className={`card flex flex-col items-center gap-1 p-4 text-center font-semibold ${sides === s ? 'border-brand ring-2 ring-brand/30' : ''}`} onClick={() => { setSides(s); setOpenings(o => o.filter(id => s === 'both' || manifest.families.find(f => f.id === id)?.side === s)) }}>
            <span aria-hidden className="flex gap-1">{s !== 'black' && <ChessKing size={28} strokeWidth={1.5} />}{s !== 'white' && <ChessKing size={28} strokeWidth={1.5} className="fill-current" />}</span>
            {s === 'white' ? 'Wit' : s === 'black' ? 'Zwart' : 'Beide'}
          </button>
        ))}
      </div>
    </div>,
    <OpeningPicker key="2" families={manifest.families} sides={sides} value={openings} onChange={setOpenings} />,
    <div key="3" className="space-y-4">
      <h2 className="text-xl font-bold">Hoeveel minuten per dag?</h2>
      <div className="grid grid-cols-4 gap-2">
        {([5, 10, 15, 20] as const).map(m => (
          <button key={m} aria-pressed={minutes === m} className={`card p-4 text-center ${minutes === m ? 'border-brand ring-2 ring-brand/30' : ''}`} onClick={() => setMinutes(m)}>
            <div className="text-2xl font-bold">{m}</div>
            <div className="text-xs text-muted">minuten</div>
          </button>
        ))}
      </div>
      <p className="text-sm text-muted">Geen account nodig. Alles blijft op dit apparaat.</p>
    </div>,
  ]

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 text-center">
        <img src="./icon.svg" alt="" className="mx-auto h-14 w-14 rounded-[22%] ring-1 ring-line" />
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight">Welkom bij SchaakRoute</h1>
        <p className="mt-1 text-muted">Leer openingen door ze zelf te spelen.</p>
      </div>
      <div className="mb-4 flex gap-1.5" aria-hidden>{steps.map((_, i) => <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-brand' : 'bg-line'}`} />)}</div>
      <div className="card p-5 sm:p-6">{steps[step]}</div>
      <div className="sticky bottom-0 -mx-4 mt-4 flex items-center justify-between gap-3 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:backdrop-blur-none">
        <button className="btn btn-ghost min-h-11" onClick={() => setStep(s => s - 1)} disabled={step === 0}>Vorige</button>
        <span className="text-sm text-muted">Stap {step + 1} van {steps.length}</span>
        {step < steps.length - 1
          ? <button className="btn btn-primary min-h-11" onClick={() => setStep(s => s + 1)} disabled={step === 2 && !openings.length}>Volgende</button>
          : <button className="btn btn-primary min-h-11" onClick={finish} disabled={!openings.length}>Aan de slag</button>}
      </div>
    </div>
  )
}
