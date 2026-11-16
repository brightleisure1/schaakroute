import { Link } from 'react-router'
import { PageHeader } from '../components/ui'
import { t, tr } from '../lib/i18n'

// Privacy in gewone taal. Houd dit kloppend als de app iets nieuws gaat versturen (statistieken, feedback, account).

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-2 p-5 text-sm leading-relaxed">
      <h2 className="text-base font-bold">{title}</h2>
      {children}
    </section>
  )
}

export function Privacy() {
  return (
    <div className="space-y-4 lg:max-w-3xl">
      <PageHeader title={t('Privacy')} subtitle={t('Kort en eerlijk: wat er met je gegevens gebeurt.')} />
      <Block title={t('Alles blijft op je eigen apparaat')}>
        <p>{tr(
          'SchaakRoute heeft geen account, geen cookies, geen advertenties en geen tracking. Je voortgang, instellingen, geanalyseerde partijen en back-ups staan alleen in de opslag van je eigen browser of app. De maker van SchaakRoute kan er niet bij en ziet niet wie de app gebruikt.',
          'SchaakRoute has no account, no cookies, no ads and no tracking. Your progress, settings, analyzed games and backups are stored only in your own browser or app. The maker of SchaakRoute cannot access them and does not see who uses the app.',
        )}</p>
        <p className="text-muted">{tr(
          'Wis je de gegevens van de site of app, of raak je je toestel kwijt, dan is je voortgang weg. Bewaar daarom af en toe een back-up via Instellingen.',
          'If you clear the site or app data, or lose your device, your progress is gone. So save a backup now and then via Settings.',
        )}</p>
      </Block>
      <Block title={t('Stockfish rekent lokaal')}>
        <p>{tr(
          'De schaakcomputer Stockfish en de beoordeling van je zetten draaien op je eigen apparaat. Je partijen worden daarvoor niet verstuurd.',
          'The Stockfish chess engine and the move evaluation run on your own device. Your games are not sent anywhere for this.',
        )}</p>
      </Block>
      <Block title={t('Alleen als je het zelf gebruikt: Lichess en Chess.com')}>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>{tr(
            <><b>Op jouw niveau</b> vraagt openingsstatistieken op bij de Lichess-openingsverkenner (explorer.lichess.org).</>,
            <><b>At your level</b> requests opening statistics from the Lichess opening explorer (explorer.lichess.org).</>,
          )}</li>
          <li>{tr(
            <><b>Partijen ophalen</b> stuurt de gebruikersnaam die je invult naar Lichess (lichess.org) of Chess.com (api.chess.com) om je openbare partijen op te halen. Een Lichess-code die je invult blijft op je apparaat en gaat alleen naar Lichess.</>,
            <><b>Fetching games</b> sends the username you enter to Lichess (lichess.org) or Chess.com (api.chess.com) to fetch your public games. A Lichess token you enter stays on your device and is only sent to Lichess.</>,
          )}</li>
        </ul>
        <p className="text-muted">{tr(
          'Die diensten zien dan je IP-adres en wat er wordt opgevraagd; daarvoor geldt hun eigen privacybeleid.',
          'Those services then see your IP address and what is requested; their own privacy policies apply.',
        )}</p>
      </Block>
      <Block title={t('Delen')}>
        <p>{tr(
          'Een deellink bevat de partij zelf, in de link. Er gaat niets via een server van SchaakRoute; wie de link heeft, kan de partij bekijken.',
          'A share link contains the game itself, inside the link. Nothing goes through a SchaakRoute server; anyone with the link can view the game.',
        )}</p>
      </Block>
      <Block title={t('Hosting')}>
        <p>{tr(
          'De app wordt geladen vanaf GitHub Pages. GitHub kan daarbij technische gegevens zoals je IP-adres vastleggen, zoals elke website-host.',
          'The app is served from GitHub Pages. Like any web host, GitHub may log technical data such as your IP address.',
        )}</p>
      </Block>
      <p className="px-1 text-sm text-muted">
        {tr(
          <>De broncode is openbaar. Meer over de data en licenties staat bij <Link to="/bronnen" className="underline">Bronnen</Link>.</>,
          <>The source code is public. More about the data and licenses is under <Link to="/bronnen" className="underline">Sources</Link>.</>,
        )}
      </p>
    </div>
  )
}
