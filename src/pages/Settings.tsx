import { useState } from 'react'
import { Link } from 'react-router'
import { db, saveSettings, type UserSettings } from '../lib/db'
import { analyse, engineStatus } from '../lib/engine'
import { exportBackup, importBackup, summarizeBackup } from '../lib/progress'
import { useManifest } from '../lib/hooks'
import { PageHeader, Spinner, useSettings } from '../components/ui'

export function Settings() {
  const s = useSettings()
  const { data: manifest } = useManifest()
  const [engineMsg, setEngineMsg] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  if (!s) return <Spinner />
  const set = (p: Partial<UserSettings>) => saveSettings(p)

  async function testEngine() {
    setEngineMsg('Stockfish laden…')
    const a = await analyse('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', { depth: 10 })
    setEngineMsg(a ? `Werkt: Stockfish rekent lokaal (beste zet na 1.e4: ${a.bestmove}).` : 'Stockfish kon niet laden in deze browser. De app werkt gewoon zonder engine.')
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title="Instellingen" />
      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">Profiel</h2>
        <label className="block text-sm">Rating: <b>{s.elo}</b><input type="range" min={400} max={2800} step={25} value={s.elo} onChange={e => set({ elo: Number(e.target.value) })} className="mt-1 w-full accent-[var(--brand)]" /></label>
        <div className="flex flex-wrap items-center gap-2 text-sm">Dagelijks:
          {([5, 10, 15, 20] as const).map(m => <button key={m} aria-pressed={s.dailyMinutes === m} className={`chip min-h-11 px-3 ${s.dailyMinutes === m ? 'chip-on' : ''}`} onClick={() => set({ dailyMinutes: m })}>{m} min</button>)}
        </div>
        <Link to="/welkom" className="btn btn-ghost">Openingen, kleur en niveau opnieuw kiezen</Link>
      </section>
      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">Weergave</h2>
        <div className="flex gap-2">
          {([['system', 'Systeem'], ['light', 'Licht'], ['dark', 'Donker']] as const).map(([v, l]) => <button key={v} aria-pressed={s.theme === v} className={`chip min-h-11 px-3 ${s.theme === v ? 'chip-on' : ''}`} onClick={() => set({ theme: v })}>{l}</button>)}
        </div>
      </section>
      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">Stockfish (optioneel, lokaal)</h2>
        <p className="text-sm text-muted">Een schaakcomputer die op je eigen apparaat rekent. Hij helpt om speelbare zetten van echte fouten te onderscheiden. Hij laadt pas als je hem aanzet (1,8 MB). <a className="underline" href="./engine/SOURCE.md" target="_blank" rel="noreferrer">Broncode en licentie</a></p>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"><input type="checkbox" checked={s.engineEnabled} onChange={e => set({ engineEnabled: e.target.checked })} className="h-5 w-5 shrink-0 accent-[var(--brand)]" /> Stockfish gebruiken</label>
        {s.engineEnabled && <button className="btn btn-ghost" onClick={testEngine}>Test de engine</button>}
        {engineMsg && <p className="text-sm">{engineMsg} <span className="text-xs text-muted">({engineStatus()})</span></p>}
      </section>
      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">Lichess Opening Explorer (optioneel)</h2>
        <p className="text-sm text-muted">Voor de nieuwste statistieken van Lichess heb je een gratis persoonlijke code (token) nodig. <a className="underline" href="https://lichess.org/account/oauth/token" target="_blank" rel="noreferrer">Maak er een aan op Lichess</a>, zonder extra rechten. De code blijft op dit apparaat. Zonder code gebruikt de app de ingebouwde statistieken.</p>
        <div className="flex gap-2">
          <input className="input" type="password" autoComplete="off" placeholder={s.lichessToken ? 'Token ingesteld (•••)' : 'lip_…'} value={token ?? ''} onChange={e => setToken(e.target.value)} />
          <button className="btn btn-primary" onClick={() => { set({ lichessToken: token?.trim() || undefined }); setToken(null); setMsg('Token opgeslagen.') }}>Opslaan</button>
          {s.lichessToken && <button className="btn btn-ghost" onClick={() => set({ lichessToken: undefined })}>Wissen</button>}
        </div>
        {msg && <p className="text-sm text-brand-strong">{msg}</p>}
      </section>
      <BackupSection lastBackupAt={s.lastBackupAt} datasetVersion={manifest?.datasetVersion} />
      <section className="card p-4 text-sm text-muted">
        <Link to="/bronnen" className="underline">Bronnen, methode en licenties</Link>
      </section>
    </div>
  )
}

const dateNl = (d: Date | number) => new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })

/** Voortgang bewaren en op een ander apparaat terugzetten (alles staat alleen lokaal) */
function BackupSection({ lastBackupAt, datasetVersion }: { lastBackupAt?: number; datasetVersion?: string }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function save() {
    setMsg(null)
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
      setMsg({ ok: true, text: 'Back-up bewaard. Op je andere apparaat zet je hem terug via Instellingen.' })
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setMsg({ ok: false, text: 'Bewaren is niet gelukt. Probeer het opnieuw.' })
    }
  }

  async function restore(f: File) {
    setMsg(null)
    try {
      const backup = JSON.parse(await f.text())
      const sum = summarizeBackup(backup)
      const current = await db.cards.filter(c => c.correct > 0).count()
      const from = sum.exportedAt ? `van ${dateNl(sum.exportedAt)}` : 'zonder datum'
      if (!confirm(`Deze back-up is ${from} en bevat ${sum.positions} geleerde posities en ${sum.variations} afgeronde varianten.\n\nHij vervangt je huidige voortgang op dit apparaat (${current} geleerde posities). Doorgaan?`)) return
      await importBackup(backup)
      setMsg({ ok: true, text: `Back-up ${from} teruggezet: ${sum.positions} geleerde posities.` })
    } catch (err) {
      setMsg({ ok: false, text: err instanceof SyntaxError ? 'Dit bestand is geen geldige back-up.' : (err as Error).message })
    }
  }

  return (
    <section className="card space-y-3 p-4" aria-labelledby="backup-title">
      <h2 id="backup-title" className="font-semibold">Voortgang en back-up</h2>
      <p className="text-sm text-muted">Je voortgang staat alleen op dit apparaat. Wil je verder op je telefoon of een ander apparaat? Bewaar een back-up en zet hem daar terug.</p>
      <p className="text-sm">Laatste back-up: <b>{lastBackupAt ? dateNl(lastBackupAt) : 'nog nooit'}</b></p>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" onClick={save}>Back-up bewaren</button>
        <label className="btn btn-ghost cursor-pointer focus-within:ring-2 focus-within:ring-brand">Back-up terugzetten<input type="file" accept="application/json,.json" className="sr-only" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void restore(f) }} /></label>
      </div>
      {msg && <p className={`text-sm ${msg.ok ? 'text-brand-strong' : 'text-danger-ink'}`} role="status">{msg.text}</p>}
      <details className="text-sm">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-muted">Alles wissen</summary>
        <div className="mt-2 rounded-xl bg-danger-soft p-3">
          <p>Dit wist al je voortgang op dit apparaat en kan niet ongedaan worden gemaakt. Bewaar eerst een back-up.</p>
          <button className="btn btn-ghost mt-2 text-danger-ink" onClick={async () => { if (confirm('Weet je zeker dat je ALLE voortgang wilt wissen?')) { await Promise.all(db.tables.map(t => t.clear())); location.reload() } }}>Alles wissen</button>
        </div>
      </details>
      <p className="text-xs text-muted" title={datasetVersion ? `Dataset ${datasetVersion}` : undefined}>Updates van de openingsdata wissen nooit je voortgang.</p>
    </section>
  )
}
