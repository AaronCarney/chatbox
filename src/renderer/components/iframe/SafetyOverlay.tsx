import type { FC } from 'react'

interface SafetyOverlayProps {
  visible: boolean
  hardBlock?: boolean
}

export const SafetyOverlay: FC<SafetyOverlayProps> = ({ visible, hardBlock }) => {
  if (!visible) return null

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
    }}>
      <p style={{ color: '#999', fontSize: '14px', textAlign: 'center', padding: '20px' }}>
        {hardBlock ? 'This content has been blocked.' : "Content isn't available right now."}
      </p>
    </div>
  )
}
