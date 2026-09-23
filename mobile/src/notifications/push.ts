import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';
import { registerPushToken, removePushToken } from '../api/push';

/**
 * Outside-app push via Expo.
 * Remote Android push throws in Expo Go (SDK 53+) — needs a development or
 * production build. Skip the native module there so the app still loads.
 */

type NotificationModule = typeof import('expo-notifications');
type NotificationSubscription = { remove: () => void };

let Notifications: NotificationModule | null = null;

function loadNotifications(): NotificationModule | null {
  if (isRunningInExpoGo()) return null;
  if (Notifications) return Notifications;
  try {
    Notifications = require('expo-notifications') as NotificationModule;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch {
    Notifications = null;
  }
  return Notifications;
}

let cachedToken: string | null = null;

function projectId(): string | undefined {
  return (
    Constants.easConfig?.projectId ??
    (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId
  );
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  const notifications = loadNotifications();
  if (!notifications || !Device.isDevice) {
    return null;
  }

  try {
    const { status: existing } = await notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const requested = await notifications.requestPermissionsAsync();
      finalStatus = requested.status;
    }
    if (finalStatus !== 'granted') {
      return null;
    }

    if (Platform.OS === 'android') {
      await notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: notifications.AndroidImportance.DEFAULT,
      });
    }

    const id = projectId();
    const tokenResponse = id
      ? await notifications.getExpoPushTokenAsync({ projectId: id })
      : await notifications.getExpoPushTokenAsync();

    const token = tokenResponse.data;
    cachedToken = token;

    try {
      await registerPushToken({
        expoPushToken: token,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
      });
    } catch {
      // Non-fatal — weekly/onboarding simply won't reach this device until next try.
    }

    return token;
  } catch {
    // Expo Go / missing native module / permission errors — app continues without push.
    return null;
  }
}

export async function unregisterPushNotificationsAsync(): Promise<void> {
  const token = cachedToken;
  cachedToken = null;
  try {
    await removePushToken(token ?? undefined);
  } catch {
    // Best-effort on logout.
  }
}

export function getNotificationScreen(data: Record<string, unknown> | undefined): string | null {
  const screen = data?.screen;
  return typeof screen === 'string' && screen.length > 0 ? screen : null;
}

export function addNotificationResponseListener(
  onNavigate: (screen: string) => void,
): NotificationSubscription {
  const notifications = loadNotifications();
  if (!notifications) {
    return { remove: () => undefined };
  }

  return notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as Record<string, unknown> | undefined;
    const screen = getNotificationScreen(data);
    if (screen) onNavigate(screen);
  });
}
