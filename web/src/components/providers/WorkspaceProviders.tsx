import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useMemo, type ReactNode } from 'react'
import { useAuth } from '../../context/AuthContext'

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (count, err: any) => {
          const status = err?.status ?? err?.statusCode
          if (status === 401 || status === 403 || status === 404) return false
          return count < 2
        },
        refetchOnWindowFocus: true,
      },
    },
  })
}

/** Providers used only inside the authenticated application shell. */
export default function WorkspaceProviders({ children }: { children: ReactNode }) {
  const { user, activeTeamId } = useAuth()
  // A client is scoped to the authenticated identity/team. This prevents a
  // logout/account switch or team switch from serving stale data from the
  // previous session while preserving the normal cache during navigation.
  const queryClient = useMemo(
    () => createQueryClient(),
    [user?.id, activeTeamId],
  )

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
