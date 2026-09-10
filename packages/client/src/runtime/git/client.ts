import type { GitClient } from '@agentstart/protocol'

import { openGitTarget } from '../git-target'
import { getRuntimeGitTarget, type RuntimeGitContext } from './context'

// Why: Git operations require an authenticated typed runtime connection.
export async function openRuntimeGitClient(context: RuntimeGitContext): Promise<GitClient> {
  const client = await openGitTarget(getRuntimeGitTarget(context))
  if (!client) {
    throw new Error('git_protocol_not_configured')
  }
  return client
}
