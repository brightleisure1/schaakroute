import { exportBackup } from './progress'
import { saveSettings } from './db'
import { t } from './i18n'

/**
 * Bewaart een back-up als bestand. Telefoon: het deelmenu (AirDrop, Bewaar in Bestanden, mail); desktop: een download.
 * Geeft 'saved' of 'cancelled' terug; gooit bij een echte fout.
 */
export async function saveBackupFile(): Promise<'saved' | 'cancelled'> {
  const name = `schaakroute-backup-${new Date().toISOString().slice(0, 10)}.json`
  const file = new File([JSON.stringify(await exportBackup())], name, { type: 'application/json' })
  try {
    if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: t('SchaakRoute-back-up') })
    } else {
      const url = URL.createObjectURL(file)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') return 'cancelled'
    throw err
  }
  await saveSettings({ lastBackupAt: Date.now() })
  return 'saved'
}
