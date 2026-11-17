import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, ArrowRight, ChessKnight, CircleCheck, Microscope, Repeat, ShieldCheck, User } from 'lucide-react'
import { saveSettings, type UserSettings } from '../lib/db'
import { useManifest } from '../lib/hooks'
import { OpeningPicker } from '../components/OpeningPicker'
import { PieceIcon } from '../components/CropBoard'
import { ThickProgress, useCloseTraining } from '../components/TrainingModeChrome'
import { ErrorBox, Spinner, useSettings } from '../components/ui'
import { IconField, Segmented } from '../components/Choice'
import { getLang, t, type Lang } from '../lib/i18n'

// Teksten zijn Nederlandse sleutels; vertaald bij het tekenen met t()
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
  // Welkomscherm met de drie onderdelen: alleen voor wie nog niet begonnen is
  const [welcome, setWelcome] = useState(true)
  const [gameSource, setGameSource] = useState<'lichess' | 'chesscom'>('chesscom')
  const [gameUser, setGameUser] = useState('')
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
    if (current?.lichessUser && !current.chesscomUser) setGameSource('lichess')
    setGameUser(current?.chesscomUser ?? current?.lichessUser ?? '')
  }, [current?.onboarded]) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <ErrorBox error={error} />
  if (!manifest) return <Spinner />

  async function finish() {
    if (!openings.length) return
    const user = gameUser.trim()
    await saveSettings({
      onboarded: true, elo, strength, sides, openings, dailyMinutes: minutes,
      ...(user ? (gameSource === 'lichess' ? { lichessUser: user } : { chesscomUser: user }) : {}),
    })
    setFinished(true)
  }

  const steps = [
    <div key="0" className="space-y-4">
      {current?.onboarded && <LanguagePills />}
      <StepTitle title={t('Hoe sterk speel je?')} text={t('Dan kiezen we varianten die bij je passen.')} />
      <div className="grid gap-2 sm:grid-cols-2">
        {STRENGTHS.map(s => (
          <button key={s.value} aria-pressed={strength === s.value} className={`tap p-4 text-left ${strength === s.value ? 'tap-on' : ''}`} onClick={() => { setStrength(s.value); setElo(s.elo) }}>
            <div className="font-semibold">{t(s.label)}</div>
            <div className="text-sm text-muted">{t(s.text)}</div>
          </button>
        ))}
      </div>
      <label className="block">
        <span className="text-sm font-medium">{t('Geschatte rating (Elo, Lichess of Chess.com):')} <b className="tabular-nums">{elo}</b></span>
        <input type="range" min={400} max={2800} step={25} value={elo} onChange={e => setElo(Number(e.target.value))} className="mt-2 w-full accent-[var(--brand)]" />
      </label>
    </div>,
    // Ontwerp 12a: drie grote kaarten met een schaakstuk, de gekozen kaart groen met een vinkje
    <div key="1" className="space-y-3.5">
      <StepTitle title={t('Met welke kleur wil je oefenen?')} text={t('Je kunt dit later per opening aanpassen.')} />
      <div className="flex flex-col gap-3">
        {SIDES.map(s => {
          const on = sides === s.value
          return (
            <button key={s.value} aria-pressed={on} className={`tap flex items-center gap-3.5 p-3.5 text-left ${on ? 'tap-on' : ''}`} onClick={() => { setSides(s.value); setOpenings(o => o.filter(id => s.value === 'both' || manifest.families.find(f => f.id === id)?.side === s.value)) }}>
              <span aria-hidden className={`flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[15px] ${on ? 'bg-surface' : 'bg-surface-2'}`}><PieceIcon piece={s.piece} size={37} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-bold leading-tight">{t(s.label)}</span>
                <span className={`block text-sm ${on ? 'text-brand-strong' : 'text-muted'}`}>{t(s.text)}</span>
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
      <StepTitle title={t('Hoeveel minuten per dag?')} text={t('Met 10 minuten leer je ongeveer één variant per dag.')} />
      <div className="grid grid-cols-2 gap-3">
        {MINUTES.map(m => {
          const on = minutes === m.value
          return (
            <button key={m.value} aria-pressed={on} className={`tap flex flex-col items-center gap-0.5 px-2 py-4 text-center ${on ? 'tap-on' : ''}`} onClick={() => setMinutes(m.value)}>
              <span className="text-[34px] font-extrabold leading-none tracking-[-0.03em] tabular-nums">{m.value}</span>
              <span className="text-[13px] text-muted">{t('minuten')}</span>
              <span className={`mt-2 rounded-full px-2.5 py-0.5 text-xs font-bold ${on ? 'bg-surface text-brand-strong' : 'bg-surface-2 text-muted'}`}>{t(m.label)}</span>
            </button>
          )
        })}
      </div>
    </div>,
    // Optioneel: je partijen koppelen, zodat partij-analyse en foutentrainer meteen werken
    <div key="4" className="space-y-3.5">
      <StepTitle title={t('Waar speel je online?')} text={t('Dan kun je je partijen laten analyseren, en komen je fouten vanzelf in je training. Je kunt dit ook overslaan.')} />
      <Segmented name="onboarding-source" label={t('Waar speel je online?')} value={gameSource} onChange={setGameSource}
        options={[{ value: 'chesscom', label: 'Chess.com' }, { value: 'lichess', label: 'Lichess' }]} />
      <IconField key={gameSource} icon={<User size={18} strokeWidth={2.25} />} label={t('Gebruikersnaam op {source}', { source: gameSource === 'lichess' ? 'Lichess' : 'Chess.com' })}
        placeholder={t('Gebruikersnaam op {source}', { source: gameSource === 'lichess' ? 'Lichess' : 'Chess.com' })} autoComplete="username" autoCapitalize="none" spellCheck={false}
        value={gameUser} onChange={e => setGameUser(e.target.value)} />
      <p className="card flex items-center gap-2.5 px-3.5 py-3 text-sm leading-snug text-muted"><ShieldCheck size={18} aria-hidden className="shrink-0 text-brand-strong" />{t('Geen account en geen wachtwoord nodig: we halen alleen je openbare partijen op. Alles blijft op dit apparaat.')}</p>
    </div>,
  ]
  const needOpening = !openings.length && (step === 2 || step === steps.length - 1)
  const last = step === steps.length - 1

  if (welcome && !current?.onboarded) return <Welcome onStart={() => setWelcome(false)} />

  // Ontwerp 10a/12a: geen kop en geen losse Vorige-knop; terug zit linksboven, de voortgang is één balk
  // en de hoofdknop staat vast onderaan
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.25rem)] max-w-2xl flex-col lg:min-h-0">
      <h1 className="sr-only">{t('Welkom bij SchaakRoute')}</h1>
      <div className="flex items-center gap-3">
        {(step > 0 || current?.onboarded || welcome === false) && (
          <button type="button" className="-ml-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-ink" onClick={() => (step > 0 ? setStep(s => s - 1) : current?.onboarded ? close() : setWelcome(true))} aria-label={step > 0 ? t('Vorige stap') : t('Terug zonder op te slaan')}>
            <ArrowLeft size={22} aria-hidden />
          </button>
        )}
        <div className="min-w-0 flex-1"><ThickProgress value={(step + 1) / steps.length} label={t('Stap {n} van {m}', { n: step + 1, m: steps.length })} /></div>
        <span className="shrink-0 text-sm font-bold tabular-nums text-muted" aria-hidden>{step + 1}/{steps.length}</span>
      </div>
      <div ref={stepRef} tabIndex={-1} className="mt-2.5 outline-none" aria-label={t('Stap {n} van {m}', { n: step + 1, m: steps.length })} role="group">{steps[step]}</div>
      <div className="sticky bottom-0 -mx-4 mt-auto border-t-2 border-line bg-bg px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3.5 sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:mt-6 lg:border-0 lg:bg-transparent lg:p-0">
        {!last
          ? <button className="btn btn-primary w-full" onClick={() => setStep(s => s + 1)} disabled={needOpening} aria-describedby={needOpening ? 'onboarding-reason' : undefined}>{t('Volgende')}</button>
          : <button className="btn btn-primary w-full" onClick={finish} disabled={needOpening} aria-describedby={needOpening ? 'onboarding-reason' : undefined}>{gameUser.trim() || current?.onboarded ? t('Aan de slag') : t('Overslaan en beginnen')}</button>}
        {needOpening && <p id="onboarding-reason" className="btn-reason text-center">{t('Kies eerst minstens één opening.')}</p>}
      </div>
    </div>
  )
}

/** De drie onderdelen van SchaakRoute, die op elkaar aansluiten: speel, laat analyseren, train je fouten */
const PILLARS = [
  { icon: ChessKnight, tone: 'var(--brand)', title: 'Openingstrainer', text: 'Leer je openingen in een paar minuten per dag. Elke variant komt terug precies voordat je hem vergeet.' },
  { icon: Microscope, tone: 'var(--teal)', title: 'Partij-analyse', text: 'Laat je partijen van Chess.com of Lichess beoordelen: per zet zie je wat briljant was en wat een blunder.' },
  { icon: Repeat, tone: 'var(--danger)', title: 'Foutentrainer', text: 'Je fouten uit je eigen partijen komen vanzelf terug in je training, tot je de betere zet kent.' },
] as const

function Welcome({ onStart }: { onStart: () => void }) {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.25rem)] max-w-2xl flex-col lg:min-h-0">
      <LanguagePills />
      <div className="mt-3 flex items-center gap-3">
        <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="h-12 w-12 rounded-[14px]" />
        <span className="text-[22px] font-extrabold tracking-[-0.02em]">Schaak<span className="text-brand-strong">Route</span></span>
      </div>
      <h1 className="mt-5 text-[30px] font-extrabold leading-[1.1] tracking-[-0.03em] sm:text-4xl">{t('Word beter in schaken, met je eigen partijen')}</h1>
      <p className="mt-2 text-[15px] leading-snug text-muted">{t('Drie onderdelen die op elkaar aansluiten. Gratis, zonder account.')}</p>
      <ol className="mt-5 space-y-3">
        {PILLARS.map((p, i) => (
          <li key={p.title} className="card relative flex gap-3.5 p-4 animate-fade-up" style={{ animationDelay: `${i * 80}ms` }}>
            <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]" style={{ color: p.tone, background: `color-mix(in srgb, ${p.tone} 14%, var(--surface))` }}><p.icon size={24} strokeWidth={2.1} /></span>
            <span className="min-w-0">
              <span className="block text-xs font-bold uppercase tracking-[0.04em]" style={{ color: p.tone }}>{t('Stap {n}', { n: i + 1 })}</span>
              <span className="block text-lg font-extrabold leading-tight">{t(p.title)}</span>
              <span className="mt-0.5 block text-sm leading-snug text-muted">{t(p.text)}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm font-bold text-muted" aria-label={t('Speel, analyseer, train je fouten, en herhaal')}>
        <span>{t('Speel')}</span><ArrowRight size={16} aria-hidden /><span>{t('Analyseer')}</span><ArrowRight size={16} aria-hidden /><span>{t('Train je fouten')}</span><Repeat size={15} aria-hidden />
      </p>
      <div className="sticky bottom-0 -mx-4 mt-auto border-t-2 border-line bg-bg px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3.5 sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:mt-6 lg:border-0 lg:bg-transparent lg:p-0">
        <button className="btn btn-primary w-full" onClick={onStart} autoFocus>{t('Begin, het duurt 1 minuut')}</button>
      </div>
    </div>
  )
}

/**
 * Taalkeuze bovenaan de eerste stap, zodat een nieuwe gebruiker meteen kan wisselen.
 * Elke naam staat in zijn eigen taal, zodat je hem herkent ook als je de andere taal niet leest.
 */
function LanguagePills() {
  const lang = getLang()
  const options: { value: Lang; label: string }[] = [{ value: 'nl', label: 'Nederlands' }, { value: 'en', label: 'English' }]
  return (
    <div className="flex justify-end gap-1.5" role="group" aria-label="Taal · Language">
      {options.map(o => (
        <button key={o.value} type="button" lang={o.value} aria-pressed={lang === o.value} className={`pill ${lang === o.value ? 'pill-on' : 'font-medium!'}`} onClick={() => { if (lang !== o.value) void saveSettings({ language: o.value }) }}>
          {o.label}
        </button>
      ))}
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
