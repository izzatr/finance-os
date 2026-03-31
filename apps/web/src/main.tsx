import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CurrencyProvider } from './contexts/CurrencyContext'
import { App } from './App'
import './styles.css'

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <CurrencyProvider>
          <TooltipProvider>
            <App />
          </TooltipProvider>
        </CurrencyProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
