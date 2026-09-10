type ZoomTargetType = 'ui' | 'editor' | 'terminal'

export type ZoomLevelChangedEventDetail = {
  type: ZoomTargetType
  percent: number
}

export const ZOOM_LEVEL_CHANGED_EVENT = 'agentstart:zoom-level-changed'
