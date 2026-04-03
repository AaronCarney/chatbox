import { Navigate, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/$catchAll')({
  component: () => <Navigate to="/" replace />,
})
