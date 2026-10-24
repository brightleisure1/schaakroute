import { useState } from 'react'
import { Link } from 'react-router'
import { db, saveSettings, type UserSettings } from '../lib/db'
import { analyse, engineStatus } from '../lib/engine'
import { exportBackup, importBackup } from '../lib/progress'
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

  async function backup() {
    const data = await exportBackup()
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `schaakroute-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
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
        <p className="text-sm text-muted">Stockfish 19 lite draait als WebAssembly in een Web Worker op je eigen apparaat (±1,8 MB, wordt pas geladen als je hem aanzet). Gebruikt voor het onderscheiden van speelbare en slechte zetten en voor evaluaties. Licentie: GPLv3 — <a className="underline" href="./engine/SOURCE.md" target="_blank" rel="noreferrer">broncode en licentie</a>.</p>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.engineEnabled} onChange={e => set({ engineEnabled: e.target.checked })} className="h-4 w-4 accent-[var(--brand)]" /> Stockfish gebruiken</label>
        {s.engineEnabled && <button className="btn btn-ghost" onClick={testEngine}>Test de engine</button>}
        {engineMsg && <p className="text-sm">{engineMsg} <span className="text-xs text-muted">({engineStatus()})</span></p>}
      </section>
      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">Lichess Opening Explorer (optioneel)</h2>
        <p className="text-sm text-muted">Sinds 2025 vereist de Explorer-API een persoonlijk Lichess-token. Dat is gratis: maak er een aan op <a className="underline" href="https://lichess.org/account/oauth/token" target="_blank" rel="noreferrer">lichess.org/account/oauth/token</a> (geen extra rechten nodig). Het token wordt alleen lokaal bewaard en alleen naar explorer.lichess.org gestuurd. Zonder token gebruikt de app de offline statistieken.</p>
        <div className="flex gap-2">
          <input className="input" type="password" autoComplete="off" placeholder={s.lichessToken ? 'Token ingesteld (•••)' : 'lip_…'} value={token ?? ''} onChange={e => setToken(e.target.value)} />
          <button className="btn btn-primary" onClick={() => { set({ lichessToken: token?.trim() || undefined }); setToken(null); setMsg('Token opgeslagen.') }}>Opslaan</button>
          {s.lichessToken && <button className="btn btn-ghost" onClick={() => set({ lichessToken: undefined })}>Wissen</button>}
        </div>
        {msg && <p className="text-sm text-brand-strong">{msg}</p>}
      </section>
      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">Gegevens</h2>
        <p className="text-sm text-muted">Al je voortgang staat in IndexedDB op dit apparaat. Maak een back-up om hem naar een ander apparaat over te zetten. Dataset: <span className="font-mono text-xs">{manifest?.datasetVersion}</span> — een nieuwe datasetversie wist nooit je voortgang.</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-ghost" onClick={backup}>Back-up downloaden</button>
          <label className="btn btn-ghost cursor-pointer">Back-up terugzetten<input type="file" accept="application/json" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; try { await importBackup(JSON.parse(await f.text())); setMsg('Back-up teruggezet.') } catch (err) { setMsg((err as Error).message) } }} /></label>
          <button className="btn btn-ghost text-danger-ink" onClick={async () => { if (confirm('Weet je zeker dat je ALLE voortgang wilt wissen? Dit kan niet ongedaan worden gemaakt.')) { await Promise.all(db.tables.map(t => t.clear())); location.reload() } }}>Alles wissen</button>
        </div>
      </section>
      <section className="card p-4 text-sm text-muted">
        <Link to="/bronnen" className="underline">Bronnen, methode en licenties</Link>
      </section>
    </div>
  )
}
