import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { LEARN_PROMPT_DELAY_MS, shouldShowLearnPrompt } from './learnPromptTimer.ts';

describe('learnPromptTimer', () => {
  test('does not show immediately', () => {
    assert.equal(
      shouldShowLearnPrompt({ hasLinkedCourse: true, dismissedThisSession: false, elapsedMs: 0 }),
      false,
    );
  });

  test('shows after the prompt delay', () => {
    assert.equal(
      shouldShowLearnPrompt({
        hasLinkedCourse: true,
        dismissedThisSession: false,
        elapsedMs: LEARN_PROMPT_DELAY_MS,
      }),
      true,
    );
  });

  test('does not show without linked course', () => {
    assert.equal(
      shouldShowLearnPrompt({
        hasLinkedCourse: false,
        dismissedThisSession: false,
        elapsedMs: LEARN_PROMPT_DELAY_MS,
      }),
      false,
    );
  });

  test('does not show after dismiss in same session', () => {
    assert.equal(
      shouldShowLearnPrompt({
        hasLinkedCourse: true,
        dismissedThisSession: true,
        elapsedMs: LEARN_PROMPT_DELAY_MS,
      }),
      false,
    );
  });

  test('does not show before full delay', () => {
    assert.equal(
      shouldShowLearnPrompt({
        hasLinkedCourse: true,
        dismissedThisSession: false,
        elapsedMs: LEARN_PROMPT_DELAY_MS - 1,
      }),
      false,
    );
  });
});
