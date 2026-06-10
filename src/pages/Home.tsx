/** 首页：左侧会话导航 + 右侧聊天面板，路由 /chat/:sessionId */
import { useState } from 'react'
import ChatPanel from '../components/chat/ChatPanel'
import ChatSessionNav from '../components/chat/ChatSessionNav'
import { useChatRouteSync } from '../hooks/useChatRouteSync'
import './Home.css'

export default function Home() {
  useChatRouteSync()
  const [sendingSessionId, setSendingSessionId] = useState<string | null>(null)

  return (
    <div className="home">
      <ChatSessionNav sendingSessionId={sendingSessionId} />
      <ChatPanel onSendingChange={setSendingSessionId} />
    </div>
  )
}
