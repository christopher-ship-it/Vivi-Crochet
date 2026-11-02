import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';

const SPARKLES = [
  { top: 14, right: 96, size: 15, delay: 0 },
  { top: 58, right: 22, size: 11, delay: 700 },
  { top: 92, right: 118, size: 13, delay: 1300 },
  { top: 30, left: '46%' as const, size: 10, delay: 1900 },
];

/**
 * Moving light for the offer head: two drifting glows, a slow shimmer sweep and twinkling sparkles.
 * Everything is a transform or opacity (native driver) and stops when the OS asks for reduced motion.
 * Sits behind the head's text; it never takes touches.
 */
export function OfferHeadEffects() {
  const [reduceMotion, setReduceMotion] = useState(false);
  const drift = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  const twinkles = useRef(SPARKLES.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (!cancelled) setReduceMotion(Boolean(reduce));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) return undefined;
    const loops: Animated.CompositeAnimation[] = [];

    loops.push(
      Animated.loop(
        Animated.sequence([
          Animated.timing(drift, { toValue: 1, duration: 4200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(drift, { toValue: 0, duration: 4200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ),
    );
    loops.push(
      Animated.loop(
        Animated.sequence([
          Animated.delay(900),
          Animated.timing(sweep, { toValue: 1, duration: 1700, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
          Animated.delay(2600),
          Animated.timing(sweep, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      ),
    );
    twinkles.forEach((value, i) => {
      loops.push(
        Animated.loop(
          Animated.sequence([
            Animated.delay(SPARKLES[i].delay),
            Animated.timing(value, { toValue: 1, duration: 650, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(value, { toValue: 0, duration: 900, easing: Easing.in(Easing.quad), useNativeDriver: true }),
            Animated.delay(1400),
          ]),
        ),
      );
    });
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [reduceMotion, drift, sweep, twinkles]);

  const orbA = {
    transform: [
      { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -26] }) },
      { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, 14] }) },
    ],
  };
  const orbB = {
    transform: [
      { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, 22] }) },
      { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -12] }) },
    ],
  };
  const shimmer = {
    opacity: sweep.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 1, 1, 0] }),
    transform: [
      { translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-160, 420] }) },
      { rotate: '18deg' },
    ],
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[styles.orbA, orbA]} />
      <Animated.View style={[styles.orbB, orbB]} />
      {reduceMotion ? null : (
        <Animated.View style={[styles.shimmer, shimmer]}>
          <LinearGradient
            colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.28)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}
      {SPARKLES.map((s, i) => (
        <Animated.View
          key={i}
          style={[
            styles.sparkle,
            { top: s.top, right: 'right' in s ? s.right : undefined, left: 'left' in s ? s.left : undefined },
            reduceMotion
              ? { opacity: 0.7 }
              : {
                  opacity: twinkles[i].interpolate({ inputRange: [0, 1], outputRange: [0.15, 1] }),
                  transform: [{ scale: twinkles[i].interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.15] }) }],
                },
          ]}
        >
          <Ionicons name="sparkles" size={s.size} color="#fff1b8" />
        </Animated.View>
      ))}
      <LinearGradient
        colors={['rgba(255, 226, 140, 0)', 'rgba(255, 226, 140, 0.9)', 'rgba(255, 226, 140, 0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.goldLine}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  orbA: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    right: -50,
    top: -70,
    backgroundColor: 'rgba(255, 214, 120, 0.2)',
  },
  orbB: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    left: -40,
    bottom: -60,
    backgroundColor: 'rgba(255, 140, 190, 0.28)',
  },
  shimmer: {
    position: 'absolute',
    top: -20,
    bottom: -20,
    width: 90,
  },
  sparkle: {
    position: 'absolute',
  },
  goldLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
  },
});
