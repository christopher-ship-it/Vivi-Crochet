import { apiRequest } from './client';

export async function registerPushToken(input: {
  expoPushToken: string;
  platform: string;
}): Promise<void> {
  await apiRequest<void>('/api/me/push-token', {
    method: 'POST',
    body: JSON.stringify({
      expoPushToken: input.expoPushToken,
      platform: input.platform,
    }),
  });
}

export async function removePushToken(expoPushToken?: string): Promise<void> {
  const query = expoPushToken
    ? `?expoPushToken=${encodeURIComponent(expoPushToken)}`
    : '';
  await apiRequest<void>(`/api/me/push-token${query}`, {
    method: 'DELETE',
  });
}
