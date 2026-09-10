import type { LocalizedHostedReviewCopy } from '~renderer/i18n/hosted-review-localized-copy'
import { translate } from '~renderer/i18n/i18n'
import {
  Check,
  Sparkle as Sparkles,
  Warning as TriangleAlert,
  ArrowsDownUp as ArrowDownUp,
  CaretDown as ChevronDown
} from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { Checkbox } from '~renderer/ui/checkbox'
import { cn } from '~renderer/ui/class-names'
import { Input } from '~renderer/ui/input'
import { Textarea } from '~renderer/ui/textarea'

import { stripBaseRef } from './use-create-pull-request-dialog-fields'

type CreateHostedReviewComposerFieldsProps = {
  copy: LocalizedHostedReviewCopy
  base: string
  setBase: (value: string) => void
  title: string
  setTitle: (value: string) => void
  body: string
  setBody: (value: string) => void
  draft: boolean
  setDraft: (value: boolean) => void
  baseQuery: string
  setBaseQuery: (value: string) => void
  baseResults: string[]
  setBaseResults: (value: string[]) => void
  baseSearchError: string | null
  generateError: string | null
  createError: string | null
  fieldsLocked: boolean
  generating: boolean
  normalizedBase: string
  strippedBranch: string
  baseSameAsBranch: boolean
}

export function CreateHostedReviewComposerFields({
  copy,
  base,
  setBase,
  title,
  setTitle,
  body,
  setBody,
  draft,
  setDraft,
  baseQuery,
  setBaseQuery,
  baseResults,
  setBaseResults,
  baseSearchError,
  generateError,
  createError,
  fieldsLocked,
  generating,
  normalizedBase,
  strippedBranch,
  baseSameAsBranch
}: CreateHostedReviewComposerFieldsProps): React.JSX.Element {
  return (
    <>
      {/* Why: a single line that shows the head->base flow plain-language so
          the user can sanity-check the merge direction at a glance. */}
      <div className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-[11px]">
        <span className="text-foreground truncate font-mono" title={strippedBranch}>
          {strippedBranch}
        </span>
        <ArrowDownUp className="size-3 shrink-0 rotate-90 opacity-60" aria-hidden="true" />
        <span
          className={cn(
            'truncate font-mono',
            baseSameAsBranch ? 'text-destructive' : 'text-foreground'
          )}
          title={
            normalizedBase ||
            translate('auto.components.right.sidebar.SourceControl.7a09d7f9d2', 'base')
          }
        >
          {normalizedBase ||
            translate('auto.components.right.sidebar.SourceControl.7a09d7f9d2', 'base')}
        </span>
      </div>

      <div className="relative space-y-2">
        <Input
          aria-label={translate(
            'auto.components.right.sidebar.SourceControl.a6eda33521',
            '{{value0}} title',
            { value0: copy.titleLabel }
          )}
          value={title}
          disabled={fieldsLocked}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={translate('auto.components.right.sidebar.SourceControl.7d6a8f0082', 'Title')}
          size="sm"
          className="font-medium"
        />

        <Textarea
          aria-label={translate(
            'auto.components.right.sidebar.SourceControl.a8873e1d62',
            '{{value0}} description',
            { value0: copy.titleLabel }
          )}
          rows={6}
          value={body}
          disabled={fieldsLocked}
          onChange={(event) => setBody(event.target.value)}
          placeholder={translate(
            'auto.components.right.sidebar.SourceControl.a0dc20fc93',
            'Description (optional)'
          )}
          size="sm"
          className="min-h-[7.5rem]"
        />

        {generating ? (
          // Why: visible scrim + status row so the user understands the title
          // and description fields will be replaced while inputs are locked.
          <div
            className="bg-background/40 pointer-events-none absolute inset-0 flex items-center justify-center rounded-md"
            aria-hidden="true"
          >
            <div className="border-border bg-background text-muted-foreground pointer-events-auto flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]">
              <Sparkles className="text-foreground size-3 animate-pulse" />
              <span>
                {translate(
                  'auto.components.right.sidebar.SourceControl.9484270f45',
                  'Generating title & description…'
                )}
              </span>
            </div>
          </div>
        ) : null}
      </div>

      {/* Why: base picker as its own labeled row so the title input can use
          the full width. The dropdown chevron makes the picker affordance
          obvious; the inline label clarifies that this is the merge target. */}
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground shrink-0 text-[11px]">
          {translate('auto.components.right.sidebar.SourceControl.1f7119f604', 'Base')}
        </span>
        <div className="relative min-w-0 flex-1">
          <Input
            aria-label={translate(
              'auto.components.right.sidebar.SourceControl.6055949c50',
              '{{value0}} base branch',
              { value0: copy.titleLabel }
            )}
            value={baseQuery || base}
            disabled={fieldsLocked}
            onChange={(event) => {
              setBaseQuery(event.target.value)
              setBase(event.target.value)
            }}
            placeholder={translate(
              'auto.components.right.sidebar.SourceControl.e64a632456',
              'main'
            )}
            size="xs"
            className="font-mono"
          />
          <ChevronDown
            className="text-muted-foreground pointer-events-none absolute top-1.5 right-1.5 size-3.5"
            aria-hidden="true"
          />
        </div>
      </div>

      <label
        className={cn(
          'flex h-7 items-center gap-2 rounded-md border border-border bg-background px-2 text-xs text-foreground transition-colors',
          fieldsLocked
            ? 'cursor-not-allowed opacity-60'
            : 'cursor-pointer hover:bg-accent hover:text-accent-foreground'
        )}
      >
        <Checkbox
          checked={draft}
          disabled={fieldsLocked}
          onCheckedChange={(checked) => setDraft(checked === true)}
        />
        <span className="min-w-0 flex-1 truncate">
          {translate('auto.components.right.sidebar.SourceControl.78ddfd0bb4', 'Create as draft')}
        </span>
      </label>

      {baseResults.length > 0 ? (
        <div className="border-border scrollbar-sleek max-h-28 overflow-auto rounded-md border p-1">
          {baseResults.map((ref) => (
            <Button
              variant="ghost"
              size="sm"
              key={ref}
              type="button"
              disabled={fieldsLocked}
              className={cn(
                'border-0 gap-0 whitespace-normal font-normal focus-visible:bg-accent',
                'flex w-full justify-between px-2 py-1.5 text-left font-mono text-xs disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent',
                stripBaseRef(base) === ref && 'bg-accent text-accent-foreground'
              )}
              onClick={() => {
                if (fieldsLocked) {
                  return
                }
                setBase(ref)
                setBaseQuery('')
                setBaseResults([])
              }}
            >
              <span className="truncate">{ref}</span>
              {stripBaseRef(base) === ref ? <Check className="size-3" /> : null}
            </Button>
          ))}
        </div>
      ) : null}

      <CreateHostedReviewComposerMessages
        copy={copy}
        baseSameAsBranch={baseSameAsBranch}
        baseSearchError={baseSearchError}
        generateError={generateError}
        createError={createError}
      />
    </>
  )
}

function CreateHostedReviewComposerMessages({
  copy,
  baseSameAsBranch,
  baseSearchError,
  generateError,
  createError
}: {
  copy: LocalizedHostedReviewCopy
  baseSameAsBranch: boolean
  baseSearchError: string | null
  generateError: string | null
  createError: string | null
}): React.JSX.Element {
  return (
    <>
      {baseSameAsBranch ? (
        <CreateHostedReviewComposerMessage>
          {translate(
            'auto.components.right.sidebar.SourceControl.ae743199cd',
            'Choose a different base branch before creating a {{value0}}.',
            { value0: copy.reviewLabel }
          )}
        </CreateHostedReviewComposerMessage>
      ) : null}
      {baseSearchError ? (
        <CreateHostedReviewComposerMessage>{baseSearchError}</CreateHostedReviewComposerMessage>
      ) : null}
      {generateError ? (
        <CreateHostedReviewComposerMessage>{generateError}</CreateHostedReviewComposerMessage>
      ) : null}
      {createError ? (
        <CreateHostedReviewComposerMessage>{createError}</CreateHostedReviewComposerMessage>
      ) : null}
    </>
  )
}

function CreateHostedReviewComposerMessage({
  children
}: {
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <p className="text-destructive flex items-start gap-1 text-[11px]">
      <TriangleAlert className="mt-px size-3 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}
