/**
 * Why: the page used to be 84 words, which is not enough for a search engine to
 * tell what it is about, and not enough for a reader either — the demo shows the
 * product working but never says what it is for.
 *
 * Every claim here is checkable in the current daemon, extension, and mobile
 * source rather than inherited from the retired Electron product.
 */
const sections = [
  {
    heading: 'One worktree per task',
    body: 'Two agents editing the same checkout overwrite each other, and a half-finished change makes the next task start from a dirty tree. AgentStart gives each task its own git worktree, with its own files, terminal state and history, so several agents can work at once and you compare the results before anything merges.'
  },
  {
    heading: 'Thirty-five agents, as themselves',
    body: 'Claude Code, Codex, Gemini CLI, Copilot CLI, Cursor, Aider, Amp, OpenCode, Goose, Cline, Continue, Factory Droid, Grok and twenty-two more run as the terminal programs they already are. AgentStart starts, monitors and resumes their sessions and keeps provider-specific behaviour isolated, so your authentication, model access and usage limits stay where they were.'
  },
  {
    heading: 'The daemon goes where the code lives',
    body: 'The single AgentStart binary can run locally, inside WSL, or on a remote machine reached through SSH forwarding or a private network. The extension stores remote connection tokens only on that browser and never guesses which project a page belongs to.'
  },
  {
    heading: 'Chrome is the work surface',
    body: 'The side panel is a cross-tab navigator and each AgentStart tab is a workspace. Deterministic page context, element picking, DevTools sensors, replay and visual evidence connect a browser problem to the exact worktree and agent session that owns it.'
  },
  {
    heading: 'Stay in the loop from iOS',
    body: 'The iOS companion pairs directly with a daemon using end-to-end encryption. It can follow sessions, receive notifications, inspect changes and send follow-up instructions without routing repository access through an AgentStart cloud relay.'
  }
]

export function Capabilities(): React.JSX.Element {
  return (
    <>
      {sections.map((section) => (
        <section key={section.heading} className="flex flex-col gap-3">
          <h2 className="text-ink text-[17px] leading-[1.4] font-semibold">{section.heading}</h2>
          <p className="max-w-[620px]">{section.body}</p>
        </section>
      ))}
    </>
  )
}
