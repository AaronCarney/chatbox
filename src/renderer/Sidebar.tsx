import { ActionIcon, Box, Button, Flex, Image, Stack, Text, Tooltip } from '@mantine/core'
import SwipeableDrawer from '@mui/material/SwipeableDrawer'
import { IconCirclePlus, IconLayoutSidebarLeftCollapse } from '@tabler/icons-react'
import { useNavigate } from '@tanstack/react-router'
import clsx from 'clsx'
import { useCallback, useEffect, useRef, useState } from 'react'
import { UserMenu } from './components/UserMenu'
import { useTranslation } from 'react-i18next'
import { ScalableIcon } from './components/common/ScalableIcon'
import useNeedRoomForMacWinControls from './hooks/useNeedRoomForWinControls'
import { useIsSmallScreen, useSidebarWidth } from './hooks/useScreenChange'
import { trackingEvent } from './packages/event'
import icon from './static/icon.png'
import { useLanguage } from './stores/settingsStore'
import { useUIStore } from './stores/uiStore'

export default function Sidebar() {
  const { t } = useTranslation()
  const language = useLanguage()
  const navigate = useNavigate()
  const showSidebar = useUIStore((s) => s.showSidebar)
  const setShowSidebar = useUIStore((s) => s.setShowSidebar)
  const setSidebarWidth = useUIStore((s) => s.setSidebarWidth)

  const sidebarWidth = useSidebarWidth()
  const isSmallScreen = useIsSmallScreen()

  const [isResizing, setIsResizing] = useState(false)
  const resizeStartX = useRef<number>(0)
  const resizeStartWidth = useRef<number>(0)

  const { needRoomForMacWindowControls } = useNeedRoomForMacWinControls()

  const handleCreateNewSession = useCallback(() => {
    navigate({ to: `/` })
    if (isSmallScreen) {
      setShowSidebar(false)
    }
    trackingEvent('create_new_conversation', { event_category: 'user' })
  }, [navigate, setShowSidebar, isSmallScreen])

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      if (isSmallScreen) return
      e.preventDefault()
      e.stopPropagation()
      setIsResizing(true)
      resizeStartX.current = e.clientX
      resizeStartWidth.current = sidebarWidth
    },
    [isSmallScreen, sidebarWidth]
  )

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      const isRTL = language === 'ar'
      const deltaX = isRTL ? resizeStartX.current - e.clientX : e.clientX - resizeStartX.current
      const newWidth = Math.max(200, Math.min(500, resizeStartWidth.current + deltaX))
      setSidebarWidth(newWidth)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, language, setSidebarWidth])

  return (
    <SwipeableDrawer
      anchor={language === 'ar' ? 'right' : 'left'}
      variant={isSmallScreen ? 'temporary' : 'persistent'}
      open={showSidebar}
      onClose={() => setShowSidebar(false)}
      onOpen={() => setShowSidebar(true)}
      ModalProps={{
        keepMounted: true,
        disableEnforceFocus: true,
      }}
      sx={{
        '& .MuiDrawer-paper': {
          backgroundColor: isSmallScreen ? undefined : 'transparent',
          backgroundImage: 'none',
          boxSizing: 'border-box',
          width: isSmallScreen ? '75vw' : sidebarWidth,
          maxWidth: '75vw',
        },
      }}
      SlideProps={language === 'ar' ? { direction: 'left' } : undefined}
      PaperProps={
        language === 'ar' ? { sx: { direction: 'rtl', overflowY: 'initial' } } : { sx: { overflowY: 'initial' } }
      }
      disableSwipeToOpen={false}
    >
      <Stack
        h="100%"
        gap={0}
        pt="var(--mobile-safe-area-inset-top, 0px)"
        pb="var(--mobile-safe-area-inset-bottom, 0px)"
        className="relative"
      >
        {needRoomForMacWindowControls && <Box className="title-bar flex-[0_0_44px]" />}

        <Flex align="center" justify="space-between" px="md" py="sm">
          <Flex align="center" gap="sm">
            <Image src={icon} w={20} h={20} />
            <Text span c="chatbox-secondary" size="xl" lh={1.2} fw="700">
              ChatBridge
            </Text>
          </Flex>

          <Flex align="center" gap="xs">
            <UserMenu />
            <Tooltip label={t('Collapse')} openDelay={1000} withArrow>
              <ActionIcon variant="subtle" color="chatbox-tertiary" size={20} onClick={() => setShowSidebar(false)}>
                <IconLayoutSidebarLeftCollapse />
              </ActionIcon>
            </Tooltip>
          </Flex>
        </Flex>

        <Box style={{ flex: 1 }} />

        <Stack gap={0} px="xs" pb="xs">
          <Stack gap="xs" pt="xs" mb="xs">
            <Button variant="light" fullWidth data-testid="new-chat-button" onClick={handleCreateNewSession}>
              <ScalableIcon icon={IconCirclePlus} className="mr-2" />
              {t('New Chat')}
            </Button>
          </Stack>
        </Stack>

        {!isSmallScreen && (
          <Box
            onMouseDown={handleResizeStart}
            className={clsx(
              `sidebar-resizer absolute top-0 bottom-0 w-1 cursor-col-resize z-[1] bg-chatbox-border-primary opacity-0 hover:opacity-70 transition-opacity duration-200`,
              language === 'ar' ? '-left-1' : '-right-1'
            )}
          />
        )}
      </Stack>
    </SwipeableDrawer>
  )
}
