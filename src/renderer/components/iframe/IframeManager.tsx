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

  return (
    <iframe
      ref={iframeRef}
      src={iframeUrl}
      sandbox={sandbox ? `${sandbox} allow-same-origin` : 'allow-scripts allow-same-origin'}
      allow=""
      referrerPolicy="no-referrer"
      loading="eager"
      title={appId}
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
        display: isActive ? 'block' : 'none',
      }}
    />
  )
}
