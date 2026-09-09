export function humanizeBranchSlug(slug: string): string {
  const joined = slug.split('-').filter(Boolean).join(' ')
  if (!joined) {
    return ''
  }
  return joined.charAt(0).toUpperCase() + joined.slice(1)
}

export type BranchNameWorkContext = {
  firstPrompt: string
  assistantMessage?: string
}

export function buildBranchNamePrompt(context: BranchNameWorkContext, customPrompt = ''): string {
  const sections: string[] = []
  const prompt = customPrompt.trim()
  // Why: when the user supplies naming guidance, lead with it so their
  // override owns style rather than sitting under a prescriptive default.
  if (prompt) {
    sections.push(prompt, '')
  }
  sections.push(
    prompt
      ? 'Generate a git branch name that summarizes the coding task described below.'
      : 'Generate a short git branch name that summarizes the coding task described below.',
    'Output ONLY the branch name on a single line, nothing else.',
    ''
  )
  sections.push('User request:', context.firstPrompt.trim())
  const assistant = context.assistantMessage?.trim()
  if (assistant) {
    sections.push('', "Agent's initial response:", assistant)
  }
  return sections.join('\n')
}
