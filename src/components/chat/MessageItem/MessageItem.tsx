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
    
    // 1. 移除每个行首可能有的多余 "> " 前缀（来自旧版本的输出）
    // 处理类似 "\n> 内容" 变成 "\n内容"，但保留真正的 markdown 引用块
    processed = processed.replace(/^>\s*/gm, (match, offset, original) => {
      // 如果是真正的引用块（前面有空行或开头），保留
      if (offset === 0 || original[offset - 1] === '\n') {
        // 检查是否是真正的引用块内容，而不是被错误添加的前缀
        const before = original.slice(0, offset);
        // 如果前面已经有 markdown 结构（比如标题、列表），就保留
        if (before.includes('#') || before.includes('*') || before.includes('-')) {
          return match;
        }
        // 否则，我们检查一下后面的内容
        const after = original.slice(offset + match.length);
        // 如果后面是正常的内容，就去掉这个多余的前缀
        if (after.trim().length > 0 && !after.trim().startsWith('>')) {
          return '';
        }
      }
      return match;
    });
    
    // 2. 修复被错误分割的引用块
    processed = processed.replace(/\n>\s*([^\n]*)/g, '\n> $1');
    
    // 3. 合并多余的连续引用标记
    processed = processed.replace(/(\n>\s*)+/g, '\n> ');
    
    // 4. 清理多余空行
    processed = processed.replace(/\n{3,}/g, '\n\n');
    
    // 5. 清理开头的多余空行
    processed = processed.replace(/^\n+/, '');
    
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
