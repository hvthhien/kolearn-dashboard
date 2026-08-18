import { QueryClient } from '@tanstack/react-query'
import { isProblem } from './problem'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // A 4xx is an answer, not a hiccup. Retrying a 404 three times just
        // makes the learner wait three times as long to be told the same thing.
        if (isProblem(error) && error.status < 500) return false
        return failureCount < 2
      },
    },
    mutations: { retry: false },
  },
})
