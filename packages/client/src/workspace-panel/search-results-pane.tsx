import type {
  SearchFileResult,
  SearchMatch,
  FileSearchResult as SearchResult
} from '@agentstart/protocol/files/values'
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react'
import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { LEGEND_LIST_SCROLL_AREA_PROPS } from '~renderer/sidebar/list-scroll-area'

import { FileResultRow, MatchResultRow } from './search-result-items'
import type { SearchRow } from './search-rows'

// Why: a match row is a single 20px line and a file row adds pt-1.5 for
// inter-group spacing; LegendList measures the real heights after the first
// paint and only needs this hint for the initial window.
const SEARCH_ROW_ESTIMATE_PX = 20

function getSearchRowKey(row: SearchRow): string {
  if (row.type === 'file') {
    return `file:${row.fileResult.filePath}`
  }
  return `match:${row.fileResult.filePath}:${row.match.line}:${row.match.column}:${row.matchIndex}`
}

function getSearchRowType(row: SearchRow): string {
  return row.type
}

type SearchResultsPaneProps = {
  results: SearchResult | null
  hasCommittedResults: boolean
  query: string
  loading: boolean
  rows: SearchRow[]
  onToggleCollapsedFile: (filePath: string) => void
  onMatchClick: (fileResult: SearchFileResult, match: SearchMatch, preview: boolean) => void
}

export function SearchResultsPane({
  results,
  hasCommittedResults,
  query,
  loading,
  rows,
  onToggleCollapsedFile,
  onMatchClick
}: SearchResultsPaneProps): React.JSX.Element {
  const notice = !query ? (
    <div className="text-muted-foreground flex h-32 items-center justify-center text-xs">
      {translate('auto.components.right.sidebar.Search.1abfb25a66', 'Type to search in files')}
    </div>
  ) : !hasCommittedResults && !loading ? (
    <div className="text-muted-foreground flex h-32 items-center justify-center text-xs">
      {translate('auto.components.right.sidebar.Search.d56d140747', 'Press Enter to search')}
    </div>
  ) : null

  return (
    <>
      {/* Why: the summary is rendered outside the list so it stays pinned at the
         top while the user scrolls through results. */}
      {results && rows.length > 0 && (
        <div className="text-muted-foreground border-border border-b px-2 py-1 text-[10px]">
          {results.totalMatches}{' '}
          {translate('auto.components.right.sidebar.Search.6aeda362ed', 'result')}
          {results.totalMatches !== 1 ? 's' : ''}{' '}
          {translate('auto.components.right.sidebar.Search.4107975b3a', 'in')}{' '}
          {results.files.length}{' '}
          {translate('auto.components.right.sidebar.Search.0b8104eaf2', 'file')}
          {results.files.length !== 1 ? 's' : ''}
          {results.truncated &&
            translate('auto.components.right.sidebar.Search.dcc294f28d', '(results truncated)')}
        </div>
      )}

      <div className="min-h-0 flex-1">
        <LegendList<SearchRow>
          {...LEGEND_LIST_SCROLL_AREA_PROPS}
          // Why: pb-2 gives visible breathing room after the last result row;
          // file rows already carry pt-1.5, which also covers the first row.
          className="pb-2"
          data={rows}
          keyExtractor={getSearchRowKey}
          getItemType={getSearchRowType}
          estimatedItemSize={SEARCH_ROW_ESTIMATE_PX}
          ListFooterComponent={notice}
          renderItem={({ item: row }: LegendListRenderItemProps<SearchRow>) =>
            row.type === 'file' ? (
              <FileResultRow
                fileResult={row.fileResult}
                collapsed={row.collapsed}
                onToggleCollapse={() => onToggleCollapsedFile(row.fileResult.filePath)}
              />
            ) : (
              <MatchResultRow
                match={row.match}
                relativePath={row.fileResult.relativePath}
                onClick={(preview) => onMatchClick(row.fileResult, row.match, preview)}
              />
            )
          }
        />
      </div>
    </>
  )
}
