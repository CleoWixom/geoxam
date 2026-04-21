// =============================================================================
// Hash Router
// Supports: #/capture  #/gallery  #/gallery/:folderId  #/photo/:id  #/settings
// =============================================================================

type RouteHandler = (params: Record<string, string>) => void

interface Route {
  pattern: RegExp
  keys: string[]
  handler: RouteHandler
}

class Router {
  private routes: Route[] = []
  private stack: string[] = []

  /** Register a route pattern. Use :param for dynamic segments. */
  on(path: string, handler: RouteHandler): void {
    const keys: string[] = []
    const pattern = new RegExp(
      '^' + path.replace(/:([^/]+)/g, (_: string, key: string) => {
        keys.push(key)
        return '([^/]+)'
      }) + '$'
    )
    this.routes.push({ pattern, keys, handler })
  }

  /** Navigate to a hash route */
  navigate(hash: string): void {
    window.location.hash = hash
  }

  /** Go back (browser history) */
  back(): void {
    if (this.stack.length > 1) {
      this.stack.pop()
      history.back()
    } else {
      this.navigate('#/capture')
    }
  }

  /** Start listening for hash changes */
  start(): void {
    window.addEventListener('hashchange', () => this.dispatch())
    this.dispatch()
  }

  private dispatch(): void {
    const hash = window.location.hash || '#/'
    const path = hash.slice(1) || '/'

    // Redirect bare # to capture
    if (path === '/') {
      this.navigate('#/capture')
      return
    }

    this.stack.push(hash)

    for (const route of this.routes) {
      const match = path.match(route.pattern)
      if (match) {
        const params: Record<string, string> = {}
        route.keys.forEach((key, i) => {
          params[key] = decodeURIComponent(match[i + 1] ?? '')
        })
        route.handler(params)
        return
      }
    }

    // Fallback: unknown route → capture
    this.navigate('#/capture')
  }
}

export const router = new Router()
