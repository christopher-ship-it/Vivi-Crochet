import { setStatusBarStyle } from 'expo-status-bar';
import { Platform, StatusBar as RNStatusBar } from 'react-native';
import { colors } from '../theme';

/**
 * Safe Android status-bar helpers.
 * On newer RN / edge-to-edge Android, setBackgroundColor may be undefined.
 */
export function applyStatusBar(theme: 'light' | 'dark') {
  // expo: 'light' = light icons (for dark backgrounds), 'dark' = dark icons (for light backgrounds)
  setStatusBarStyle(theme);

  if (Platform.OS !== 'android') return;

  const barStyle = theme === 'light' ? 'light-content' : 'dark-content';
  const background = theme === 'light' ? colors.pink : '#ffe4ec';

  try {
    RNStatusBar.setBarStyle(barStyle, false);
  } catch {
    // ignore
  }

  const setBg = RNStatusBar.setBackgroundColor;
  if (typeof setBg === 'function') {
    try {
      setBg.call(RNStatusBar, background, false);
    } catch {
      // ignore — edge-to-edge builds no longer support this API
    }
  }
}
