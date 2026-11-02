import { apiRequest } from './client';

export interface SubmitAppFeedbackInput {
  /** What the customer was looking for and could not find. */
  message: string;
  /** Phone number so the team can reply. */
  phone: string;
  screen?: string;
  platform?: string;
  secondsInApp: number;
}

/** Anonymous: sends what the customer was looking for, and how to reach them, to the admin "Couldn't find" list. */
export async function submitAppFeedback(input: SubmitAppFeedbackInput): Promise<void> {
  await apiRequest<void>(
    '/api/app-feedback',
    { method: 'POST', body: JSON.stringify(input) },
    false,
  );
}
