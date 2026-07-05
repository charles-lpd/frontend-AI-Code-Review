import { GitBranch, ArrowRight } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import './ConnectGithub.css';

export default function ConnectGithub() {
  const { login } = useAuth();

  return (
    <div className="connect-github">
      <div className="connect-github__container">
        <div className="connect-github__hero">
          <div className="connect-github__eyebrow">
            <GitBranch size={14} />
            <span>AI Code Review Workspace</span>
          </div>
          <h1 className="connect-github__title">
            像 ChatGPT 一样
            <br />
            开始你的代码审查
          </h1>
          <p className="connect-github__description">
            连接 GitHub 后，你可以直接在对话中发起审查、查看结果、管理会话和知识库。
            我们会把整个体验收敛成更轻、更干净的 AI 产品界面。
          </p>
          <div className="connect-github__features">
            <div className="connect-github__feature">
              <h3>对话式审查</h3>
              <p>围绕仓库直接提问、发起分析，结果像聊天一样自然呈现。</p>
            </div>
            <div className="connect-github__feature">
              <h3>会话聚焦</h3>
              <p>每个会话都有自己的上下文、知识库和公开权限。</p>
            </div>
            <div className="connect-github__feature">
              <h3>更克制的 UI</h3>
              <p>更像 ChatGPT 的留白、层次和输入体验，而不是传统后台。</p>
            </div>
          </div>
        </div>

        <div className="connect-github__panel">
          <div className="connect-github__panel-card">
            <h2 className="connect-github__panel-title">开始使用</h2>
            <p className="connect-github__panel-text">
              连接你的 GitHub 账号后，我们会同步你的仓库信息，并进入审查工作区。
            </p>
          </div>
          <button onClick={login} className="connect-github__button">
            <GitBranch size={20} />
            <span>连接 GitHub</span>
            <ArrowRight size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
