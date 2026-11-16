// Installeren als app (PWA). Chrome/Edge/Android geven een 'beforeinstallprompt'; die vangen we zo vroeg mogelijk op,
// zodat de knop op Start hem later kan tonen. Safari op iPhone/iPad kent dat niet: daar leggen we uit hoe het moet.

interface InstallPromptEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault()
    deferred = e as InstallPromptEvent
    listeners.forEach(f => f())
  })
  window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach(f => f()) })
}

export const canPromptInstall = () => !!deferred
export function onInstallChange(f: () => void) { listeners.add(f); return () => { listeners.delete(f) } }

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  const e = deferred
  deferred = null
  await e.prompt()
  const { outcome } = await e.userChoice
  listeners.forEach(f => f())
  return outcome === 'accepted'
}

/** Draait de app al als geïnstalleerde app (vanaf het beginscherm)? */
export function isStandalone(): boolean {
  return matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

/** iPhone of iPad (ook iPadOS dat zich als Mac voordoet) */
export function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}
