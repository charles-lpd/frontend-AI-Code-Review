import { GitBranch, ArrowRight } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import './ConnectGithub.css';

export default function ConnectGithub() {
  const { login } = useAuth();

  return (
    <div className="connect-github">
      <div className="connect-github__container">
        <GitBranch size={64} className="connect-github__icon" />
        <h1 className="connect-github__title">欢迎使用 EverPay AI Review</h1>
        <p className="connect-github__description">
          连接您的 GitHub 账号，开始代码审查体验
        </p>
        <div className="connect-github__features">
          <div className="connect-github__feature">
            <h3>🔍 智能代码审查</h3>
            <p>自动分析您的代码，发现潜在问题和改进建议</p>
          </div>
          <div className="connect-github__feature">
            <h3>🚀 快速集成</h3>
            <p>一键连接您的 GitHub 仓库，轻松管理</p>
          </div>
          <div className="connect-github__feature">
            <h3>💡 智能建议</h3>
            <p>基于 AI 的代码分析和优化建议</p>
          </div>
        </div>
        <button onClick={login} className="connect-github__button">
          <GitBranch size={20} className="connect-github__icon" />
          <span>连接 GitHub</span>
          <ArrowRight size={20} />
        </button>
      </div>
    </div>
  );
}
