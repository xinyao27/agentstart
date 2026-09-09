export type FeedbackSubmitArgs = {
  feedback: string
  submitAnonymously?: boolean
  githubLogin: string | null
  githubEmail: string | null
}

export type FeedbackSubmitResult =
  | { ok: true }
  | { ok: false; status: number | null; error: string }
