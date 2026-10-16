import { LogIn, Sparkles } from 'lucide-react';
import { Card } from '@/ui/card';
import { Button } from '@/ui/button';

interface GenerationAuthGateProps {
  kind: 'image' | 'video';
  title: string;
  description: string;
  label: string;
  onLogin: () => void;
}

export function GenerationAuthGate({ kind, title, description, label, onLogin }: GenerationAuthGateProps) {
  return <div className={`generation-page generation-page--${kind}`}>
    <Card className="generation-page__auth-card">
      <div className="generation-page__auth-eyebrow"><Sparkles size={14} /><span>{label}</span></div>
      <h1 className="generation-page__auth-title">{title}</h1>
      <p className="generation-page__auth-text">{description}</p>
      <Button className="mt-4" onClick={onLogin}><LogIn size={16} />登录后开始生成</Button>
    </Card>
  </div>;
}
