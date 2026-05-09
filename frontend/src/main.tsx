import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'

if (import.meta.env.DEV) {
  document.querySelectorAll("link[rel='icon']").forEach((el) => {
    const link = el as HTMLLinkElement
    if (link.type === 'image/svg+xml') link.href = '/favicon-dev.svg'
  })
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
)
