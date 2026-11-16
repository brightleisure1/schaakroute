import { getLang, t } from './i18n'

/** Hier komen de meldingen van testers binnen (gekozen door de maker; staat openbaar in de app) */
export const FEEDBACK_EMAIL = 'devinverhagen3@gmail.com'

/**
 * Link die de mailapp opent met een kant-en-klaar bericht. Onderaan staan het scherm, het toestel en de taal,
 * zodat een melding meteen na te spelen is. Er gaat niets automatisch weg: de tester verstuurt zelf.
 */
export function feedbackHref(): string {
  const route = location.hash.replace(/^#/, '') || '/'
  const info = [
    `${t('Scherm')}: ${route}`,
    `${t('Apparaat')}: ${navigator.userAgent}`,
    `${t('Schermgrootte')}: ${innerWidth}×${innerHeight}`,
    `${t('Taal')}: ${getLang()}`,
    `${t('Datum')}: ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
  ].join('\n')
  const body = `${t('Wat ging er mis, of wat kan beter?')}\n\n\n\n${t('Tip: voeg een screenshot toe.')}\n\n---\n${info}`
  return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(t('Feedback over SchaakRoute'))}&body=${encodeURIComponent(body)}`
}
