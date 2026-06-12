import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check, User, Bot, Wrench, Info } from 'lucide-react';
import { useState } from 'react';
import type { ChatRole } from '../../../types/chat';
import './MessageItem.css';

interface MessageItemProps {
  role: ChatRole;
  content: string;
}

export default function MessageItem({ role, content }: MessageItemProps) {
  const getIcon = () => {
    switch (role) {
      case 'user':
        return <User size={18} />;
      case 'assistant':
        return <Bot size={18} />;
      case 'tool':
        return <Wrench size={18} />;
      case 'system':
        return <Info size={18} />;
      default:
        return <Bot size={18} />;
    }
  };

  // 预处理内容，修复被错误分割的 markdown 引用块
  const processContent = (text: string) => {
    if (!text) return text;
    
    let processed = text;
    
    // 修复：将连续的 \n> 开头的片段正确处理，避免每个 > 都变成新引用块
    // 这个正则将 \n> 后面跟着空格或没有的内容，统一格式化为 > 
    processed = processed.replace(/\n>\s*([^\n]*)/g, '\n> $1');
    
    // 修复：如果有多个连续的 \n> ，合并它们
    processed = processed.replace(/(\n>\s*)+/g, '\n> ');
    
    // 清理多余的空行
    processed = processed.replace(/\n{3,}/g, '\n\n');
    
    return processed;
  };

  const processedContent = processContent(content);

  return (
    <div className={`message-item message-item--${role}`}>
      <div className="message-item__avatar">{getIcon()}</div>
      <div className="message-item__content">
        {role === 'tool' ? (
          <div className="message-item__tool-output">
            <div className="message-item__tool-label">工具调用结果</div>
            <pre>{content}</pre>
          </div>
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ node, inline, className, children, ...props }: any) {
                const match = /language-(\w+)/.exec(className || '');
                return !inline && match ? (
                  <CodeBlock
                    language={match[1]}
                    value={String(children).replace(/\n$/, '')}
                    {...props}
                  />
                ) : (
                  <code className={className} {...props}>
                    {children}
                  </code>
                );
              },
            }}
          >
            {processedContent}
          </ReactMarkdown>
        )}
      </div>
    </div>
  );
}

function CodeBlock({ language, value }: { language: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy!', err);
    }
  };

  return (
    <div className="code-block">
      <div className="code-block__header">
        <span className="code-block__lang">{language}</span>
        <button className="code-block__copy" onClick={copyToClipboard}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
          <span>{copied ? '已复制' : '复制'}</span>
        </button>
      </div>
      <SyntaxHighlighter
        language={language}
        style={oneDark}
        customStyle={{ margin: 0, borderRadius: '0 0 8px 8px' }}
      >
        {value}
      </SyntaxHighlighter>
    </div>
  );
}
