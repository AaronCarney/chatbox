import type { FC } from 'react'

interface SafetyOverlayProps {
  visible: boolean
  hardBlock?: boolean
}

export const SafetyOverlay: FC<SafetyOverlayProps> = ({ visible, hardBlock }) => {
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      zIndex: 10,
      borderRadius: '8px',
      opacity: visible ? 1 : 0,
      pointerEvents: visible ? 'auto' : 'none',
      transition: 'opacity 0.5s ease',
    }}>
      <p style={{ color: '#999', fontSize: '14px', textAlign: 'center', padding: '20px' }}>
        {hardBlock ? 'This content has been blocked.' : "Content isn't available right now."}
      </p>
    </div>
  )
}
