import { Link } from '@tanstack/react-router'

import { siteLinks } from '../../site-links'
import type { LegalDocument } from './content'
import { privacyDocument, termsDocument } from './content'

const linkClasses =
  'text-ink decoration-copy/30 hover:decoration-label underline underline-offset-[3px] transition-colors'

type LegalPageProps = {
  document: LegalDocument
}

function LegalPage({ document }: LegalPageProps): React.JSX.Element {
  return (
    <article className="flex max-w-[720px] flex-col gap-8 pt-24">
      <header className="flex flex-col gap-3">
        <Link to="/" className={linkClasses}>
          AgentStart
        </Link>
        <h1 className="text-ink text-[30px] leading-[1.2] font-semibold">{document.title}</h1>
        <p className="text-faint font-mono text-[12px]">Last updated: {document.updated}</p>
        <p className="max-w-[680px]">{document.intro}</p>
      </header>

      {document.sections.map((section) => (
        <section key={section.heading} className="flex flex-col gap-3">
          <h2 className="text-ink text-[19px] leading-[1.35] font-semibold">{section.heading}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph} className="max-w-[680px]">
              {paragraph}
            </p>
          ))}
          {section.bullets ? (
            <ul className="flex max-w-[680px] list-disc flex-col gap-2 pl-5">
              {section.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}

      <aside className="border-hairline rounded-card flex flex-col gap-2 border px-4 py-4">
        <p className="text-ink font-medium">Questions?</p>
        <p>
          Contact the maintainers through the{' '}
          <a href={siteLinks.issues} target="_blank" rel="noreferrer" className={linkClasses}>
            AgentStart GitHub issue tracker
          </a>
          .
        </p>
      </aside>
    </article>
  )
}

export function PrivacyPage(): React.JSX.Element {
  return <LegalPage document={privacyDocument} />
}

export function TermsPage(): React.JSX.Element {
  return <LegalPage document={termsDocument} />
}
