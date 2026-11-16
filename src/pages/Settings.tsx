import { useState, type ReactNode } from 'react'
import { BookMarked, Cpu, Gauge, HardDriveDownload, HardDriveUpload, KeyRound, ScrollText, SunMoon, Timer, Trash2 } from 'lucide-react'
import { db, saveSettings, type UserSettings } from '../lib/db'
import { analyse, engineStatus } from '../lib/engine'
import { exportBackup, importBackup, summarizeBackup } from '../lib/progress'
import { useManifest } from '../lib/hooks'
import { PageHeader, Spinner, useSettings } from '../components/ui'
import { ActionRow, ExpandRow, FileRow, LinkRow, SettingsGroup, SwitchRow } from '../components/SettingsList'

// Ontwerp ronde 10: één gegroepeerde lijst. Tik op een rij om die instelling hier open te klappen.

// Dezelfde niveaus als in de kennismaking (Onboarding.tsx)
const STRENGTHS: { value: UserSettings['strength']; label: string; elo: number }[] = [
  { value: 'beginner', label: 'Beginner', elo: 900 },
  { value: 'club', label: 'Clubspeler', elo: 1400 },
  { value: 'gevorderd', label: 'Gevorderd', elo: 1800 },
  { value: 'expert', label: 'Sterk', elo: 2100 },
]
const THEMES = [['system', 'Systeem'], ['light', 'Licht'], ['dark', 'Donker']] as const
const MINUTES = [5, 10, 15, 20] as const

type Panel = 'rating' | 'minutes' | 'theme' | 'lichess' | 'wipe'

const dateNl = (d: Date | number) => new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
const dateShort = (d: number) => new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })

/** Toets in een keuzerij: gekozen = groen */
function KeyChoice({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`tap min-h-12 px-3 text-sm font-bold ${on ? 'tap-on text-brand-strong' : ''}`}>
      {children}
    </button>
  )
}

export function Settings() {
  const s = useSettings()
  const { data: manifest } = useManifest()
  const [open, setOpen] = useState<Panel | null>(null)
  const [engineMsg, setEngineMsg] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [tokenMsg, setTokenMsg] = useState<string | null>(null)
  const [backupMsg, setBackupMsg] = useState<{ ok: boolean; text: string } | null>(null)
  if (!s) return <Spinner />
  const set = (p: Partial<UserSettings>) => saveSettings(p)
  const toggle = (p: Panel) => setOpen(o => (o === p ? null : p))

  async function testEngine() {
    setEngineMsg('Stockfish laden…')
    const a = await analyse('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', { depth: 10 })
    setEngineMsg(a ? `Werkt: Stockfish rekent lokaal (beste zet na 1.e4: ${a.bestmove}).` : 'Stockfish kon niet laden in deze browser. De app werkt gewoon zonder engine.')
  }

  async function saveBackup() {
    setBackupMsg(null)
    const name = `schaakroute-backup-${new Date().toISOString().slice(0, 10)}.json`
    const file = new File([JSON.stringify(await exportBackup())], name, { type: 'application/json' })
    try {
      // Telefoon: deelmenu (AirDrop, Bewaar in Bestanden, mail). Desktop: gewone download.
      if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'SchaakRoute-back-up' })
      } else {
        const url = URL.createObjectURL(file)
        const a = document.createElement('a')
        a.href = url
        a.download = name
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
      await saveSettings({ lastBackupAt: Date.now() })
      setBackupMsg({ ok: true, text: 'Back-up bewaard. Op je andere apparaat zet je hem terug via Instellingen.' })
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setBackupMsg({ ok: false, text: 'Bewaren is niet gelukt. Probeer het opnieuw.' })
    }
  }

  async function restoreBackup(f: File) {
    setBackupMsg(null)
    try {
      const backup = JSON.parse(await f.text())
      const sum = summarizeBackup(backup)
      const current = await db.cards.filter(c => c.correct > 0).count()
      const from = sum.exportedAt ? `van ${dateNl(sum.exportedAt)}` : 'zonder datum'
      if (!confirm(`Deze back-up is ${from} en bevat ${sum.positions} geleerde posities en ${sum.variations} afgeronde varianten.\n\nHij vervangt je huidige voortgang op dit apparaat (${current} geleerde posities). Doorgaan?`)) return
      await importBackup(backup)
      setBackupMsg({ ok: true, text: `Back-up ${from} teruggezet: ${sum.positions} geleerde posities.` })
    } catch (err) {
      setBackupMsg({ ok: false, text: err instanceof SyntaxError ? 'Dit bestand is geen geldige back-up.' : (err as Error).message })
    }
  }

  async function wipeAll() {
    if (!confirm('Weet je zeker dat je ALLE voortgang wilt wissen?')) return
    await Promise.all(db.tables.map(t => t.clear()))
    location.reload()
  }

  const themeLabel = THEMES.find(([v]) => v === s.theme)?.[1] ?? 'Systeem'

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Instellingen" />

      <SettingsGroup title="Trainen">
        <ExpandRow id="rating" open={open === 'rating'} onToggle={() => toggle('rating')} icon={Gauge} tone="brand" label="Rating" value={s.elo}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Niveau">
              {STRENGTHS.map(x => (
                <KeyChoice key={x.value} on={s.strength === x.value} onClick={() => set({ strength: x.value, elo: x.elo })}>
                  {x.label} <span className="font-semibold text-muted tabular-nums">· {x.elo}</span>
                </KeyChoice>
              ))}
            </div>
            <label className="block text-sm">
              <span className="flex justify-between"><span>Precies: Elo, Lichess of Chess.com</span><b className="tabular-nums">{s.elo}</b></span>
              <input type="range" min={400} max={2800} step={25} value={s.elo} onChange={e => set({ elo: Number(e.target.value) })} className="mt-1 w-full accent-[var(--brand)]" />
            </label>
          </div>
        </ExpandRow>
        <ExpandRow id="dagdoel" open={open === 'minutes'} onToggle={() => toggle('minutes')} icon={Timer} tone="accent" label="Dagdoel" value={`${s.dailyMinutes} min`}>
          <div className="grid grid-cols-4 gap-2" role="group" aria-label="Minuten per dag">
            {MINUTES.map(m => <KeyChoice key={m} on={s.dailyMinutes === m} onClick={() => set({ dailyMinutes: m })}>{m} min</KeyChoice>)}
          </div>
        </ExpandRow>
        <LinkRow to="/welkom" icon={BookMarked} tone="info" label="Openingen en kleur" value={`${s.openings.length} gekozen`} />
      </SettingsGroup>

      <SettingsGroup
        title="App"
        footer={<>Stockfish is een schaakcomputer die op je eigen apparaat rekent. Hij helpt om speelbare zetten van echte fouten te onderscheiden en laadt pas als je hem aanzet. <a className="inline-flex min-h-11 items-center underline" href="./engine/SOURCE.md" target="_blank" rel="noreferrer">Broncode en licentie</a></>}
      >
        <ExpandRow id="weergave" open={open === 'theme'} onToggle={() => toggle('theme')} icon={SunMoon} label="Weergave" value={themeLabel}>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Weergave">
            {THEMES.map(([v, l]) => <KeyChoice key={v} on={s.theme === v} onClick={() => set({ theme: v })}>{l}</KeyChoice>)}
          </div>
        </ExpandRow>
        <div>
          <SwitchRow icon={Cpu} label="Stockfish gebruiken" sub="lokaal, 1,8 MB" checked={s.engineEnabled} onChange={v => { set({ engineEnabled: v }); if (!v) setEngineMsg(null) }} />
          {s.engineEnabled && (
            <div className="px-3.5 pb-4">
              <button type="button" className="tap min-h-11 px-4 text-sm font-bold" onClick={testEngine}>Test de engine</button>
              {engineMsg && <p className="mt-2 text-sm" role="status">{engineMsg} <span className="text-xs text-muted">({engineStatus()})</span></p>}
            </div>
          )}
        </div>
        <ExpandRow id="lichess" open={open === 'lichess'} onToggle={() => toggle('lichess')} icon={KeyRound} label="Lichess-code" value={s.lichessToken ? 'ingesteld' : 'niet ingesteld'}>
          <div className="space-y-3">
            <p className="text-sm text-muted">Voor de nieuwste statistieken van de Lichess Opening Explorer heb je een gratis persoonlijke code (token) nodig. <a className="underline" href="https://lichess.org/account/oauth/token" target="_blank" rel="noreferrer">Maak er een aan op Lichess</a>, zonder extra rechten. De code blijft op dit apparaat. Zonder code gebruikt de app de ingebouwde statistieken.</p>
            <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); set({ lichessToken: token?.trim() || undefined }); setToken(null); setTokenMsg('Code opgeslagen.') }}>
              <label className="sr-only" htmlFor="lichess-token">Lichess-code</label>
              <input id="lichess-token" className="input min-h-[3.375rem] min-w-0 flex-1 basis-48" type="password" autoComplete="off" placeholder={s.lichessToken ? 'Code ingesteld (•••)' : 'lip_…'} value={token ?? ''} onChange={e => setToken(e.target.value)} />
              <button type="submit" className="btn btn-primary px-5" disabled={!token?.trim()}>Opslaan</button>
              {s.lichessToken && <button type="button" className="tap min-h-[3.375rem] px-4 text-sm font-bold" onClick={() => { set({ lichessToken: undefined }); setTokenMsg('Code gewist.') }}>Wissen</button>}
            </form>
            {tokenMsg && <p className="text-sm text-brand-strong" role="status">{tokenMsg}</p>}
          </div>
        </ExpandRow>
      </SettingsGroup>

      <SettingsGroup
        title="Voortgang"
        footer={<span title={manifest?.datasetVersion ? `Dataset ${manifest.datasetVersion}` : undefined}>Je voortgang staat alleen op dit apparaat. Wil je verder op een ander apparaat? Bewaar een back-up en zet hem daar terug. Updates van de openingsdata wissen nooit je voortgang.</span>}
      >
        <ActionRow onClick={saveBackup} icon={HardDriveDownload} tone="brand" label="Back-up bewaren" value={s.lastBackupAt ? dateShort(s.lastBackupAt) : 'nog nooit'} />
        <FileRow accept="application/json,.json" onFile={f => void restoreBackup(f)} icon={HardDriveUpload} label="Back-up terugzetten" />
        <ExpandRow id="wissen" open={open === 'wipe'} onToggle={() => toggle('wipe')} icon={Trash2} tone="danger" label="Alles wissen" danger>
          <div className="rounded-xl bg-danger-soft p-3 text-sm">
            <p>Dit wist al je voortgang op dit apparaat en kan niet ongedaan worden gemaakt. Bewaar eerst een back-up.</p>
            <button type="button" className="tap mt-3 min-h-11 px-4 text-sm font-bold text-danger-ink" onClick={wipeAll}>Alles wissen</button>
          </div>
        </ExpandRow>
      </SettingsGroup>
      <p className={backupMsg ? `-mt-3 px-1 text-sm ${backupMsg.ok ? 'text-brand-strong' : 'text-danger-ink'}` : 'sr-only'} role="status">{backupMsg?.text}</p>

      <SettingsGroup title="Over de app">
        <LinkRow to="/bronnen" icon={ScrollText} label="Bronnen, methode en licenties" />
      </SettingsGroup>
    </div>
  )
}
