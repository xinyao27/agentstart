import { create } from '@bufbuild/protobuf'

import {
  BoolResultSchema,
  BrowserCertificateFailureSchema,
  BrowserLoadErrorSchema,
  BrowserProfileSchema,
  BrowserProfileSourceSchema,
  BrowserTabSchema,
  ExecuteResponseSchema,
  PageResultSchema,
  ProfileCreateResultSchema,
  ProfileDeleteResultSchema,
  ProfileListResultSchema,
  TabListResultSchema,
  TabProfileCloneResultSchema,
  TabProfileResultSchema,
  TabResultSchema,
  TabSwitchResultSchema
} from '../../generated/agent_start/runtime/v1/browser_pb.js'
import type {
  BrowserProfile,
  BrowserTab,
  ExecuteResponse
} from '../../generated/agent_start/runtime/v1/browser_pb.js'
import {
  readArray,
  readBoolean,
  readNumber,
  readOptionalNumber,
  readOptionalString,
  readRecord,
  readString
} from './value.js'

type SessionCommand =
  | 'profileCreate'
  | 'profileDelete'
  | 'profileList'
  | 'tabClose'
  | 'tabCreate'
  | 'tabCurrent'
  | 'tabList'
  | 'tabProfileClone'
  | 'tabProfileShow'
  | 'tabSetProfile'
  | 'tabShow'
  | 'tabSwitch'

export function encodeSessionResponse(command: SessionCommand, output: unknown): ExecuteResponse {
  switch (command) {
    case 'tabList':
      return create(ExecuteResponseSchema, {
        result: {
          case: 'tabList',
          value: create(TabListResultSchema, {
            tabs: readArray(output, 'tabs').map(encodeTab)
          })
        }
      })
    case 'tabShow':
    case 'tabCurrent':
      return create(ExecuteResponseSchema, {
        result: {
          case: command,
          value: create(TabResultSchema, {
            tab: encodeTab(Reflect.get(readRecord(output), 'tab'))
          })
        }
      })
    case 'tabSwitch':
      return create(ExecuteResponseSchema, {
        result: {
          case: 'tabSwitch',
          value: create(TabSwitchResultSchema, {
            browserPageId: readString(output, 'browserPageId'),
            switched: readNumber(output, 'switched')
          })
        }
      })
    case 'tabCreate':
      return create(ExecuteResponseSchema, {
        result: {
          case: 'tabCreate',
          value: create(PageResultSchema, {
            browserPageId: readString(output, 'browserPageId')
          })
        }
      })
    case 'tabClose':
      return create(ExecuteResponseSchema, {
        result: {
          case: 'tabClose',
          value: create(BoolResultSchema, { value: readBoolean(output, 'closed') })
        }
      })
    case 'profileList':
      return create(ExecuteResponseSchema, {
        result: {
          case: 'profileList',
          value: create(ProfileListResultSchema, {
            profiles: readArray(output, 'profiles').map(encodeProfile)
          })
        }
      })
    case 'profileCreate': {
      const profile = Reflect.get(readRecord(output), 'profile')
      return create(ExecuteResponseSchema, {
        result: {
          case: 'profileCreate',
          value: create(ProfileCreateResultSchema, {
            profile: profile === null || profile === undefined ? undefined : encodeProfile(profile)
          })
        }
      })
    }
    case 'profileDelete':
      return create(ExecuteResponseSchema, {
        result: {
          case: 'profileDelete',
          value: create(ProfileDeleteResultSchema, {
            deleted: readBoolean(output, 'deleted'),
            profileId: readString(output, 'profileId')
          })
        }
      })
    case 'tabSetProfile':
    case 'tabProfileShow':
      return create(ExecuteResponseSchema, {
        result: { case: command, value: encodeTabProfile(output) }
      })
    case 'tabProfileClone':
      return create(ExecuteResponseSchema, {
        result: {
          case: 'tabProfileClone',
          value: create(TabProfileCloneResultSchema, {
            browserPageId: readString(output, 'browserPageId'),
            profileId: readOptionalString(output, 'profileId'),
            profileLabel: readOptionalString(output, 'profileLabel'),
            sourceBrowserPageId: readString(output, 'sourceBrowserPageId')
          })
        }
      })
  }
}

function encodeTab(value: unknown): BrowserTab {
  const loadErrorValue = Reflect.get(readRecord(value), 'loadError')
  const certificateValue = Reflect.get(readRecord(value), 'certificateFailure')
  return create(BrowserTabSchema, {
    active: readBoolean(value, 'active'),
    browserPageId: readString(value, 'browserPageId'),
    certificateFailure:
      certificateValue === null || certificateValue === undefined
        ? undefined
        : create(BrowserCertificateFailureSchema, {
            browserPageId: readString(certificateValue, 'browserPageId'),
            canProceed: readBoolean(certificateValue, 'canProceed'),
            challengeId: readString(certificateValue, 'challengeId'),
            displayHost: readString(certificateValue, 'displayHost'),
            error: readString(certificateValue, 'error'),
            errorCode: readOptionalNumber(certificateValue, 'errorCode'),
            observedAt: readNumber(certificateValue, 'observedAt'),
            origin: readString(certificateValue, 'origin')
          }),
    index: readNumber(value, 'index'),
    loadError:
      loadErrorValue === null || loadErrorValue === undefined
        ? undefined
        : create(BrowserLoadErrorSchema, {
            code: readNumber(loadErrorValue, 'code'),
            description: readString(loadErrorValue, 'description'),
            validatedUrl: readString(loadErrorValue, 'validatedUrl')
          }),
    profileId: readOptionalString(value, 'profileId'),
    profileLabel: readOptionalString(value, 'profileLabel'),
    title: readString(value, 'title'),
    url: readString(value, 'url'),
    worktreeId: readOptionalString(value, 'worktreeId')
  })
}

function encodeProfile(value: unknown): BrowserProfile {
  const sourceValue = Reflect.get(readRecord(value), 'source')
  return create(BrowserProfileSchema, {
    id: readString(value, 'id'),
    label: readString(value, 'label'),
    partition: readString(value, 'partition'),
    scope: readString(value, 'scope'),
    source:
      sourceValue === null || sourceValue === undefined
        ? undefined
        : create(BrowserProfileSourceSchema, {
            browserFamily: readString(sourceValue, 'browserFamily'),
            importedAt: readNumber(sourceValue, 'importedAt'),
            profileName: readOptionalString(sourceValue, 'profileName')
          })
  })
}

function encodeTabProfile(output: unknown) {
  return create(TabProfileResultSchema, {
    browserPageId: readString(output, 'browserPageId'),
    profileId: readOptionalString(output, 'profileId'),
    profileLabel: readOptionalString(output, 'profileLabel'),
    worktreeId: readOptionalString(output, 'worktreeId')
  })
}
