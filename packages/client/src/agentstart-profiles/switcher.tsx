import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { translate } from '~renderer/i18n/i18n'
import {
  Check,
  Laptop,
  GearSix as Settings2,
  CaretDown as ChevronDown,
  Plus
} from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '~renderer/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import { AgentStartProfileAvatar } from './avatar'
import { AgentStartProfileCreateDialog } from './create-dialog'
import { AgentStartProfileManagementDialog } from './management-dialog'
import { AgentStartProfileMenuHeader } from './menu-header'
import { AgentStartProfileSwitchConfirmDialog } from './switch-confirm-dialog'
import { getAgentStartProfileSwitchLiveWorkSummary } from './switch-liveness'

function getProfileSubtitle(): string {
  return translate('auto.components.agentstart.profiles.switcher.b4f9d1125d', 'Local')
}

export function AgentStartProfileSwitcher({
  placement = 'titlebar'
}: {
  placement?: 'titlebar' | 'sidebar'
}): React.JSX.Element | null {
  const profiles = useAppStore((s) => s.agentstartProfiles)
  const activeProfileId = useAppStore((s) => s.activeAgentStartProfileId)
  const loading = useAppStore((s) => s.agentstartProfilesLoading)
  const switching = useAppStore((s) => s.agentstartProfileSwitching)
  const multiProfileUi = useAppStore((s) => s.agentstartProfilesMultiProfileUi)
  const fetchProfiles = useAppStore((s) => s.fetchAgentStartProfiles)
  const createLocalProfile = useAppStore((s) => s.createLocalAgentStartProfile)
  const switchProfile = useAppStore((s) => s.switchAgentStartProfile)
  const liveWorkSummary = useAppStore(
    useShallow((s) => getAgentStartProfileSwitchLiveWorkSummary(s))
  )
  const [dialogOpen, setDialogOpen] = useState(false)
  const [managementOpen, setManagementOpen] = useState(false)
  const [newProfileName, setNewProfileName] = useState('')
  const [creating, setCreating] = useState(false)
  const [pendingSwitchProfileId, setPendingSwitchProfileId] = useState<string | null>(null)
  const activeProfile = (() =>
    profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0] ?? null)()
  const pendingSwitchProfile = (() =>
    profiles.find((profile) => profile.id === pendingSwitchProfileId) ?? null)()

  // Why: one attempt per mount — retrying on every loading toggle would spin
  // an unbounded IPC loop when the list call persistently fails.
  const fetchAttemptedRef = useRef(false)
  useEffect(() => {
    if (profiles.length === 0 && !loading && !fetchAttemptedRef.current) {
      fetchAttemptedRef.current = true
      void fetchProfiles()
    }
  }, [fetchProfiles, loading, profiles.length])

  if (!activeProfile) {
    return null
  }

  if (!multiProfileUi) {
    return null
  }

  const handleCreateProfile = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (creating || switching) {
      return
    }
    setCreating(true)
    const profile = await createLocalProfile(newProfileName)
    setCreating(false)
    if (!profile) {
      return
    }
    setNewProfileName('')
    setDialogOpen(false)
    if (liveWorkSummary.hasLiveWork) {
      setPendingSwitchProfileId(profile.id)
      return
    }
    await switchProfile(profile.id)
  }

  const handleSwitchProfile = (profileId: string): void => {
    if (profileId === activeProfileId || switching) {
      return
    }
    if (liveWorkSummary.hasLiveWork) {
      setPendingSwitchProfileId(profileId)
      return
    }
    void switchProfile(profileId)
  }

  const handleConfirmSwitchProfile = (): void => {
    if (!pendingSwitchProfileId || switching) {
      return
    }
    void switchProfile(pendingSwitchProfileId)
  }

  const profileActionDisabled = switching || creating
  const sidebarPlacement = placement === 'sidebar'
  const triggerLabel = translate(
    'auto.components.agentstart.profiles.switcher.4815f7d163',
    'Switch profile'
  )

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size={sidebarPlacement ? 'icon-xs' : 'xs'}
                    className={cn(
                      'shrink-0 text-muted-foreground',
                      sidebarPlacement ? 'px-0' : 'mr-2 max-w-[180px] gap-1.5 px-1.5'
                    )}
                    disabled={profileActionDisabled}
                    aria-label={triggerLabel}
                  >
                    {sidebarPlacement && switching ? (
                      <LoadingIndicator className="size-3" />
                    ) : (
                      <AgentStartProfileAvatar
                        profile={activeProfile}
                        className={
                          sidebarPlacement
                            ? 'border-sidebar-border bg-sidebar-accent text-sidebar-accent-foreground size-4 text-[10px]'
                            : undefined
                        }
                      />
                    )}
                    {!sidebarPlacement ? (
                      <>
                        <span className="hidden max-w-[108px] truncate text-xs font-medium sm:inline">
                          {activeProfile.name}
                        </span>
                        {switching ? <LoadingIndicator className="size-3" /> : <ChevronDown />}
                      </>
                    ) : null}
                  </Button>
                }
              />
            }
          />
          <TooltipContent side={sidebarPlacement ? 'top' : 'bottom'} sideOffset={6}>
            {triggerLabel}
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent
          align={sidebarPlacement ? 'start' : 'end'}
          side={sidebarPlacement ? 'top' : 'bottom'}
          sideOffset={sidebarPlacement ? 8 : 6}
          className="w-64"
        >
          <AgentStartProfileMenuHeader
            profile={activeProfile}
            title={activeProfile.name}
            subtitle={getProfileSubtitle()}
            showProfileAvatar
          />
          <DropdownMenuSeparator />
          {profiles.map((profile) => {
            const active = profile.id === activeProfileId
            return (
              <DropdownMenuItem
                key={profile.id}
                disabled={profileActionDisabled}
                onClick={() => handleSwitchProfile(profile.id)}
                className="min-w-0"
              >
                <AgentStartProfileAvatar profile={profile} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{profile.name}</span>
                  <span className="text-muted-foreground block truncate text-[11px] font-normal">
                    {getProfileSubtitle()}
                  </span>
                </span>
                <Laptop />
                {active && <Check className="text-foreground size-3.5" />}
              </DropdownMenuItem>
            )
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={profileActionDisabled}
            onClick={() => {
              setManagementOpen(true)
            }}
          >
            <Settings2 />
            {translate(
              'auto.components.agentstart.profiles.switcher.d00d853e2a',
              'Manage profiles'
            )}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={profileActionDisabled}
            onClick={() => {
              setDialogOpen(true)
            }}
          >
            <Plus />
            {translate(
              'auto.components.agentstart.profiles.switcher.c106c674fe',
              'New local profile'
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AgentStartProfileCreateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        name={newProfileName}
        onNameChange={setNewProfileName}
        creating={creating}
        switching={switching}
        onSubmit={handleCreateProfile}
      />
      <AgentStartProfileManagementDialog
        open={managementOpen}
        onOpenChange={setManagementOpen}
        activeProfile={activeProfile}
        profiles={profiles}
      />
      <AgentStartProfileSwitchConfirmDialog
        open={Boolean(pendingSwitchProfileId)}
        onOpenChange={(open) => {
          if (!open && !switching) {
            setPendingSwitchProfileId(null)
          }
        }}
        onConfirm={handleConfirmSwitchProfile}
        activeProfileName={activeProfile.name}
        targetProfile={pendingSwitchProfile}
        liveWorkSummary={liveWorkSummary}
        switching={switching}
      />
    </>
  )
}
