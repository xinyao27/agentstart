import { translate } from '~renderer/i18n/i18n'

export function formatCreateError(error: string, pushed: boolean, shortLabel: string): string {
  if (pushed) {
    const prefix = new RegExp(`^Create ${shortLabel} failed:\\s*`, 'i')
    return translate(
      'auto.components.right.sidebar.create.pull.request.review.copy.a1f8c3d2e4',
      'Push succeeded, but {{value0}} creation failed: {{value1}}',
      {
        value0: shortLabel,
        value1: error.replace(prefix, '')
      }
    )
  }
  return error
}
