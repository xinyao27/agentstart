import { Demo } from './demo/demo'
import { InstallSection } from './install/section'

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

      <InstallSection />

      <Demo />
    </>
  )
}
