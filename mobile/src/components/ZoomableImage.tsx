import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { AppImage } from './AppImage';

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

interface ZoomableImageProps {
  uri: string;
  width: number;
  height: number;
  /** Zoom resets whenever the slide stops being the visible one. */
  active: boolean;
  onTap: () => void;
  /** Lets the parent pager stop swiping while the image is zoomed in. */
  onZoomChange: (zoomed: boolean) => void;
  accessibilityLabel?: string;
}

/** Pinch to zoom, drag to pan while zoomed, double-tap to toggle, tap to dismiss. */
export function ZoomableImage({
  uri,
  width,
  height,
  active,
  onTap,
  onZoomChange,
  accessibilityLabel,
}: ZoomableImageProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const cur = useRef({ s: 1, x: 0, y: 0 });
  const start = useRef({ s: 1, x: 0, y: 0 });
  const [zoomed, setZoomed] = useState(false);
  const zoomedRef = useRef(false);

  const limit = (s: number) => ({
    x: (width * (s - 1)) / 2,
    y: (height * (s - 1)) / 2,
  });

  const apply = (s: number, x: number, y: number, animated: boolean) => {
    cur.current = { s, x, y };
    if (animated) {
      Animated.parallel([
        Animated.spring(scale, { toValue: s, useNativeDriver: true, bounciness: 0 }),
        Animated.spring(tx, { toValue: x, useNativeDriver: true, bounciness: 0 }),
        Animated.spring(ty, { toValue: y, useNativeDriver: true, bounciness: 0 }),
      ]).start();
    } else {
      scale.setValue(s);
      tx.setValue(x);
      ty.setValue(y);
    }
    const isZoomed = s > 1.01;
    if (zoomedRef.current !== isZoomed) {
      zoomedRef.current = isZoomed;
      setZoomed(isZoomed);
      onZoomChange(isZoomed);
    }
  };

  useEffect(() => {
    if (!active) apply(1, 0, 0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const pinch = Gesture.Pinch()
    .onStart(() => {
      start.current = { ...cur.current };
    })
    .onUpdate((e) => {
      const s = clamp(start.current.s * e.scale, 0.8, MAX_SCALE + 1);
      const l = limit(Math.max(s, 1));
      apply(s, clamp(cur.current.x, -l.x, l.x), clamp(cur.current.y, -l.y, l.y), false);
    })
    .onEnd(() => {
      const s = clamp(cur.current.s, 1, MAX_SCALE);
      if (s <= 1) {
        apply(1, 0, 0, true);
      } else {
        const l = limit(s);
        apply(s, clamp(cur.current.x, -l.x, l.x), clamp(cur.current.y, -l.y, l.y), true);
      }
    })
    .runOnJS(true);

  const pan = Gesture.Pan()
    .enabled(zoomed)
    .onStart(() => {
      start.current = { ...cur.current };
    })
    .onUpdate((e) => {
      const l = limit(cur.current.s);
      apply(
        cur.current.s,
        clamp(start.current.x + e.translationX, -l.x, l.x),
        clamp(start.current.y + e.translationY, -l.y, l.y),
        false,
      );
    })
    .runOnJS(true);

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((_e, success) => {
      if (!success) return;
      if (cur.current.s > 1.01) apply(1, 0, 0, true);
      else apply(DOUBLE_TAP_SCALE, 0, 0, true);
    })
    .runOnJS(true);

  const singleTap = Gesture.Tap()
    .requireExternalGestureToFail(doubleTap)
    .onEnd((_e, success) => {
      if (success) onTap();
    })
    .runOnJS(true);

  const gesture = Gesture.Race(Gesture.Simultaneous(pinch, pan), Gesture.Exclusive(doubleTap, singleTap));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[
          styles.slide,
          { width, height },
          { transform: [{ translateX: tx }, { translateY: ty }, { scale }] },
        ]}
      >
        <AppImage
          uri={uri}
          style={{ width, height }}
          contentFit="contain"
          backgroundColor="transparent"
          priority="high"
          transition={0}
          accessibilityLabel={accessibilityLabel}
        />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  slide: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
