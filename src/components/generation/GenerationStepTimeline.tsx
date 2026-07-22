import { memo, useMemo } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  Clock3,
  LoaderCircle,
  SkipForward,
  XCircle,
} from 'lucide-react';
import type { GenerationRunStep } from '../../types/generation';

interface GenerationStepTimelineProps {
  steps: GenerationRunStep[];
  currentStep: string | null;
  title: string;
  subtitle?: string;
}

function statusIcon(status: GenerationRunStep['stepStatus']) {
  switch (status) {
    case 'running':
      return <LoaderCircle size={14} className="generation-page__spin" />;
    case 'completed':
      return <CheckCircle2 size={14} />;
    case 'failed':
      return <XCircle size={14} />;
    case 'waiting':
      return <Clock3 size={14} />;
    case 'skipped':
      return <SkipForward size={14} />;
    default:
      return <Clock3 size={14} />;
  }
}

function statusText(status: GenerationRunStep['stepStatus']) {
  switch (status) {
    case 'running':
      return '进行中';
    case 'completed':
      return '已完成';
    case 'failed':
      return '失败';
    case 'waiting':
      return '等待中';
    case 'skipped':
      return '已跳过';
    default:
      return '待处理';
  }
}

function GenerationStepTimelineBase({ steps, currentStep, title, subtitle }: GenerationStepTimelineProps) {
  const orderedSteps = useMemo(() => [...steps].sort((a, b) => a.stepIndex - b.stepIndex), [steps]);

  return (
    <section className="generation-page__card generation-page__timeline">
      <div className="generation-page__card-head">
        <div>
          <h2 className="generation-page__card-title">{title}</h2>
          {subtitle && <p className="generation-page__card-subtitle">{subtitle}</p>}
        </div>
        <span className="generation-page__badge">{orderedSteps.length} 步</span>
      </div>
      <div className="generation-page__timeline-list">
        {orderedSteps.length > 0 ? (
          orderedSteps.map((step, index) => {
            const active = step.stepKey === currentStep;
            const displayIndex = typeof step.stepIndex === 'number' ? step.stepIndex : index + 1;
            return (
              <div
                key={step.stepKey}
                className={`generation-page__step${active ? ' generation-page__step--active' : ''}`}
              >
                <div className="generation-page__step-icon">{statusIcon(step.stepStatus)}</div>
                <div className="generation-page__step-main">
                  <div className="generation-page__step-row">
                    <span className="generation-page__step-index">{String(displayIndex).padStart(2, '0')}</span>
                    <span className="generation-page__step-label">{step.stepLabel}</span>
                  </div>
                  <div className="generation-page__step-meta">
                    <span>{statusText(step.stepStatus)}</span>
                    {typeof step.stepTotal === 'number' && step.stepTotal > 0 && (
                      <span>
                        {displayIndex}/{step.stepTotal}
                      </span>
                    )}
                    {typeof step.durationMs === 'number' && step.stepStatus === 'completed' && (
                      <span>{step.durationMs < 1000 ? `${step.durationMs}ms` : `${(step.durationMs / 1000).toFixed(1)}s`}</span>
                    )}
                    {step.message && <span>{step.message}</span>}
                  </div>
                </div>
                {active && <ChevronDown size={16} className="generation-page__step-chevron" />}
              </div>
            );
          })
        ) : (
          <div className="generation-page__empty-note">等待任务流返回步骤。</div>
        )}
      </div>
    </section>
  );
}

export const GenerationStepTimeline = memo(GenerationStepTimelineBase);
