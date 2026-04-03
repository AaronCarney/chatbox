import type React from 'react'
import { useEffect, useRef } from 'react'

export interface IframeManagerProps {
  appId: string
  iframeUrl: string
  isActive: boolean
  height?: number
  sandbox?: string
  onRef?: (el: HTMLIFrameElement | null) => void
}

export function IframeManager({ appId, iframeUrl, isActive, height, sandbox, onRef }: IframeManagerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (onRef) {
      onRef(iframeRef.current)
    }
  }, [onRef])

  const clampedHeight = Math.min(800, Math.max(200, height || 400))

  return (
    <iframe
      ref={iframeRef}
      src={iframeUrl}
      sandbox={sandbox || 'allow-scripts'}
      {...{ credentialless: '' } as any}
      allow=""
      referrerPolicy="no-referrer"
      loading="eager"
      title={appId}
      style={{
        width: '100%',
        height: `${clampedHeight}px`,
        borderRadius: '8px',
        border: 'none',
        display: isActive ? 'block' : 'none',
      }}
    />
  )
}
