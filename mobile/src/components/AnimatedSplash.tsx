import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Dimensions,
  Easing,
  StyleSheet,
  View,
} from 'react-native';
import { colors, fonts } from '../theme';

const LOGO = require('../../assets/vivi-splash-logo.png');
const LOGO_ASPECT = 807 / 948;
const SUBTITLE = 'Handmade with Love';

/** Must match the native splash backgroundColor in app.config.js so the handoff is seamless. */
export const SPLASH_STAGE_COLOR = '#ffd0e0';

const BALL = 52;
const THREAD_DOT = 4;
/** Height of the wool's waves and how many half-waves it makes across the screen. */
const WAVE_AMP = 30;
const WAVE_HALF_CYCLES = 3;
/** Spacing of the dots that make up the wool line. */
const DOT_STEP = 3;
const PATH_STEPS = 32;

/** Vertical offset of the wool at horizontal position `x` (0 outside the screen run). */
function waveOffset(x: number, run: number): number {
  const u = Math.min(1, Math.max(0, x / run));
  return WAVE_AMP * Math.sin(Math.PI * WAVE_HALF_CYCLES * u);
}

// Timeline (ms)
const T_ROLL = 1300;
const T_BALL_OUT_AT = 1250;
const T_BALL_OUT = 300;
const T_LOGO_AT = 1350;
const T_LOGO = 900;
const T_TAG_AT = 2100;
const T_TAG = 600;
const T_EXIT_AT = 3400;
const T_EXIT = 450;
/** Never stay on the blush stage longer than this, whatever the animation does. */
const FAILSAFE_MS = 5200;

interface AnimatedSplashProps {
  /** Fired once the branded frame is painted (safe to hide the native splash). */
  onReady?: () => void;
  onFinish: () => void;
}

/**
 * Rolling-wool splash: a ball of yarn rolls across the screen along a curved path, leaving a
 * wavy wool thread behind it, then the logo fades in. Built from plain Views (no SVG) and
 * native-driver animations only, so it behaves the same in release builds as in development.
 */
export function AnimatedSplash({ onReady, onFinish }: AnimatedSplashProps) {
  const { width: W, height: H } = Dimensions.get('window');

  const geo = useMemo(() => {
    const cx = W / 2;
    const rollY = H * 0.5;
    const logoW = Math.min(W * 0.7, 300);
    const logoH = logoW / LOGO_ASPECT;
    const glow = Math.max(W, H) * 1.1;

    // The ball's centre runs from just off-screen to the middle; `p` (0..1) is progress.
    const x0 = -BALL / 2;
    const run = cx;
    const xAt = (p: number) => x0 + (cx - x0) * p;

    // Wool: tiny dots along the wave, each shown once the ball has passed it.
    const dots: { x: number; y: number; p: number }[] = [];
    for (let x = 0; x <= cx; x += DOT_STEP) {
      dots.push({ x, y: rollY + waveOffset(x, run), p: (x - x0) / (cx - x0) });
    }

    // The ball follows the same wave.
    const pathP: number[] = [];
    const pathY: number[] = [];
    for (let k = 0; k <= PATH_STEPS; k += 1) {
      const p = k / PATH_STEPS;
      pathP.push(p);
      pathY.push(waveOffset(xAt(p), run));
    }
    return { cx, rollY, logoW, logoH, glow, dots, pathP, pathY };
  }, [W, H]);

  const v = useRef({
    roll: new Animated.Value(0),
    ballOut: new Animated.Value(0),
    logoIn: new Animated.Value(0),
    tag: new Animated.Value(0),
    exit: new Animated.Value(0),
  }).current;

  useEffect(() => {
    const readyId = requestAnimationFrame(() => onReady?.());
    let running: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    let finishedOnce = false;

    const finish = () => {
      if (cancelled || finishedOnce) return;
      finishedOnce = true;
      onFinish();
    };

    const native = { useNativeDriver: true } as const;
    const at = (delay: number, animation: Animated.CompositeAnimation) =>
      Animated.sequence([Animated.delay(delay), animation]);

    const full = Animated.parallel([
      // 1. The yarn ball rolls in from the left along the wave, trailing its wool.
      Animated.timing(v.roll, {
        toValue: 1,
        duration: T_ROLL,
        easing: Easing.bezier(0.3, 0.6, 0.35, 1),
        ...native,
      }),
      // 2. The ball shrinks away as it reaches the middle.
      at(
        T_BALL_OUT_AT,
        Animated.timing(v.ballOut, {
          toValue: 1,
          duration: T_BALL_OUT,
          easing: Easing.in(Easing.quad),
          ...native,
        }),
      ),
      // 3. The logo blooms in over a soft glow.
      at(
        T_LOGO_AT,
        Animated.timing(v.logoIn, {
          toValue: 1,
          duration: T_LOGO,
          easing: Easing.out(Easing.cubic),
          ...native,
        }),
      ),
      // 4. The tagline rises in.
      at(
        T_TAG_AT,
        Animated.timing(v.tag, {
          toValue: 1,
          duration: T_TAG,
          easing: Easing.out(Easing.cubic),
          ...native,
        }),
      ),
      // 5. Hold, then a gentle push-in and fade into the app.
      at(
        T_EXIT_AT,
        Animated.timing(v.exit, {
          toValue: 1,
          duration: T_EXIT,
          easing: Easing.in(Easing.quad),
          ...native,
        }),
      ),
    ]);

    // Reduced motion: skip the roll, just show the logo, then continue.
    const reduced = Animated.sequence([
      Animated.parallel([
        Animated.timing(v.logoIn, { toValue: 1, duration: 250, ...native }),
        Animated.timing(v.tag, { toValue: 1, duration: 250, ...native }),
      ]),
      Animated.delay(800),
      Animated.timing(v.exit, { toValue: 1, duration: 250, ...native }),
    ]);

    const start = (reduce: boolean) => {
      if (cancelled || running) return;
      running = reduce ? reduced : full;
      running.start(({ finished }) => {
        if (finished) finish();
      });
    };

    // Some OEM Androids never settle AccessibilityInfo — don't gate the splash on it.
    const reduceMotion = Promise.race([
      AccessibilityInfo.isReduceMotionEnabled().catch(() => false),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 150)),
    ]);
    void reduceMotion.then(start);

    const failsafeId = setTimeout(finish, FAILSAFE_MS);

    return () => {
      cancelled = true;
      cancelAnimationFrame(readyId);
      clearTimeout(failsafeId);
      running?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { cx, rollY, logoW, logoH, glow, dots, pathP, pathY } = geo;

  // The ball's centre travels from just off-screen to the middle; it turns as it goes.
  const ballX = v.roll.interpolate({ inputRange: [0, 1], outputRange: [-BALL, cx - BALL / 2] });
  const ballTurn = v.roll.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '700deg'] });
  const ballBounce = v.roll.interpolate({ inputRange: pathP, outputRange: pathY });
  const ballScale = v.ballOut.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const ballOpacity = v.ballOut.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const threadOpacity = v.logoIn.interpolate({
    inputRange: [0, 0.5],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const logoOpacity = v.logoIn.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 1] });
  const logoScale = Animated.multiply(
    v.logoIn.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }),
    v.exit.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] }),
  );
  const glowOpacity = v.logoIn.interpolate({ inputRange: [0, 1], outputRange: [0, 0.9] });
  const glowScale = v.logoIn.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  const tagY = v.tag.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });
  const rootOpacity = v.exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <Animated.View
      style={[styles.root, { opacity: rootOpacity }]}
      accessible
      accessibilityLabel={`VIVI Crochet. ${SUBTITLE}`}
    >
      {/* Soft light behind the logo. */}
      <Animated.View
        style={[
          styles.glow,
          {
            width: glow,
            height: glow,
            borderRadius: glow / 2,
            left: cx - glow / 2,
            top: H * 0.42 - glow / 2,
            opacity: glowOpacity,
            transform: [{ scale: glowScale }],
          },
        ]}
        pointerEvents="none"
      >
        <LinearGradient
          colors={['rgba(255, 250, 247, 0.95)', 'rgba(255, 233, 240, 0.55)', 'rgba(255, 208, 224, 0)']}
          locations={[0, 0.45, 1]}
          start={{ x: 0.5, y: 0.5 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Wool trailing the ball along a curved path; fades out as the logo appears. */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: threadOpacity }]} pointerEvents="none">
        {dots.map((dot, i) => (
          <Animated.View
            key={i}
            style={[
              styles.thread,
              {
                left: dot.x - THREAD_DOT / 2,
                top: dot.y - THREAD_DOT / 2,
                opacity: v.roll.interpolate({
                  inputRange: [Math.max(0, dot.p - 0.002), Math.min(1, dot.p + 0.002)],
                  outputRange: [0, 1],
                  extrapolate: 'clamp',
                }),
              },
            ]}
          />
        ))}
      </Animated.View>

      {/* Rolling yarn ball. */}
      <Animated.View
        style={[
          styles.ballWrap,
          {
            top: rollY - BALL / 2,
            opacity: ballOpacity,
            transform: [{ translateX: ballX }, { translateY: ballBounce }, { scale: ballScale }],
          },
        ]}
        pointerEvents="none"
      >
        <Animated.View style={[styles.ball, { transform: [{ rotate: ballTurn }] }]}>
          <View style={[styles.stripe, { top: 8 }]} />
          <View style={[styles.stripe, { top: 20 }]} />
          <View style={[styles.stripe, { top: 32 }]} />
          <View style={[styles.stripe, { top: 44 }]} />
        </Animated.View>
      </Animated.View>

      <View style={styles.center} pointerEvents="none">
        <Animated.Image
          source={LOGO}
          style={{
            width: logoW,
            height: logoH,
            opacity: logoOpacity,
            transform: [{ scale: logoScale }],
          }}
          resizeMode="contain"
        />
        <Animated.Text style={[styles.tag, { opacity: v.tag, transform: [{ translateY: tagY }] }]}>
          {SUBTITLE}
        </Animated.Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: SPLASH_STAGE_COLOR,
    zIndex: 100,
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
  },
  thread: {
    position: 'absolute',
    width: THREAD_DOT,
    height: THREAD_DOT,
    borderRadius: THREAD_DOT / 2,
    backgroundColor: colors.pink,
  },
  ballWrap: {
    position: 'absolute',
    left: 0,
    width: BALL,
    height: BALL,
  },
  ball: {
    width: BALL,
    height: BALL,
    borderRadius: BALL / 2,
    backgroundColor: colors.pink,
    borderWidth: 1.5,
    borderColor: colors.pinkDark,
    overflow: 'hidden',
  },
  stripe: {
    position: 'absolute',
    left: -14,
    width: BALL + 28,
    height: 4,
    backgroundColor: '#ff86a8',
    transform: [{ rotate: '-32deg' }],
  },
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 56,
  },
  tag: {
    marginTop: 22,
    fontFamily: fonts.heading,
    fontSize: 24,
    letterSpacing: 0.4,
    color: colors.pinkDark,
  },
});
