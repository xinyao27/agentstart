import type { VisualRegressionCapture } from '../generated/yiru/runtime/v1/visual_regression_pb.js'
import { safeNumber } from './shell-state-values.js'

export const VISUAL_REGRESSION_PROTOCOL_CAPABILITY = 'visualRegression.protobuf.v1' as const

export type VisualRegressionCaptureValue = Readonly<{
  createdAt: number
  diffRatio: number | null
  height: number
  id: string
  imageArtifactId: string
  pageUrl: string
  projectId: string
  width: number
  worktreeId: string
}>

// Why: the legacy JSON emitted "diffRatio": null for captures without a diff,
// so the unset optional double carries exactly that null.
export function visualRegressionCapture(
  capture: VisualRegressionCapture
): VisualRegressionCaptureValue {
  return {
    id: capture.id,
    pageUrl: capture.pageUrl,
    projectId: capture.projectId,
    worktreeId: capture.worktreeId,
    diffRatio: capture.diffRatio ?? null,
    width: safeNumber(capture.width, 'Visual regression width'),
    height: safeNumber(capture.height, 'Visual regression height'),
    imageArtifactId: capture.imageArtifactId,
    createdAt: safeNumber(capture.createdAt, 'Visual regression timestamp')
  }
}
