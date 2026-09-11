import { siteLinks } from '../site-links'
import { Demo } from './demo/demo'

const productLinks = [
  { label: 'Rust daemon', href: siteLinks.daemon },
  { label: 'Chrome extension', href: siteLinks.extension },
  { label: 'iOS', href: siteLinks.testflight }
]

export function Home(): React.JSX.Element {
  return (
    <>
      {/* Why: the tagline sits inside the h1 rather than in a sibling p, so the
          one heading a crawler weighs carries the category term as well as the
          brand. The two lines render exactly as the split pair did. */}
      <h1 className="text-ink flex flex-col gap-3 pt-24 text-[26px] leading-[1.2] font-semibold">
        <span className="flex items-center gap-3">
          <img
            src="/favicon.png"
            alt="AgentStart logo"
            width="48"
            height="48"
            className="size-12 rounded-[14px]"
          />
          <span>AgentStart</span>
        </span>
        <span className="text-copy max-w-[620px] text-[16px] leading-[26px] font-normal">
          Coding agents in Chrome, backed by a native Rust daemon.
        </span>
      </h1>

      <p className="max-w-[620px]">
        Run Claude Code, Codex, and other terminal agents in isolated git worktrees. Navigate every
        project from Chrome&apos;s side panel, work inside each tab, and follow the session from
        iOS.
      </p>

      <div className="flex flex-col gap-3">
        <p className="max-w-[620px]">Use AgentStart:</p>
        <div className="border-hairline rounded-card flex w-full items-center justify-between gap-3 border px-4 py-3">
          <div className="flex min-w-0 items-center gap-5 font-mono text-[14px]">
            {productLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="text-ink hover:text-accent transition-colors"
              >
                {link.label}
              </a>
            ))}
          </div>
          <a
            href={siteLinks.license}
            target="_blank"
            rel="noreferrer"
            className="text-faint hover:text-ink shrink-0 font-mono text-[12px] transition-colors"
          >
            MIT
          </a>
        </div>
      </div>

      <Demo />
    </>
  )
}
