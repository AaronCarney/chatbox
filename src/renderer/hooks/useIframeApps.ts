import { useRef, useState } from 'react'

export type AppInstance = {
  id: string
  iframeUrl: string
  status: 'active' | 'hidden' | 'serialized'
  lastUsed: number
}

export function useIframeApps() {
  const [apps, setApps] = useState<Map<string, AppInstance>>(new Map())
  const iframeRefs = useRef<Map<string, HTMLIFrameElement>>(new Map())

  const launchApp = (appId: string, url: string) => {
    setApps((prevApps) => {
      const newApps = new Map(prevApps)

      // Set current active app to hidden
      for (const [id, app] of newApps) {
        if (app.status === 'active') {
          newApps.set(id, { ...app, status: 'hidden' })
          break
        }
      }

      // Count live (active + hidden) iframes
      let liveCount = 0
      let oldestHiddenId: string | null = null
      let oldestHiddenTime = Infinity

      for (const [id, app] of newApps) {
        if (app.status === 'active' || app.status === 'hidden') {
          liveCount++
          if (app.status === 'hidden' && app.lastUsed < oldestHiddenTime) {
            oldestHiddenTime = app.lastUsed
            oldestHiddenId = id
          }
        }
      }

      // If we have 2 or more live iframes, destroy the oldest hidden one
      if (liveCount >= 2 && oldestHiddenId) {
        newApps.set(oldestHiddenId, { ...newApps.get(oldestHiddenId)!, status: 'serialized' })
        const refs = iframeRefs.current
        refs.delete(oldestHiddenId)
      }

      // Add new app as active
      newApps.set(appId, {
        id: appId,
        iframeUrl: url,
        status: 'active',
        lastUsed: Date.now(),
      })

      return newApps
    })
  }

  const getActiveApp = (): AppInstance | null => {
    for (const app of apps.values()) {
      if (app.status === 'active') {
        return app
      }
    }
    return null
  }

  return {
    apps,
    iframeRefs,
    launchApp,
    getActiveApp,
  }
}
