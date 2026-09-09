import type { ConsoleEntry, NetworkEntry } from '../../generated/yiru/runtime/v1/browser_pb.js'

export type BrowserConsoleEntry = Omit<ConsoleEntry, '$typeName'>
export type BrowserNetworkEntry = Omit<NetworkEntry, '$typeName'>
