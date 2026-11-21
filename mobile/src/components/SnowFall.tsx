import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

// Fixed set, so every render looks the same: position, size, speed, start delay and sideways drift.
const FLAKES = Array.from({ length: 18 }, (_, i) => ({
  left: `${(i * 37 + 6) % 94}%` as `${number}%`,
  size: 3 + (i % 3) * 1.5,
  duration: 5000 + (i % 5) * 1100,
  delay: (i * 430) % 4000,
  drift: i % 2 ? 10 : -10,
  opacity: 0.55 + (i % 4) * 0.12,
}));

function Flake({ flake, height }: { flake: (typeof FLAKES)[number]; height: number }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: flake.duration,
        delay: flake.delay,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress, flake]);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: 0,
        left: flake.left,
        width: flake.size,
        height: flake.size,
        borderRadius: flake.size / 2,
        backgroundColor: '#ffffff',
        opacity: flake.opacity,
        transform: [
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-10, height + 10] }) },
          { translateX: progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, flake.drift, 0] }) },
        ],
      }}
    />
  );
}

/** Soft white snow drifting down over whatever it is laid on; the parent should clip (overflow hidden). */
export function SnowFall() {
  const [height, setHeight] = useState(0);
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
    >
      {height > 0 ? FLAKES.map((f, i) => <Flake key={i} flake={f} height={height} />) : null}
    </View>
  );
}
