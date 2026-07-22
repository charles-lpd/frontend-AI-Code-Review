import { useCallback, useMemo, useState } from 'react';
import type { AgentStep } from '../types/agent';

export interface UseAgentTimelineArgs {
  steps: AgentStep[];
  currentStep: string | null;
}

export interface UseAgentTimelineResult {
  isOpen: boolean;
  toggleOpen: () => void;
  activeStepKey: string | null;
  stepCount: number;
}

export function useAgentTimeline({
  steps,
  currentStep,
}: UseAgentTimelineArgs): UseAgentTimelineResult {
  const [isOpen, setIsOpen] = useState(true);

  const activeStepKey = useMemo(
    () => currentStep ?? steps[0]?.stepKey ?? null,
    [currentStep, steps],
  );

  const toggleOpen = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  return {
    isOpen,
    toggleOpen,
    activeStepKey,
    stepCount: steps.length,
  };
}
