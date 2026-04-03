import type React from 'react'
import { useEffect, useRef } from 'react'

export interface IframeManagerProps {
  appId: string
  iframeUrl: string
  isActive: boolean
  onRef?: (el: HTMLIFrameElement | null) => void
}

export function IframeManager({ appId, iframeUrl, isActive, onRef }: IframeManagerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (onRef) {
      onRef(iframeRef.current)
    }
  }, [onRef])

  return (
    <iframe
      ref={iframeRef}
      src={iframeUrl}
      sandbox="allow-scripts"
      allow=""
      referrerPolicy="no-referrer"
      loading="lazy"
      title={appId}
      style={{
        width: '100%',
        height: '400px',
        maxHeight: '600px',
        minHeight: '200px',
        borderRadius: '8px',
        border: 'none',
        display: isActive ? 'block' : 'none',
      }}
    />
  )
}
