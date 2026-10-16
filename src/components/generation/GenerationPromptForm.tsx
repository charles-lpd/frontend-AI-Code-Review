import { useId, type FormEvent } from 'react';
import { LoaderCircle, Sparkles } from 'lucide-react';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Label } from '@/ui/label';
import { Textarea } from '@/ui/textarea';

interface GenerationPromptFormProps {
  presetLabel: string;
  prompt: string;
  placeholder: string;
  submitLabel: string;
  busy: boolean;
  readOnly: boolean;
  canSubmit: boolean;
  runId?: string;
  onPromptChange: (value: string) => void;
  onSubmit: (event?: FormEvent) => void | Promise<void>;
}

export function GenerationPromptForm({ presetLabel, prompt, placeholder, submitLabel, busy, readOnly, canSubmit, runId, onPromptChange, onSubmit }: GenerationPromptFormProps) {
  const inputId = useId();
  return (
    <Card className="generation-page__card generation-page__form--prompt">
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">提示词模块</h2>
            <p className="mt-1 text-sm text-muted-foreground">输入提示词后，点击生成，页面会轮询 `GET /runs/:id` 直到成功。</p>
          </div>
          <Badge variant="secondary">{presetLabel}</Badge>
        </div>
        {runId && <div className="generation-page__summary-row"><span>RunId</span><strong>{runId}</strong></div>}
        <div className="flex flex-col gap-2">
          <Label htmlFor={inputId}>提示词 *</Label>
          <Textarea id={inputId} className="min-h-40 resize-y" value={prompt} disabled={busy || readOnly} placeholder={placeholder}
            onChange={event => onPromptChange(event.target.value)}
            onKeyDown={event => {
              if (event.nativeEvent.isComposing || busy || readOnly) return;
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                if (canSubmit) void onSubmit();
              }
            }} />
        </div>
        <Button type="submit" disabled={!canSubmit} loading={busy}>
          {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {busy ? '生成中...' : submitLabel}
        </Button>
      </form>
    </Card>
  );
}
