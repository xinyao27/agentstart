import type { AgentType } from '../status-records'
import type {
  AgentSessionOptionCatalog,
  AgentSessionOptionCatalogMap,
  CatalogModel,
  CatalogOption
} from './catalog-types'
import { CLAUDE_SESSION_OPTION_CATALOG, CODEX_SESSION_OPTION_CATALOG } from './claude-codex'
import { CURSOR_SESSION_OPTION_CATALOG, GEMINI_SESSION_OPTION_CATALOG } from './gemini-cursor'
import type { SessionOptionValue } from './types'

export type {
  AgentSessionOptionCatalog,
  CatalogAgentInteractionDetection,
  CatalogMidSessionApply,
  CatalogModel,
  CatalogOption,
  CatalogOptionApply
} from './catalog-types'

const CATALOGS: AgentSessionOptionCatalogMap = {
  claude: CLAUDE_SESSION_OPTION_CATALOG,
  codex: CODEX_SESSION_OPTION_CATALOG,
  gemini: GEMINI_SESSION_OPTION_CATALOG,
  cursor: CURSOR_SESSION_OPTION_CATALOG
}

export function getAgentSessionOptionCatalog(agent: AgentType): AgentSessionOptionCatalog | null {
  return CATALOGS[agent] ?? null
}

export function findCatalogModel(
  catalog: AgentSessionOptionCatalog,
  modelId: string
): CatalogModel | undefined {
  return catalog.models.find((model) => model.id === modelId)
}

export function findCatalogOption(
  model: CatalogModel | undefined,
  optionId: string
): CatalogOption | undefined {
  return model?.options.find((option) => option.id === optionId)
}

/** Merge live rows over the static seed while retaining only option shapes Yiru
 * can actually map. Newly discovered ids remain model-only until cataloged. */
export function mergeCatalogModels(
  seed: readonly CatalogModel[],
  discovered: readonly CatalogModel[]
): CatalogModel[] {
  const discoveredById = new Map(discovered.map((model) => [model.id, model]))
  const merged = seed.map((model) => {
    const live = discoveredById.get(model.id)
    if (!live) {
      return model
    }
    discoveredById.delete(model.id)
    return { ...model, ...live, options: model.options }
  })
  return [...merged, ...discoveredById.values()]
}

export function sessionOptionValueIsValid(value: unknown): value is SessionOptionValue {
  return typeof value === 'string' || typeof value === 'boolean'
}
