import type {
  ConsoleEntry,
  NetworkEntry
} from '../../generated/agent_start/runtime/v1/browser_pb.js'

export type BrowserConsoleEntry = Omit<ConsoleEntry, '$typeName'>
export type BrowserNetworkEntry = Omit<NetworkEntry, '$typeName'>
