/** Pure helpers for the product-detail learning prompt delay (testable without RN). */

/** Short delay so the product can paint, then the linked-course prompt appears. */
export const LEARN_PROMPT_DELAY_MS = 800;

export type LearnPromptTimerAction =
  | { type: 'show' }
  | { type: 'noop' };

/** After a continuous focus period of LEARN_PROMPT_DELAY_MS, show once unless dismissed. */
export function shouldShowLearnPrompt(args: {
  hasLinkedCourse: boolean;
  dismissedThisSession: boolean;
  elapsedMs: number;
}): boolean {
  if (!args.hasLinkedCourse || args.dismissedThisSession) return false;
  return args.elapsedMs >= LEARN_PROMPT_DELAY_MS;
}
