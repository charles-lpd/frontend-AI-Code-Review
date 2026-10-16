import { Textarea } from '@/ui/textarea';
import { Button } from '@/ui/button';
import { memo } from 'react';
import { AlertCircle } from 'lucide-react';
import type { AgentClarificationCardProps } from '../../types/agent';

function AgentClarificationCardBase({
  questions,
  answer,
  onAnswerChange,
  onSubmit,
}: AgentClarificationCardProps) {
  return (
    <div className="agent-page__state-card agent-page__state-card--warning">
      <div className="agent-page__state-card-title">
        <AlertCircle size={18} />
        <span>需要补充信息</span>
      </div>
      <div className="agent-page__question-list">
        {questions.length > 0 ? (
          questions.map((question) => (
            <div key={question} className="agent-page__question-item">
              {question}
            </div>
          ))
        ) : (
          <div className="agent-page__empty-note">后端正在整理追问。</div>
        )}
      </div>

      <div className="agent-page__clarify-box">
        <Textarea
          className="agent-page__textarea"
          rows={3}
          value={answer}
          onChange={(event) => onAnswerChange(event.target.value)}
          placeholder="补充一点信息后再提交"
        />
        <Button type="button" className="agent-page__primary-button" onClick={onSubmit}>
          提交回答
        </Button>
      </div>
    </div>
  );
}

export const AgentClarificationCard = memo(AgentClarificationCardBase);
