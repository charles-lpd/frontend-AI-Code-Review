import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './style.css'
import App from './App'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/ui/tooltip'
import { handleLoginCallback } from './lib/loginPopup'

const rootEl = document.getElementById('root')
if (!rootEl) {
  throw new Error('Root element #root not found')
}

// GitHub 登录回调（/login-callback?token=...）：直接完成登录，不渲染应用，避免弹窗跳到首页
if (handleLoginCallback()) {
  createRoot(rootEl).render(
    <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>
      登录成功，可以关闭此窗口。
    </div>,
  )
} else {
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
}
