import { createFileRoute } from '@tanstack/react-router'
import { ChatBridgeApp } from '@/components/ChatBridgeApp'

export const Route = createFileRoute('/')({
  component: ChatBridgeApp,
})
