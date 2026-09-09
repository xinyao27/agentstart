import { translate } from '~renderer/i18n/i18n'

export function formatResetDuration(ms: number): string {
  if (ms <= 0) {
    return translate('usage.duration.now', 'now')
  }
  const totalMins = Math.floor(ms / 60_000)
  if (totalMins < 60) {
    return translate('usage.duration.minutes', '{{minutes}}m', { minutes: totalMins })
  }
  const hours = Math.floor(totalMins / 60)
  const mins = totalMins % 60
  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    const remHours = hours % 24
    return remHours > 0
      ? translate('usage.duration.days-hours', '{{days}}d {{hours}}h', { days, hours: remHours })
      : translate('usage.duration.days', '{{days}}d', { days })
  }
  return mins > 0
    ? translate('usage.duration.hours-minutes', '{{hours}}h {{minutes}}m', { hours, minutes: mins })
    : translate('usage.duration.hours', '{{hours}}h', { hours })
}

export function formatResetCountdown(ms: number): string {
  return ms <= 0
    ? translate('usage.reset.now', 'Resets now')
    : translate('usage.reset.duration', 'Resets in {{duration}}', {
        duration: formatResetDuration(ms)
      })
}
