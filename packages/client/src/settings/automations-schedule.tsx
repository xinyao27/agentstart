import type { RitualSchedule } from '@agentstart/protocol'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useActionState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { ritualScheduleQuery, saveRitualSchedule } from '~renderer/runtime/ritual-target'
import { Button } from '~renderer/ui/button'
import { Input } from '~renderer/ui/input'

import { confirmDangerousOperation } from '../extension/security/passkey'

type ScheduleState = { kind: 'idle' | 'saved' | 'error' }

const LOCAL_DAEMON_TARGET = { kind: 'local' } as const

export function RitualScheduleSettings(): React.JSX.Element {
  const queryClient = useQueryClient()
  const scheduleQuery = ritualScheduleQuery(LOCAL_DAEMON_TARGET)
  const schedule = useQuery(scheduleQuery)
  const [state, saveAction, isSaving] = useActionState<ScheduleState, FormData>(
    async (_current, formData) => {
      try {
        const mode = formData.get('schedule-mode')
        const next = parseSchedule(formData, mode)
        if (next.archiveOnEndDay) {
          await confirmDangerousOperation('ritual.enable-archive')
        }
        const result = await saveRitualSchedule(LOCAL_DAEMON_TARGET, next)
        queryClient.setQueryData(scheduleQuery.queryKey, result)
        return { kind: 'saved' }
      } catch {
        return { kind: 'error' }
      }
    },
    { kind: 'idle' }
  )
  const value = schedule.data
  return (
    <section className="border-border mt-5 border p-4">
      <h2 className="font-medium">
        {translate('extension.automations.schedule', 'Daemon schedule')}
      </h2>
      <p className="text-muted-foreground mt-1 text-sm">
        {translate(
          'extension.automations.scheduleDescription',
          'The daemon runs these in the selected time zone even when Chrome is closed. Browser layout catches up from durable events when AgentStart reconnects.'
        )}
      </p>
      {value ? (
        <form key={schedule.dataUpdatedAt} action={saveAction} className="mt-3 grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <TimeField
              label={translate('extension.automations.startTime', 'Start time')}
              name="start-time"
              minutes={value.startMinutes}
            />
            <TimeField
              label={translate('extension.automations.endTime', 'End time')}
              name="end-time"
              minutes={value.endMinutes}
            />
          </div>
          <label className="grid gap-1 text-sm">
            <span>{translate('extension.automations.timezone', 'IANA time zone')}</span>
            <Input name="timezone" defaultValue={value.timezone} required />
          </label>
          <label className="grid gap-1 text-sm">
            <span>{translate('extension.automations.weekdays', 'Weekdays (0=Sun … 6=Sat)')}</span>
            <Input name="weekdays" defaultValue={value.weekdays.join(',')} required />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button name="schedule-mode" value="enabled" type="submit" disabled={isSaving}>
              {translate('extension.automations.saveSchedule', 'Enable schedule')}
            </Button>
            <Button
              name="schedule-mode"
              value="archive"
              type="submit"
              variant="outline"
              disabled={isSaving}
            >
              {translate(
                'extension.automations.saveArchiveSchedule',
                'Enable and archive non-main worktrees at end day'
              )}
            </Button>
            <Button
              name="schedule-mode"
              value="disabled"
              type="submit"
              variant="ghost"
              disabled={isSaving}
            >
              {translate('extension.automations.disableSchedule', 'Disable')}
            </Button>
          </div>
          {state.kind === 'saved' ? (
            <p className="text-muted-foreground text-sm">
              {translate('extension.automations.scheduleSaved', 'Schedule saved in the daemon.')}
            </p>
          ) : null}
          {state.kind === 'error' ? (
            <p className="text-destructive text-sm">
              {translate(
                'extension.automations.scheduleFailed',
                'The schedule was not changed. Check the times, weekdays, and IANA time zone.'
              )}
            </p>
          ) : null}
        </form>
      ) : null}
      {value?.lastFailure ? (
        <p className="text-destructive mt-3 text-sm">
          {translate('extension.automations.lastFailure', 'Last scheduled run: {{detail}}', {
            detail: value.lastFailure
          })}
        </p>
      ) : null}
    </section>
  )
}

function TimeField({ label, minutes, name }: { label: string; minutes: number; name: string }) {
  return (
    <label className="grid gap-1 text-sm">
      <span>{label}</span>
      <Input name={name} type="time" defaultValue={formatMinutes(minutes)} required />
    </label>
  )
}

function parseSchedule(formData: FormData, mode: FormDataEntryValue | null): RitualSchedule {
  const timezone = formData.get('timezone')
  const weekdays = formData.get('weekdays')
  if (typeof timezone !== 'string' || typeof weekdays !== 'string') {
    throw new Error('ritual_schedule_invalid')
  }
  return {
    archiveOnEndDay: mode === 'archive',
    enabled: mode !== 'disabled',
    endMinutes: parseTime(formData.get('end-time')),
    startMinutes: parseTime(formData.get('start-time')),
    timezone,
    weekdays: weekdays.split(',').map((value) => Number(value.trim()))
  }
}

function parseTime(value: FormDataEntryValue | null): number {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) {
    throw new Error('ritual_schedule_time_invalid')
  }
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

function formatMinutes(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}
