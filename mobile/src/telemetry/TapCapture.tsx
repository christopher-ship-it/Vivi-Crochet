import type { ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { recordTap } from './telemetry';

/**
 * Wraps the app and counts every touch-down for the admin heatmap. onTouchStart is a passive
 * bubbling event, so it never intercepts or delays touches meant for the screen underneath.
 * Only a grid cell and the screen name are recorded — no content.
 */
export function TapCapture({ children }: { children: ReactNode }) {
  const { width, height } = useWindowDimensions();
  return (
    <View
      style={{ flex: 1 }}
      onTouchStart={(e) => recordTap(e.nativeEvent.pageX, e.nativeEvent.pageY, width, height)}
    >
      {children}
    </View>
  );
}
