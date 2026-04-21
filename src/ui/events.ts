import type { AppEvents } from '../types/index.js'

type Listener<T> = T extends void ? () => void : (payload: T) => void

class TypedEventEmitter {
  private map = new Map<string, Set<Function>>()

  on<K extends keyof AppEvents>(event: K, fn: Listener<AppEvents[K]>): () => void {
    if (!this.map.has(event)) this.map.set(event, new Set())
    this.map.get(event)!.add(fn)
    return () => this.off(event, fn)
  }

  off<K extends keyof AppEvents>(event: K, fn: Listener<AppEvents[K]>): void {
    this.map.get(event)?.delete(fn)
  }

  emit<K extends keyof AppEvents>(
    ...args: AppEvents[K] extends void ? [event: K] : [event: K, payload: AppEvents[K]]
  ): void {
    const [event, payload] = args
    this.map.get(event)?.forEach(fn => fn(payload as never))
  }

  once<K extends keyof AppEvents>(event: K, fn: Listener<AppEvents[K]>): void {
    const unsub = this.on(event, ((...a: unknown[]) => {
      ;(fn as Function)(...a)
      unsub()
    }) as Listener<AppEvents[K]>)
  }
}

/** Global typed event bus — import and use anywhere */
export const events = new TypedEventEmitter()
