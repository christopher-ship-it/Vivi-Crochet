import { apiRequest } from './client';

export interface SubmitAppFeedbackInput {
  /** What the customer was looking for and could not find. */
  message: string;
  screen?: string;
  platform?: string;
  secondsInApp: number;
}

/** Anonymous: sends what the customer was looking for and could not find to the admin "Couldn't find" list. */
export async function submitAppFeedback(input: SubmitAppFeedbackInput): Promise<void> {
  await apiRequest<void>(
    '/api/app-feedback',
    { method: 'POST', body: JSON.stringify(input) },
    false,
  );
}
