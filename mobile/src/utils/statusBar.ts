import { setStatusBarBackgroundColor, setStatusBarStyle, setStatusBarTranslucent } from 'expo-status-bar';
import { Platform, StatusBar as RNStatusBar } from 'react-native';

/**
 * Draw the app gradient under the Android notification bar.
 * Screens already pad with safe-area insets so content stays below icons.
 */
export function applyStatusBar(theme: 'light' | 'dark') {
  setStatusBarStyle(theme);

  if (Platform.OS !== 'android') return;

  const barStyle = theme === 'light' ? 'light-content' : 'dark-content';

  try {
    setStatusBarTranslucent(true);
    setStatusBarBackgroundColor('transparent', false);
  } catch {
    // ignore
  }

  try {
    RNStatusBar.setBarStyle(barStyle, false);
  } catch {
    // ignore
  }

  const setTranslucent = RNStatusBar.setTranslucent;
  if (typeof setTranslucent === 'function') {
    try {
      setTranslucent.call(RNStatusBar, true);
    } catch {
      // ignore
    }
  }

  const setBg = RNStatusBar.setBackgroundColor;
  if (typeof setBg === 'function') {
    try {
      setBg.call(RNStatusBar, 'transparent', false);
    } catch {
      // ignore — edge-to-edge builds may not support this API
    }
  }
}
