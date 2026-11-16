import { useState, type ReactNode } from 'react'
import { BookMarked, Cpu, Languages, ShieldCheck, Gauge, HardDriveDownload, HardDriveUpload, KeyRound, ScrollText, SunMoon, Timer, Trash2 } from 'lucide-react'
import { db, saveSettings, type UserSettings } from '../lib/db'
import { analyse, engineStatus } from '../lib/engine'
import { importBackup, summarizeBackup } from '../lib/progress'
import { saveBackupFile } from '../lib/backup'
import { useManifest } from '../lib/hooks'
import { PageHeader, Spinner, useSettings } from '../components/ui'
import { getLang, locale, t, tr } from '../lib/i18n'
import { SuccessNote } from '../components/PieceMotion'
import { ActionRow, ExpandRow, FileRow, LinkRow, SettingsGroup, SwitchRow } from '../components/SettingsList'

// Ontwerp ronde 10: één gegroepeerde lijst. Tik op een rij om die instelling hier open te klappen.

// Dezelfde niveaus als in de kennismaking (Onboarding.tsx). Teksten zijn Nederlandse sleutels voor t().
const STRENGTHS: { value: UserSettings['strength']; label: string; elo: number }[] = [
  { value: 'beginner', label: 'Beginner', elo: 900 },
  { value: 'club', label: 'Clubspeler', elo: 1400 },
  { value: 'gevorderd', label: 'Gevorderd', elo: 1800 },
  { value: 'expert', label: 'Sterk', elo: 2100 },
]
const THEMES = [['system', 'Systeem'], ['light', 'Licht'], ['dark', 'Donker']] as const
const MINUTES = [5, 10, 15, 20] as const

type Panel = 'rating' | 'minutes' | 'theme' | 'language' | 'lichess' | 'wipe'

const dateNl = (d: Date | number) => new Date(d).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' })
const dateShort = (d: number) => new Date(d).toLocaleDateString(locale(), { day: 'numeric', month: 'short' })

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
  const [tokenMsgN, setTokenMsgN] = useState(0)
  const [backupMsg, setBackupMsg] = useState<{ ok: boolean; text: string; n: number } | null>(null)
  const [backupBusy, setBackupBusy] = useState<'save' | 'restore' | null>(null)
  if (!s) return <Spinner />
  const set = (p: Partial<UserSettings>) => saveSettings(p)
  const toggle = (p: Panel) => setOpen(o => (o === p ? null : p))

  async function testEngine() {
    setEngineMsg(t('Stockfish laden…'))
    const a = await analyse('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', { depth: 10 })
    setEngineMsg(a ? t('Werkt: Stockfish rekent lokaal (beste zet na 1.e4: {move}).', { move: a.bestmove ?? '' }) : t('Stockfish kon niet laden in deze browser. De app werkt gewoon zonder engine.'))
  }

  async function saveBackup() {
    if (backupBusy) return
    setBackupMsg(null)
    setBackupBusy('save')
    try {
      if ((await saveBackupFile()) === 'saved') setBackupMsg({ ok: true, text: t('Back-up bewaard. Op je andere apparaat zet je hem terug via Instellingen.'), n: Date.now() })
    } catch {
      setBackupMsg({ ok: false, text: t('Bewaren is niet gelukt. Probeer het opnieuw.'), n: Date.now() })
    } finally {
      setBackupBusy(null)
    }
  }

  async function restoreBackup(f: File) {
    setBackupMsg(null)
    try {
      const backup = JSON.parse(await f.text())
      const sum = summarizeBackup(backup)
      const current = await db.cards.filter(c => c.correct > 0).count()
      const from = sum.exportedAt ? t('van {date}', { date: dateNl(sum.exportedAt) }) : t('zonder datum')
      if (!confirm(`${t('Deze back-up is {from} en bevat {positions} geleerde posities en {variations} afgeronde varianten.', { from, positions: sum.positions, variations: sum.variations })}\n\n${t('Hij vervangt je huidige voortgang op dit apparaat ({current} geleerde posities). Doorgaan?', { current })}`)) return
      setBackupBusy('restore')
      await importBackup(backup)
      setBackupMsg({ ok: true, text: t('Back-up {from} teruggezet: {n} geleerde posities.', { from, n: sum.positions }), n: Date.now() })
    } catch (err) {
      setBackupMsg({ ok: false, text: err instanceof SyntaxError ? t('Dit bestand is geen geldige back-up.') : (err as Error).message, n: Date.now() })
    } finally {
      setBackupBusy(null)
    }
  }

  async function wipeAll() {
    if (!confirm(t('Weet je zeker dat je ALLE voortgang wilt wissen?'))) return
    await Promise.all(db.tables.map(t => t.clear()))
    location.reload()
  }

  const themeLabel = t(THEMES.find(([v]) => v === s.theme)?.[1] ?? 'Systeem')

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={t('Instellingen')} />

      <SettingsGroup title={t('Trainen')}>
        <ExpandRow id="rating" open={open === 'rating'} onToggle={() => toggle('rating')} icon={Gauge} tone="brand" label="Rating" value={s.elo}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2" role="group" aria-label={t('Niveau')}>
              {STRENGTHS.map(x => (
                <KeyChoice key={x.value} on={s.strength === x.value} onClick={() => set({ strength: x.value, elo: x.elo })}>
                  {t(x.label)} <span className="font-semibold text-muted tabular-nums">· {x.elo}</span>
                </KeyChoice>
              ))}
            </div>
            <label className="block text-sm">
              <span className="flex justify-between"><span>{t('Precies: Elo, Lichess of Chess.com')}</span><b className="tabular-nums">{s.elo}</b></span>
              <input type="range" min={400} max={2800} step={25} value={s.elo} onChange={e => set({ elo: Number(e.target.value) })} className="mt-1 w-full accent-[var(--brand)]" />
            </label>
          </div>
        </ExpandRow>
        <ExpandRow id="dagdoel" open={open === 'minutes'} onToggle={() => toggle('minutes')} icon={Timer} tone="accent" label={t('Dagdoel')} value={`${s.dailyMinutes} min`}>
          <div className="grid grid-cols-4 gap-2" role="group" aria-label={t('Minuten per dag')}>
            {MINUTES.map(m => <KeyChoice key={m} on={s.dailyMinutes === m} onClick={() => set({ dailyMinutes: m })}>{m} min</KeyChoice>)}
          </div>
        </ExpandRow>
        <LinkRow to="/welkom" icon={BookMarked} tone="info" label={t('Openingen en kleur')} value={t('{n} gekozen', { n: s.openings.length })} />
      </SettingsGroup>

      <SettingsGroup
        title="App"
        footer={<>{t('Stockfish is een schaakcomputer die op je eigen apparaat rekent. Hij helpt om speelbare zetten van echte fouten te onderscheiden en laadt pas als je hem aanzet.')} <a className="inline-flex min-h-11 items-center underline" href="./engine/SOURCE.md" target="_blank" rel="noreferrer">{t('Broncode en licentie')}</a></>}
      >
        <ExpandRow id="weergave" open={open === 'theme'} onToggle={() => toggle('theme')} icon={SunMoon} label={t('Weergave')} value={themeLabel}>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label={t('Weergave')}>
            {THEMES.map(([v, l]) => <KeyChoice key={v} on={s.theme === v} onClick={() => set({ theme: v })}>{t(l)}</KeyChoice>)}
          </div>
        </ExpandRow>
        {/* Taal: de namen staan altijd in hun eigen taal, zodat je ze herkent ook als je de andere taal niet leest */}
        <ExpandRow id="taal" open={open === 'language'} onToggle={() => toggle('language')} icon={Languages} label="Taal · Language" value={getLang() === 'en' ? 'English' : 'Nederlands'}>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Taal · Language">
            <KeyChoice on={getLang() === 'nl'} onClick={() => set({ language: 'nl' })}><span lang="nl">Nederlands</span></KeyChoice>
            <KeyChoice on={getLang() === 'en'} onClick={() => set({ language: 'en' })}><span lang="en">English</span></KeyChoice>
          </div>
        </ExpandRow>
        <div>
          <SwitchRow icon={Cpu} label={t('Stockfish gebruiken')} sub={t('lokaal, 1,8 MB')} checked={s.engineEnabled} onChange={v => { set({ engineEnabled: v }); if (!v) setEngineMsg(null) }} />
          {s.engineEnabled && (
            <div className="px-3.5 pb-4">
              <button type="button" className="tap min-h-11 px-4 text-sm font-bold" onClick={testEngine}>{t('Test de engine')}</button>
              {engineMsg && <p className="mt-2 text-sm" role="status">{engineMsg} <span className="text-xs text-muted">({engineStatus()})</span></p>}
            </div>
          )}
        </div>
        <ExpandRow id="lichess" open={open === 'lichess'} onToggle={() => toggle('lichess')} icon={KeyRound} label={t('Lichess-code')} value={s.lichessToken ? t('ingesteld') : t('niet ingesteld')}>
          <div className="space-y-3">
            <p className="text-sm text-muted">{tr(
              <>Voor de nieuwste statistieken van de Lichess Opening Explorer heb je een gratis persoonlijke code (token) nodig. <a className="underline" href="https://lichess.org/account/oauth/token" target="_blank" rel="noreferrer">Maak er een aan op Lichess</a>, zonder extra rechten. De code blijft op dit apparaat. Zonder code gebruikt de app de ingebouwde statistieken.</>,
              <>For the latest stats from the Lichess Opening Explorer you need a free personal token. <a className="underline" href="https://lichess.org/account/oauth/token" target="_blank" rel="noreferrer">Create one on Lichess</a>, without any extra permissions. The token stays on this device. Without a token, the app uses its built-in stats.</>,
            )}</p>
            <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); set({ lichessToken: token?.trim() || undefined }); setToken(null); setTokenMsg(t('Code opgeslagen.')); setTokenMsgN(n => n + 1) }}>
              <label className="sr-only" htmlFor="lichess-token">{t('Lichess-code')}</label>
              <input id="lichess-token" className="input min-h-[3.375rem] min-w-0 flex-1 basis-48" type="password" autoComplete="off" placeholder={s.lichessToken ? t('Code ingesteld (•••)') : 'lip_…'} value={token ?? ''} onChange={e => setToken(e.target.value)} />
              <button type="submit" className="btn btn-primary px-5" disabled={!token?.trim()}>{t('Opslaan')}</button>
              {s.lichessToken && <button type="button" className="tap min-h-[3.375rem] px-4 text-sm font-bold" onClick={() => { set({ lichessToken: undefined }); setTokenMsg(t('Code gewist.')) }}>{t('Wissen')}</button>}
            </form>
            {tokenMsg && <div className="text-sm text-brand-strong" role="status">{tokenMsg === t('Code opgeslagen.') ? <SuccessNote key={tokenMsgN}>{tokenMsg}</SuccessNote> : tokenMsg}</div>}
          </div>
        </ExpandRow>
      </SettingsGroup>

      <SettingsGroup
        title={t('Voortgang')}
        footer={<span title={manifest?.datasetVersion ? `Dataset ${manifest.datasetVersion}` : undefined}>{t('Je voortgang staat alleen op dit apparaat. Wil je verder op een ander apparaat? Bewaar een back-up en zet hem daar terug. Updates van de openingsdata wissen nooit je voortgang.')}</span>}
      >
        <ActionRow onClick={saveBackup} icon={HardDriveDownload} tone="brand" label={t('Back-up bewaren')} value={s.lastBackupAt ? dateShort(s.lastBackupAt) : t('nog nooit')} busy={backupBusy === 'save'} />
        <FileRow accept="application/json,.json" onFile={f => void restoreBackup(f)} icon={HardDriveUpload} label={t('Back-up terugzetten')} busy={backupBusy === 'restore'} />
        <ExpandRow id="wissen" open={open === 'wipe'} onToggle={() => toggle('wipe')} icon={Trash2} tone="danger" label={t('Alles wissen')} danger>
          <div className="rounded-xl bg-danger-soft p-3 text-sm">
            <p>{t('Dit wist al je voortgang op dit apparaat en kan niet ongedaan worden gemaakt. Bewaar eerst een back-up.')}</p>
            <button type="button" className="tap mt-3 min-h-11 px-4 text-sm font-bold text-danger-ink" onClick={wipeAll}>{t('Alles wissen')}</button>
          </div>
        </ExpandRow>
      </SettingsGroup>
      <div className={backupMsg ? `-mt-3 px-1 text-sm ${backupMsg.ok ? 'text-brand-strong' : 'text-danger-ink'}` : 'sr-only'} role="status">
        {backupMsg?.ok ? <SuccessNote key={backupMsg.n}>{backupMsg.text}</SuccessNote> : backupMsg?.text}
      </div>

      <SettingsGroup title={t('Over de app')}>
        <LinkRow to="/bronnen" icon={ScrollText} label={t('Bronnen, methode en licenties')} />
        <LinkRow to="/privacy" icon={ShieldCheck} label={t('Privacy')} />
      </SettingsGroup>
    </div>
  )
}
