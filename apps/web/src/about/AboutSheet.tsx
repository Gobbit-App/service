import { useQuery } from '@tanstack/react-query';
import { useId, useRef, type ReactElement } from 'react';
import { configQuery } from '../api/queries';
import { HEADER_LOGO_SRC } from '../app/AppHeader';
import { usePendingUpdate } from '../app/sw-update-store';
import { Button } from '../ui/buttons/Button';
import { ButtonLink } from '../ui/buttons/ButtonLink';
import { Sheet } from '../ui/sheet/Sheet';
import {
  copyrightLine,
  ISSUES_URL,
  LICENSE_URL,
  NOTICES_PATH,
  releasedLabel,
  SECURITY_URL,
  serverVersion,
  serviceCredits,
  SOURCE_URL,
  versionLabel,
  type VersionLabel,
} from './about-info';
import './about.css';

export interface BuildInfo {
  commit: string;
  builtAt: string;
}

const BUILD: BuildInfo = { commit: __APP_COMMIT__, builtAt: __APP_BUILT_AT__ };

function Version({ version }: { version: VersionLabel }): ReactElement {
  if (!version.href) return <>{version.label}</>;
  return (
    <a href={version.href} target="_blank" rel="noopener noreferrer">
      <code>{version.label}</code>
    </a>
  );
}

/**
 * D354: About Gobbit, from the bottom bar's ⋯ menu, in the shared sheet (D304): logo, version
 * (commit) and release date of this build, the server's commit when it differs, the outside
 * services this server uses (from `/config`), the license, the bundled packages' notices and
 * where to report problems; offers the reload while a new version waits. Works offline from the build and the persisted config.
 */
export function AboutSheet({
  onClose,
  build = BUILD,
}: {
  onClose: () => void;
  build?: BuildInfo;
}): ReactElement {
  const config = useQuery(configQuery());
  const applyUpdate = usePendingUpdate();
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const servicesId = useId();
  const sourceId = useId();

  const released = releasedLabel(build.builtAt);
  const server = serverVersion(build.commit, config.data?.commit);
  const credits = config.data ? serviceCredits(config.data) : [];

  return (
    <Sheet labelledBy={titleId} onClose={onClose} initialFocus={closeRef} className="about">
      <div className="about__brand">
        <img className="about__logo" src={HEADER_LOGO_SRC} alt="" width="56" height="56" />
        <div>
          <h2 id={titleId} className="sheet__title about__title">
            Gobbit
          </h2>
          <p className="about__tagline">Your family&apos;s deck of useful cards</p>
        </div>
      </div>

      <dl className="about__facts">
        <dt>Version</dt>
        <dd>
          <Version version={versionLabel(build.commit)} />
        </dd>
        {released && (
          <>
            <dt>Released</dt>
            <dd>
              <time dateTime={build.builtAt}>{released}</time>
            </dd>
          </>
        )}
        {server && (
          <>
            <dt>Server</dt>
            <dd>
              <Version version={server} />
            </dd>
          </>
        )}
      </dl>

      {applyUpdate && (
        <div className="about__update" role="status">
          <p>A new version of Gobbit is ready.</p>
          <Button icon="refresh" label="Reload" onClick={applyUpdate} />
        </div>
      )}

      {credits.length > 0 && (
        <section className="about__section" aria-labelledby={servicesId}>
          <h3 id={servicesId}>Services we use</h3>
          <ul className="about__credits">
            {credits.map((credit) => (
              <li key={credit.key}>
                {credit.href ? (
                  <a href={credit.href} target="_blank" rel="noopener noreferrer">
                    {credit.name}
                  </a>
                ) : (
                  <strong>{credit.name}</strong>
                )}{' '}
                {credit.purpose}.
              </li>
            ))}
          </ul>
          <p className="about__fine">
            Product names and logos are trademarks of their owners; Gobbit isn&apos;t endorsed by
            them.
          </p>
        </section>
      )}

      <section className="about__section" aria-labelledby={sourceId}>
        <h3 id={sourceId}>Open source</h3>
        <p className="about__text">
          Gobbit is free software under the{' '}
          <a href={LICENSE_URL} target="_blank" rel="noopener noreferrer">
            Mozilla Public License 2.0
          </a>
          , built on open-source packages whose notices ship with the app.
        </p>
        <div className="about__links">
          <ButtonLink
            href={SOURCE_URL}
            icon="external"
            label="Source code"
            variant="ghost"
            external
          />
          <ButtonLink
            href={NOTICES_PATH}
            icon="external"
            label="Open-source notices"
            variant="ghost"
            external
          />
          <ButtonLink
            href={ISSUES_URL}
            icon="external"
            label="Report a problem"
            variant="ghost"
            external
          />
          <ButtonLink
            href={SECURITY_URL}
            icon="external"
            label="Security policy"
            variant="ghost"
            external
          />
        </div>
      </section>

      <p className="about__fine">{copyrightLine(build.builtAt)}</p>

      <div className="sheet__actions">
        <Button ref={closeRef} icon="close" label="Close" onClick={onClose} />
      </div>
    </Sheet>
  );
}
