import { Card } from '@/ui/card';
import { Button } from '@/ui/button';
import { Badge } from '@/ui/badge';
import { ChevronDown } from 'lucide-react';
import { memo } from 'react';
import { useAgentTimeline } from '../../hooks/useAgentTimeline';
import type { AgentTimelineProps } from '../../types/agent';
import { AgentStepItem } from './AgentStepItem';

function AgentTimelineBase({
  steps,
  currentStep,
  onStepClick,
}: AgentTimelineProps) {
  const { isOpen, toggleOpen, activeStepKey, stepCount } = useAgentTimeline({
    steps,
    currentStep,
  });

  return (
    <Card className="agent-page__panel">
      <Button variant="ghost"
        type="button"
        className="agent-page__panel-toggle"
        onClick={toggleOpen}
        aria-expanded={isOpen}
      >
        <div>
          <div className="agent-page__panel-title-row">
            <h2 className="agent-page__panel-title">步骤列表</h2>
            <Badge className="agent-page__panel-badge">{stepCount} 步</Badge>
          </div>
          <p className="agent-page__panel-subtitle">按后端返回的产品化步骤展示。</p>
        </div>
        <ChevronDown
          size={18}
          className={`agent-page__collapse-icon${isOpen ? ' agent-page__collapse-icon--open' : ''}`}
        />
      </Button>

      <div
        className={`agent-page__collapse-shell${
          isOpen ? ' agent-page__collapse-shell--open' : ''
        }`}
      >
        <div className="agent-page__collapse-body">
          <div className="agent-page__step-list">
            {steps.length > 0 ? (
              steps.map((step) => {
                const isActive = step.stepKey === activeStepKey;
                return (
                  <AgentStepItem
                    key={step.stepKey}
                    step={step}
                    isActive={isActive}
                    isExpanded={isActive}
                    onClick={() => onStepClick?.(step.stepKey)}
                  />
                );
              })
            ) : (
              <div className="agent-page__empty-note">等待后端返回步骤列表。</div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

export const AgentTimeline = memo(AgentTimelineBase);
