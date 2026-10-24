import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { saveSettings, type UserSettings } from '../lib/db'
import { useManifest } from '../lib/hooks'
import { OPENING_INFO } from '../content/openingInfo'
import { ErrorBox, Spinner, pct, useSettings } from '../components/ui'

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
  const [elo, setElo] = useState(1200)
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

  const families = manifest.families.filter(f => sides === 'both' || f.side === sides)
  const toggle = (id: string) => setOpenings(o => (o.includes(id) ? o.filter(x => x !== id) : [...o, id]))

  async function finish() {
    const chosen = openings.length ? openings : families.slice(0, sides === 'both' ? 2 : 1).map(f => f.id)
    await saveSettings({ onboarded: true, elo, strength, sides, openings: chosen, dailyMinutes: minutes })
    setFinished(true)
  }

  const steps = [
    <div key="0" className="space-y-4">
      <h2 className="text-xl font-bold">Hoe sterk speel je?</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {STRENGTHS.map(s => (
          <button key={s.value} className={`card p-4 text-left transition ${strength === s.value ? 'border-brand ring-2 ring-brand/30' : 'hover:border-brand'}`} onClick={() => { setStrength(s.value); setElo(s.elo) }}>
            <div className="font-semibold">{s.label}</div>
            <div className="text-sm text-muted">{s.text}</div>
          </button>
        ))}
      </div>
      <label className="block">
        <span className="text-sm font-medium">Geschatte rating (Elo, Lichess of Chess.com): <b className="tabular-nums">{elo}</b></span>
        <input type="range" min={400} max={2800} step={25} value={elo} onChange={e => setElo(Number(e.target.value))} className="mt-2 w-full accent-[var(--brand)]" />
      </label>
      <p className="text-sm text-muted">Je rating wordt gebruikt om puzzels op jouw niveau te kiezen en om te tonen wat spelers van jouw niveau in de praktijk spelen.</p>
    </div>,
    <div key="1" className="space-y-4">
      <h2 className="text-xl font-bold">Met welke kleur wil je oefenen?</h2>
      <div className="grid grid-cols-3 gap-2">
        {(['white', 'black', 'both'] as const).map(s => (
          <button key={s} className={`card p-4 text-center font-semibold ${sides === s ? 'border-brand ring-2 ring-brand/30' : ''}`} onClick={() => { setSides(s); setOpenings([]) }}>
            <div className="text-3xl">{s === 'white' ? '♔' : s === 'black' ? '♚' : '♔♚'}</div>
            {s === 'white' ? 'Wit' : s === 'black' ? 'Zwart' : 'Beide'}
          </button>
        ))}
      </div>
    </div>,
    <div key="2" className="space-y-4">
      <h2 className="text-xl font-bold">Welke openingen wil je leren?</h2>
      <p className="text-sm text-muted">De 20 populairste openingsfamilies op Lichess, op basis van {manifest.source.games.usedGames.toLocaleString('nl-NL')} echte partijen. Je kunt dit later altijd aanpassen.</p>
      {(['white', 'black'] as const).filter(s => sides === 'both' || sides === s).map(side => (
        <div key={side}>
          <h3 className="mb-2 font-semibold">{side === 'white' ? 'Met wit' : 'Met zwart'}</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {manifest.families.filter(f => f.side === side).map(f => (
              <button key={f.id} className={`card flex items-center gap-3 p-3 text-left ${openings.includes(f.id) ? 'border-brand ring-2 ring-brand/30' : 'hover:border-brand'}`} onClick={() => toggle(f.id)}>
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${openings.includes(f.id) ? 'border-brand bg-brand text-white' : 'border-line'}`}>{openings.includes(f.id) ? '✓' : ''}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{f.name}</span>
                  <span className="block text-xs text-muted">{OPENING_INFO[f.id]?.nameNl} · {f.variationCount} varianten · {pct(f.share, 1)} van de partijen</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>,
    <div key="3" className="space-y-4">
      <h2 className="text-xl font-bold">Hoeveel minuten per dag?</h2>
      <div className="grid grid-cols-4 gap-2">
        {([5, 10, 15, 20] as const).map(m => (
          <button key={m} className={`card p-4 text-center ${minutes === m ? 'border-brand ring-2 ring-brand/30' : ''}`} onClick={() => setMinutes(m)}>
            <div className="text-2xl font-bold">{m}</div>
            <div className="text-xs text-muted">minuten</div>
          </button>
        ))}
      </div>
      <p className="text-sm text-muted">Alles wordt lokaal op dit apparaat bewaard. Geen account, geen abonnement.</p>
    </div>,
  ]

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 text-center">
        <img src="./icon.svg" alt="" className="mx-auto h-14 w-14" />
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight">Welkom bij SchaakRoute</h1>
        <p className="mt-1 text-muted">Leer openingen door ze zelf te spelen — met alle varianten uit de openbare Lichess-database.</p>
      </div>
      <div className="mb-4 flex gap-1.5">{steps.map((_, i) => <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-brand' : 'bg-surface-2'}`} />)}</div>
      <div className="card p-5 sm:p-6">{steps[step]}</div>
      <div className="mt-4 flex justify-between">
        <button className="btn btn-ghost" onClick={() => setStep(s => s - 1)} disabled={step === 0}>Vorige</button>
        {step < steps.length - 1
          ? <button className="btn btn-primary" onClick={() => setStep(s => s + 1)}>Volgende</button>
          : <button className="btn btn-primary" onClick={finish}>Aan de slag</button>}
      </div>
    </div>
  )
}
