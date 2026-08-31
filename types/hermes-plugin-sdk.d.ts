declare module '@hermes/plugin-sdk' {
  import type { ComponentType, ReactNode } from 'react'

  export interface ReadableAtom<T> {
    get(): T
  }

  export interface RpcEvent<T = unknown> {
    payload?: T
    profile?: string
    connectionId?: string
    session_id?: string
    type: string
  }

  export type GatewayEventListener = (event: RpcEvent) => void

  export interface PluginContribution {
    id: string
    area: string
    title?: string
    order?: number
    enabled?: boolean
    when?: () => boolean
    render?: () => ReactNode
    data?: unknown
  }

  export interface PluginContext {
    readonly source: string
    register(contribution: PluginContribution): () => void
    registerMany(contributions: PluginContribution[]): () => void
    onDispose(disposer: () => void): void
    rest<T = unknown>(path: string, options?: PluginRestOptions): Promise<T>
  }

  export interface PluginRestOptions {
    method?: string
    body?: unknown
    upload?: { filename: string; contentType?: string; bytes: ArrayBuffer }
    timeoutMs?: number
  }

  export interface HermesPlugin {
    id: string
    name?: string
    description?: string
    defaultEnabled?: boolean
    register(context: PluginContext): void
  }

  export type StatusTone = 'good' | 'warn' | 'bad' | 'muted'

  export interface HostState {
    activeSessionId: ReadableAtom<string | null>
    awaitingResponse: ReadableAtom<boolean>
    busy: ReadableAtom<boolean>
    focusedSessionId: ReadableAtom<string | null>
    gateway: ReadableAtom<string>
    model: ReadableAtom<string>
  }

  export const host: {
    state: HostState
    onEvent(type: string, listener: GatewayEventListener): () => void
  }

  export function useValue<T>(atom: ReadableAtom<T>): T

  export const Badge: ComponentType<Record<string, unknown> & { children?: ReactNode }>
  export const Button: ComponentType<Record<string, unknown> & { children?: ReactNode }>
  export const CopyButton: ComponentType<Record<string, unknown> & { children?: ReactNode }>
  export const EmptyState: ComponentType<Record<string, unknown> & { children?: ReactNode }>
  export const ErrorState: ComponentType<Record<string, unknown> & { children?: ReactNode }>
  export const ScrollArea: ComponentType<Record<string, unknown> & { children?: ReactNode }>
  export const SegmentedControl: ComponentType<
    Record<string, unknown> & {
      options?: Array<{ id: string; label: string }>
      value?: string
      onChange?: (value: string) => void
      children?: ReactNode
    }
  >
  export const Separator: ComponentType<Record<string, unknown> & { children?: ReactNode }>
  export const Skeleton: ComponentType<Record<string, unknown> & { children?: ReactNode }>
  export const StatusDot: ComponentType<Record<string, unknown> & { tone?: StatusTone; children?: ReactNode }>

  export const ROUTES_AREA: string
  export const SIDEBAR_NAV_AREA: string
}
