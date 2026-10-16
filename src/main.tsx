import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './style.css'
import App from './App'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/ui/tooltip'

const rootEl = document.getElementById('root')
if (!rootEl) {
  throw new Error('Root element #root not found')
}

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter>
      <TooltipProvider delayDuration={300}>
        <App />
        <Toaster theme="light" position="top-center" closeButton toastOptions={{ className: 'border-border bg-popover text-popover-foreground' }} />
      </TooltipProvider>
    </BrowserRouter>
  </StrictMode>,
)
