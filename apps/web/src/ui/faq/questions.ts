export type FaqEntry = {
  question: string
  answer: string
}

/**
 * Why: this list has two readers — the section the page renders and the FAQPage
 * JSON-LD injected at build time (see src/structured-data.ts). Google treats
 * structured data that disagrees with the visible text as spam, so the wording
 * has to come from one place.
 *
 * Every claim here is checkable against the current repository. Keep it that
 * way: the daemon, extension, direct mobile protocol, and licence are the source.
 */
export const faqEntries: readonly FaqEntry[] = [
  {
    question: 'What is an AI agent editor IDE?',
    answer:
      'It is a workspace built around coding agents rather than around a text cursor. The unit of work is an agent session: you give it a task, it works in its own checkout, and you review the result. AgentStart adds the part a chat window cannot — somewhere for several sessions to run at once without colliding.'
  },
  {
    question: 'Which coding agents does AgentStart run?',
    answer:
      'Thirty-five, including Claude Code, Codex, Gemini CLI, Copilot CLI, Cursor, Aider, Amp, OpenCode, Goose, Cline, Continue, Factory Droid and Grok. They run as the terminal programs they already are, on whichever host you point AgentStart at, so authentication, model access and usage limits stay with the agent provider.'
  },
  {
    question: 'How is this different from an AI code editor like Cursor?',
    answer:
      'An AI code editor puts a model inside one editing session. AgentStart runs the agents you already use, several at a time, each in its own git worktree, and gives you the review surface for the diffs that come back. It does not replace your editor or your agent — it is where they run.'
  },
  {
    question: 'Why isolated git worktrees?',
    answer:
      'Two agents editing one checkout overwrite each other, and a half-finished change makes the next task start from a dirty tree. A worktree per task gives each agent its own files, terminal state and history, so you can run tasks in parallel and compare the results before anything merges.'
  },
  {
    question: 'Can it work on a remote machine?',
    answer:
      'Yes. Run the Rust daemon beside the repository, then connect Chrome over SSH port forwarding or a private network such as Tailscale. The same binary runs locally, inside WSL, and on remote macOS, Linux, or Windows hosts.'
  },
  {
    question: 'What can the mobile app do?',
    answer:
      'The iOS companion pairs directly with the daemon using end-to-end encryption. It can watch sessions, receive notifications, inspect changes, and send a follow-up instruction. It is for the part of the loop that happens away from the desk, not a second editor.'
  },
  {
    question: 'Does it review pull requests?',
    answer:
      'It reads and creates them on GitHub, GitLab, Azure DevOps and Gitea, including discussions, checks and review state, and it can annotate individual diff lines to queue follow-up work for an agent.'
  },
  {
    question: 'Is AgentStart free?',
    answer:
      'Yes, and open source under the MIT licence. Rust daemon binaries for macOS, Windows, and Linux come from GitHub releases, the Chrome extension source lives in this repository, and the iOS companion is in TestFlight. You pay whoever provides your agents, not us.'
  }
]
