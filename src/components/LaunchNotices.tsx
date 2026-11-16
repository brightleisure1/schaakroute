import { useEffect, useState } from 'react'
import { HardDriveDownload, Share, Smartphone, X } from 'lucide-react'
import { canPromptInstall, isIos, isStandalone, onInstallChange, promptInstall } from '../lib/install'
import { saveBackupFile } from '../lib/backup'
import type { UserSettings } from '../lib/db'
import { t, tr } from '../lib/i18n'

// Twee meldingen op Start die voorkomen dat je voortgang kwijtraakt (alles staat alleen op dit apparaat):
// 1. Zet de app op je beginscherm. Safari wist gegevens van websites die je een week niet opent; een app op het
//    beginscherm heeft daar geen last van.
// 2. Maak af en toe een back-up, zodat je ook bij een nieuw apparaat verder kunt.
// Steeds hooguit één tegelijk; 'Later' verbergt hem een week (alleen op dit apparaat).

const DAY = 86_400_000
const SNOOZE = 7 * DAY

function snoozed(key: string): boolean {
  try { return Number(localStorage.getItem(key) ?? 0) > Date.now() } catch { return false }
}
function snooze(key: string) {
  try { localStorage.setItem(key, String(Date.now() + SNOOZE)) } catch { /* geen opslag: dan komt hij gewoon terug */ }
}

export function LaunchNotices({ settings, hasProgress }: { settings: UserSettings; hasProgress: boolean }) {
  const [, rerender] = useState(0)
  const [hidden, setHidden] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => onInstallChange(() => rerender(n => n + 1)), [])

  const standalone = isStandalone()
  const ios = isIos()
  const showInstall = hasProgress && !standalone && (ios || canPromptInstall()) && !snoozed('sr-install-later') && !hidden.includes('install')
  const lastBackup = settings.lastBackupAt ?? 0
  const age = Date.now() - settings.createdAt
  const backupDue = hasProgress && (lastBackup ? Date.now() - lastBackup > 30 * DAY : age > 3 * DAY)
  const showBackup = !showInstall && backupDue && !snoozed('sr-backup-later') && !hidden.includes('backup')

  const later = (key: string, id: string) => { snooze(key); setHidden(h => [...h, id]) }

  if (msg) return <p className="card p-4 text-sm font-semibold text-brand-strong animate-fade-in" role="status">{msg}</p>

  if (showInstall) {
    return (
      <section className="card relative flex gap-3.5 p-4 animate-fade-in" aria-labelledby="install-title">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-strong" aria-hidden><Smartphone size={22} /></span>
        <div className="min-w-0 flex-1 pr-8">
          <h2 id="install-title" className="font-bold">{t('Zet SchaakRoute op je beginscherm')}</h2>
          {ios ? (
            <p className="mt-1 text-sm text-muted">
              {tr(
                <>Dan opent hij als app en blijft je voortgang bewaard. Tik in Safari op <Share size={15} className="inline align-[-2px]" aria-label="Deel" /> (soms onder •••) en kies <b className="text-ink">Zet op beginscherm</b>.</>,
                <>It then opens as an app and your progress stays safe. In Safari, tap <Share size={15} className="inline align-[-2px]" aria-label="Share" /> (sometimes under •••) and choose <b className="text-ink">Add to Home Screen</b>.</>,
              )}
            </p>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted">{t('Dan opent hij als app, ook zonder adresbalk, en blijft je voortgang bewaard.')}</p>
              <button className="btn btn-primary mt-3 w-full sm:w-auto" onClick={async () => { if (await promptInstall()) setHidden(h => [...h, 'install']) }}>{t('Installeren')}</button>
            </>
          )}
        </div>
        <button className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink" onClick={() => later('sr-install-later', 'install')} aria-label={t('Later')}><X size={20} aria-hidden /></button>
      </section>
    )
  }

  if (showBackup) {
    return (
      <section className="card relative flex gap-3.5 p-4 animate-fade-in" aria-labelledby="backup-title">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink" aria-hidden><HardDriveDownload size={22} /></span>
        <div className="min-w-0 flex-1 pr-8">
          <h2 id="backup-title" className="font-bold">{lastBackup ? t('Tijd voor een nieuwe back-up') : t('Bewaar een back-up van je voortgang')}</h2>
          <p className="mt-1 text-sm text-muted">{t('Je voortgang staat alleen op dit apparaat. Met een back-up kun je altijd verder, ook op een nieuwe telefoon.')}</p>
          <button
            className="btn btn-primary mt-3 w-full sm:w-auto"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try { if ((await saveBackupFile()) === 'saved') setMsg(t('Back-up bewaard. Terugzetten doe je via Instellingen.')) } catch { setMsg(t('Bewaren is niet gelukt. Probeer het later via Instellingen.')) } finally { setBusy(false) }
            }}
          >{t('Back-up bewaren')}</button>
        </div>
        <button className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink" onClick={() => later('sr-backup-later', 'backup')} aria-label={t('Later')}><X size={20} aria-hidden /></button>
      </section>
    )
  }
  return null
}
