export type WorkflowStageKey =
  | 'processing'
  | 'done'
  | 'claimed'
  // Preserved for full backward compatibility with historical records
  | 'pending'
  | 'washing_drying'
  | 'washing'
  | 'drying'
  | 'ironing'
  | 'dry_cleaning'
  | 'folding'
  | 'cancelled';

export interface WorkflowStageInfo {
  key: WorkflowStageKey;
  label: string;
  icon: string;
  color: string;
}

export const ALL_STAGES: Record<WorkflowStageKey, WorkflowStageInfo> = {
  processing: { key: 'processing', label: 'Processing', icon: '🔄', color: 'blue' },
  done: { key: 'done', label: 'Ready for Pickup', icon: '🛍️', color: 'emerald' },
  claimed: { key: 'claimed', label: 'Delivered', icon: '📦', color: 'slate' },
  // Historical mapping labels
  pending: { key: 'pending', label: 'Processing', icon: '🔄', color: 'blue' },
  washing_drying: { key: 'washing_drying', label: 'Processing', icon: '🔄', color: 'blue' },
  washing: { key: 'washing', label: 'Processing', icon: '🔄', color: 'blue' },
  drying: { key: 'drying', label: 'Processing', icon: '🔄', color: 'blue' },
  ironing: { key: 'ironing', label: 'Processing', icon: '🔄', color: 'blue' },
  dry_cleaning: { key: 'dry_cleaning', label: 'Processing', icon: '🔄', color: 'blue' },
  folding: { key: 'folding', label: 'Processing', icon: '🔄', color: 'blue' },
  cancelled: { key: 'cancelled', label: 'Cancelled', icon: '❌', color: 'rose' },
};

/**
 * Checks whether an order is in the active Processing stage (including legacy stages)
 */
export function isProcessingStage(status: string): boolean {
  return [
    'processing',
    'pending',
    'washing_drying',
    'washing',
    'drying',
    'ironing',
    'dry_cleaning',
    'folding',
  ].includes(status);
}

/**
 * Normalizes any stages array to the simplified 3-stage customer progression
 */
export function normalizeWorkflowStages(stages?: (WorkflowStageKey | string)[]): WorkflowStageKey[] {
  return ['processing', 'done', 'claimed'];
}

/**
 * Determine the ordered workflow stages based on services selected in the order.
 * In the simplified workflow, all orders advance from processing to done, then claimed.
 */
export function getWorkflowStagesForServices(services?: string[]): WorkflowStageKey[] {
  return ['processing', 'done', 'claimed'];
}

/**
 * Get the next stage in the simplified workflow:
 * Processing -> Ready for Pickup ('done') -> Delivered ('claimed')
 */
export function getNextStage(
  currentStage: WorkflowStageKey | string,
  activeStages?: (WorkflowStageKey | string)[]
): WorkflowStageKey | null {
  if (isProcessingStage(currentStage)) {
    return 'done';
  }
  if (currentStage === 'done') {
    return 'claimed';
  }
  return null; // Already delivered or cancelled
}
