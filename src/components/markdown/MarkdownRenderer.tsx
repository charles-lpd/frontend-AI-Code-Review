import { createContext, isValidElement, memo, Profiler, useCallback, useContext, useEffect, useRef, useState, type ComponentProps } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/ui/button';
import { cn } from '@/lib/utils';

export interface MarkdownRendererProps { content: string; streaming?: boolean; className?: string }
const StreamingContext = createContext(false);
const plugins = [remarkGfm];
const aliases: Record<string, string> = { js: 'javascript', ts: 'typescript', html: 'markup', xml: 'markup', sh: 'bash', shell: 'bash', py: 'python', md: 'markdown' };
const languages = new Set(['javascript', 'typescript', 'jsx', 'tsx', 'json', 'markup', 'css', 'bash', 'python', 'sql', 'markdown']);
let highlighter: Promise<typeof import('./highlighter')> | undefined;
const CodeBlock = memo(function CodeBlock({ value, language }: { value: string; language: string }) {
  const streaming = useContext(StreamingContext);
  const [Prism, setPrism] = useState<typeof import('./highlighter')['default']>();
  const [highlighted, setHighlighted] = useState(value);
  const [copied, setCopied] = useState(false);
  const lastHighlight = useRef(0);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const normalized = aliases[language.toLowerCase()] ?? language.toLowerCase();
  useEffect(() => {
    let active = true;
    if (languages.has(normalized)) {
      highlighter ??= import('./highlighter');
      void highlighter.then(module => { if (active) setPrism(() => module.default); }).catch(() => {});
    }
    return () => { active = false; };
  }, [normalized]);
  useEffect(() => {
    const update = () => { lastHighlight.current = performance.now(); setHighlighted(value); };
    if (!streaming || performance.now() - lastHighlight.current >= 100) { update(); return; }
    const timer = setTimeout(update, Math.max(0, 100 - (performance.now() - lastHighlight.current)));
    return () => clearTimeout(timer);
  }, [value, streaming]);
  useEffect(() => () => clearTimeout(copyTimer.current), []);
  const prefix = value.startsWith(highlighted) ? highlighted : '';
  return <div className="code-block not-prose">
    <div className="code-block__header"><span>{language || 'text'}</span><Button variant="ghost" size="sm" aria-label="复制代码" onClick={() => {
      void navigator.clipboard.writeText(value).then(() => { setCopied(true); clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopied(false), 2000); }).catch(() => setCopied(false));
    }}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? '已复制' : '复制'}</Button></div>
    <pre className="overflow-x-auto p-4"><code>{Prism && languages.has(normalized) ? <><Prism language={normalized} PreTag="span" CodeTag="span" useInlineStyles={false}>{prefix}</Prism>{value.slice(prefix.length)}</> : value}</code></pre>
  </div>;
});
const components: Components = {
  pre({ children }) {
    if (isValidElement<ComponentProps<'code'>>(children) && children.type === 'code') {
      const language = /(?:^|\s)language-([^\s]+)/.exec(children.props.className ?? '')?.[1] ?? '';
      return <CodeBlock value={String(children.props.children ?? '')} language={language} />;
    }
    return <pre>{children}</pre>;
  },
  table({ children }) { return <div className="overflow-x-auto"><table>{children}</table></div>; },
  a({ children, href }) { return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>; },
  img({ alt, ...props }) { return <img {...props} alt={alt ?? ''} className="h-auto max-w-full" loading="lazy" />; },
};
const MarkdownBody = memo(function MarkdownBody({ content }: { content: string }) {
  return <ReactMarkdown remarkPlugins={plugins} components={components}>{content}</ReactMarkdown>;
});
export const MarkdownRenderer = memo(function MarkdownRenderer({ content, streaming = false, className }: MarkdownRendererProps) {
  const [rendered, setRendered] = useState(content);
  const timing = useRef({ interval: 0, slow: 0, last: 0 });
  const onRender = useCallback((_id: string, _phase: string, duration: number) => {
    if (!streaming) return;
    if (duration > 16) timing.current.interval = 48;
    if (duration > 8) { if (++timing.current.slow >= 3) timing.current.interval = Math.max(32, timing.current.interval); }
    else timing.current.slow = 0;
  }, [streaming]);
  useEffect(() => {
    const update = () => { timing.current.last = performance.now(); setRendered(content); };
    const remaining = timing.current.interval - (performance.now() - timing.current.last);
    if (!streaming || remaining <= 0) { update(); return; }
    const timer = setTimeout(update, remaining);
    return () => clearTimeout(timer);
  }, [content, streaming]);
  return <StreamingContext.Provider value={streaming}><div className={cn('markdown-content prose prose-sm max-w-none', className)}><Profiler id="markdown" onRender={onRender}><MarkdownBody content={streaming ? rendered : content} /></Profiler></div></StreamingContext.Provider>;
});
