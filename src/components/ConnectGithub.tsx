import { Card } from '@/ui/card';
import { Button } from '@/ui/button';
import {
  ArrowRight,
  Database,
  GitBranch,
  MessagesSquare,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import './ConnectGithub.css';

export default function ConnectGithub() {
  const { login } = useAuth();

  return (
    <div className="connect-github">
      <div className="connect-github__container">
        <div className="connect-github__hero">
          <div className="connect-github__eyebrow">
            <Sparkles size={14} />
            <span>AI 知识库</span>
          </div>
          <h1 className="connect-github__title">
            像 ChatGPT 一样
            <br />
            管理你的会话知识空间
          </h1>
          <p className="connect-github__description">
            连接 GitHub 后，你就能进入一个以会话为中心的 AI 知识库工作台。
            每个会话都拥有独立上下文、独立知识库、独立分享链接，聊天与文档检索会自然融合在一起。
          </p>
          <div className="connect-github__stats">
            <div className="connect-github__stat">
              <span className="connect-github__stat-value">Session</span>
              <span className="connect-github__stat-label">会话级隔离</span>
            </div>
            <div className="connect-github__stat">
              <span className="connect-github__stat-value">Async</span>
              <span className="connect-github__stat-label">异步索引</span>
            </div>
            <div className="connect-github__stat">
              <span className="connect-github__stat-value">SSE</span>
              <span className="connect-github__stat-label">流式回复</span>
            </div>
            <div className="connect-github__stat">
              <span className="connect-github__stat-value">Share</span>
              <span className="connect-github__stat-label">公开会话</span>
            </div>
          </div>
          <div className="connect-github__features">
            <div className="connect-github__feature">
              <Database size={18} />
              <h3>知识库随会话生长</h3>
              <p>上传文档后异步索引，检索只命中当前会话，不串会话。</p>
            </div>
            <div className="connect-github__feature">
              <MessagesSquare size={18} />
              <h3>聊天和知识联动</h3>
              <p>输入、历史消息和知识召回融为一体，使用体验更像真正的 AI 助手。</p>
            </div>
            <div className="connect-github__feature">
              <ShieldCheck size={18} />
              <h3>公开与私有并存</h3>
              <p>你可以把会话设为公开，也可以保留私有链接和本地缓存。</p>
            </div>
          </div>
        </div>

        <Card className="connect-github__panel">
          <div className="connect-github__panel-card">
            <h2 className="connect-github__panel-title">产品速览</h2>
            <p className="connect-github__panel-text">
              这是一个把「聊天、知识库、会话管理、公开分享」整合到同一页面的 AI 工作台。
            </p>
          </div>
          <div className="connect-github__steps">
            <div className="connect-github__step">
              <span className="connect-github__step-index">01</span>
              <div>
                <h3>连接账号</h3>
                <p>使用 GitHub OAuth 登录，进入你的工作区。</p>
              </div>
            </div>
            <div className="connect-github__step">
              <span className="connect-github__step-index">02</span>
              <div>
                <h3>创建会话</h3>
                <p>每个会话独立维护 Prompt、消息历史和知识文件。</p>
              </div>
            </div>
            <div className="connect-github__step">
              <span className="connect-github__step-index">03</span>
              <div>
                <h3>上传知识</h3>
                <p>文档上传后先落盘，索引在后台完成并自动刷新状态。</p>
              </div>
            </div>
          </div>
          <Button onClick={login} className="connect-github__button">
            <GitBranch size={20} />
            <span>连接 GitHub，开始使用</span>
            <ArrowRight size={20} />
          </Button>
          <div className="connect-github__footnote">
            <Upload size={16} />
            <span>支持会话级知识库、流式问答、公开会话和本地缓存。</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
