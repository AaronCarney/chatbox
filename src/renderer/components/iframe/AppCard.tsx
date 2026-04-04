import type { FC } from 'react'
import { Button, Stack, Box, Typography } from '@mui/material'

export interface AppCardProps {
  appName: string
  type: 'result' | 'error' | 'partial'
  payload: {
    title?: string
    score?: number
    maxScore?: number
    items?: { label: string; value: string }[]
    encouragement?: string
  }
  onReopen?: () => void
  onRetry?: () => void
}

const typeStyles = {
  result: {
    borderColor: '#22c55e',
    bgColor: 'rgba(34, 197, 94, 0.12)',
  },
  error: {
    borderColor: '#ef4444',
    bgColor: 'rgba(239, 68, 68, 0.12)',
  },
  partial: {
    borderColor: '#eab308',
    bgColor: 'rgba(234, 179, 8, 0.12)',
  },
}

const AppCard: FC<AppCardProps> = ({ appName, type, payload, onReopen, onRetry }) => {
  const styles = typeStyles[type]

  return (
    <Box
      sx={{
        borderLeft: `4px solid ${styles.borderColor}`,
        backgroundColor: styles.bgColor,
        padding: '16px',
        borderRadius: '4px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      {/* Header: App Name and Title */}
      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 'bold', display: 'inline' }}>
          {appName}
        </Typography>
        {payload.title && (
          <Typography variant="body2" sx={{ color: 'text.secondary', display: 'inline', marginLeft: '8px' }}>
            {payload.title}
          </Typography>
        )}
      </Box>

      {/* Score */}
      {payload.score !== undefined && payload.maxScore !== undefined && (
        <Typography variant="h6" sx={{ fontWeight: '500' }}>
          {payload.score}/{payload.maxScore}
        </Typography>
      )}

      {/* Items List */}
      {payload.items && payload.items.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {payload.items.map((item, index) => (
            <Box key={index} sx={{ display: 'flex', gap: '8px' }}>
              <Typography variant="body2" sx={{ fontWeight: '500', minWidth: 'fit-content' }}>
                {item.label}:
              </Typography>
              <Typography variant="body2">{item.value}</Typography>
            </Box>
          ))}
        </Box>
      )}

      {/* Encouragement */}
      {payload.encouragement && (
        <Typography variant="body2" sx={{ color: '#22c55e', fontStyle: 'italic' }}>
          {payload.encouragement}
        </Typography>
      )}

      {/* Action Buttons */}
      {(onReopen || onRetry) && (
        <Stack direction="row" spacing={1} sx={{ marginTop: '8px' }}>
          {onReopen && (
            <Button variant="outlined" size="small" onClick={onReopen}>
              Reopen
            </Button>
          )}
          {onRetry && (
            <Button variant="outlined" size="small" onClick={onRetry}>
              Retry
            </Button>
          )}
        </Stack>
      )}
    </Box>
  )
}

export default AppCard
