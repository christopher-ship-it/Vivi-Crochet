import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Dimensions,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { ClipPath, Circle, Defs, G, Line, Path } from 'react-native-svg';
import { colors, fonts } from '../theme';

const LOGO = require('../../assets/vivi-splash-logo.png');
const LOGO_ASPECT = 807 / 948;
const SUBTITLE = 'Handmade with Love';

/** Must match the native splash backgroundColor in app.config.js so the handoff is seamless. */
export const SPLASH_STAGE_COLOR = '#ffd0e0';
const REVEAL_COLOR = '#fffaf7';
const THREAD = colors.pink;

const BALL = 44;
const HEART_W = 132;
const HEART_SCALE = HEART_W / 100;
/** Heart outline drawn in a 100×92 box; its tip sits at (50, 86). */
const HEART_D =
  'M50 86 C 20 64, 4 46, 10 26 C 16 8, 40 6, 50 26 C 60 6, 84 8, 90 26 C 96 46, 80 64, 50 86 Z';
const HEART_LEN = 300;
const PARTICLES = 14;

// Timeline (ms)
const T_ROLL = 950;
const T_HEART_AT = 950;
const T_HEART = 550;
const T_FILL_AT = 1450;
const T_BEAT_AT = 1600;
const T_BURST_AT = 1600;
const T_REVEAL_AT = 1850;
const T_LOGO_AT = 2100;
const T_SHEEN_AT = 2600;
const T_TAG_AT = 2800;
const T_EXIT_AT = 3900;
const T_EXIT = 450;

const AnimatedPath = Animated.createAnimatedComponent(Path);

function at(delay: number, animation: Animated.CompositeAnimation) {
  return Animated.sequence([Animated.delay(delay), animation]);
}

interface AnimatedSplashProps {
  /** Fired once the branded frame is painted (safe to hide the native splash). */
  onReady?: () => void;
  onFinish: () => void;
}

export function AnimatedSplash({ onReady, onFinish }: AnimatedSplashProps) {
  const { width: W, height: H } = Dimensions.get('window');

  const geo = useMemo(() => {
    const cx = W / 2;
    const cy = H * 0.44;
    const ballY = cy + 70;
    const heartTop = ballY - 86 * HEART_SCALE;
    const heartCenterY = heartTop + 46 * HEART_SCALE;
    const trailD = `M -20 ${ballY} C ${W * 0.15} ${ballY - 18}, ${W * 0.3} ${ballY + 14}, ${cx} ${ballY}`;
    const trailLen = (cx + 20) * 1.08;
    const revealD = 2 * Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));
    const logoW = Math.min(W * 0.72, 300);
    const logoH = logoW / LOGO_ASPECT;
    return { cx, cy, ballY, heartTop, heartCenterY, trailD, trailLen, revealD, logoW, logoH };
  }, [W, H]);

  const v = useRef({
    ballX: new Animated.Value(0),
    ballBounce: new Animated.Value(0),
    ballOut: new Animated.Value(1),
    trail: new Animated.Value(geo.trailLen),
    trailOpacity: new Animated.Value(1),
    heart: new Animated.Value(HEART_LEN),
    heartFill: new Animated.Value(0),
    heartBeat: new Animated.Value(1),
    burst: new Animated.Value(0),
    reveal: new Animated.Value(0.001),
    logoIn: new Animated.Value(0),
    sheen: new Animated.Value(0),
    tag: new Animated.Value(0),
    exit: new Animated.Value(0),
  }).current;

  const particles = useMemo(
    () =>
      Array.from({ length: PARTICLES }, (_, i) => {
        const angle = (i / PARTICLES) * Math.PI * 2;
        const radius = 80 + (i % 3) * 26;
        return {
          dx: Math.cos(angle) * radius,
          dy: Math.sin(angle) * radius,
          size: 10 + (i % 3) * 4,
        };
      }),
    [],
  );

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
    const js = { useNativeDriver: false } as const;

    const full = Animated.parallel([
      // 1. Yarn ball rolls in with a bounce, trailing thread.
      Animated.timing(v.ballX, {
        toValue: 1,
        duration: T_ROLL,
        easing: Easing.bezier(0.3, 0.7, 0.4, 1),
        ...native,
      }),
      Animated.sequence([
        Animated.timing(v.ballBounce, { toValue: -22, duration: 330, easing: Easing.out(Easing.quad), ...native }),
        Animated.timing(v.ballBounce, { toValue: 0, duration: 300, easing: Easing.in(Easing.quad), ...native }),
        Animated.timing(v.ballBounce, { toValue: -8, duration: 150, easing: Easing.out(Easing.quad), ...native }),
        Animated.timing(v.ballBounce, { toValue: 0, duration: 150, easing: Easing.in(Easing.quad), ...native }),
      ]),
      Animated.timing(v.trail, {
        toValue: 0,
        duration: T_ROLL,
        easing: Easing.bezier(0.3, 0.7, 0.4, 1),
        ...js,
      }),
      at(1050, Animated.timing(v.ballOut, { toValue: 0, duration: 250, easing: Easing.in(Easing.quad), ...native })),
      at(1550, Animated.timing(v.trailOpacity, { toValue: 0, duration: 300, ...js })),

      // 2. Thread stitches a heart, which fills and beats.
      at(
        T_HEART_AT,
        Animated.timing(v.heart, {
          toValue: 0,
          duration: T_HEART,
          easing: Easing.bezier(0.65, 0, 0.35, 1),
          ...js,
        }),
      ),
      at(T_FILL_AT, Animated.timing(v.heartFill, { toValue: 1, duration: 250, ...native })),
      at(
        T_BEAT_AT,
        Animated.sequence([
          Animated.timing(v.heartBeat, { toValue: 1.18, duration: 170, easing: Easing.out(Easing.quad), ...native }),
          Animated.timing(v.heartBeat, { toValue: 1, duration: 180, easing: Easing.inOut(Easing.quad), ...native }),
        ]),
      ),

      // 3. Heart bursts into little hearts.
      at(
        T_BURST_AT,
        Animated.timing(v.burst, {
          toValue: 1,
          duration: 700,
          easing: Easing.bezier(0.2, 0.8, 0.3, 1),
          ...native,
        }),
      ),

      // 4. Circle reveal onto the logo stage.
      at(
        T_REVEAL_AT,
        Animated.timing(v.reveal, {
          toValue: 1,
          duration: 650,
          easing: Easing.bezier(0.7, 0, 0.3, 1),
          ...native,
        }),
      ),
      at(T_LOGO_AT, Animated.spring(v.logoIn, { toValue: 1, friction: 6, tension: 60, ...native })),
      at(
        T_SHEEN_AT,
        Animated.timing(v.sheen, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), ...native }),
      ),
      at(
        T_TAG_AT,
        Animated.timing(v.tag, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), ...native }),
      ),

      // 5. Gentle zoom + fade into the app.
      at(
        T_EXIT_AT,
        Animated.timing(v.exit, { toValue: 1, duration: T_EXIT, easing: Easing.in(Easing.quad), ...native }),
      ),
    ]);

    // Reduced motion: skip the story, show the logo briefly, then continue.
    const reduced = Animated.sequence([
      Animated.parallel([
        Animated.timing(v.ballOut, { toValue: 0, duration: 1, ...native }),
        Animated.timing(v.trailOpacity, { toValue: 0, duration: 1, ...js }),
        Animated.timing(v.reveal, { toValue: 1, duration: 1, ...native }),
        Animated.timing(v.logoIn, { toValue: 1, duration: 300, ...native }),
        Animated.timing(v.tag, { toValue: 1, duration: 300, ...native }),
      ]),
      Animated.delay(700),
      Animated.timing(v.exit, { toValue: 1, duration: 300, ...native }),
    ]);

    const start = (reduce: boolean) => {
      if (cancelled || running) return;
      running = reduce ? reduced : full;
      running.start(({ finished }) => {
        if (finished) finish();
      });
    };

    // Some OEM Androids never settle AccessibilityInfo — don't gate the whole splash on it.
    const reduceMotion = Promise.race([
      AccessibilityInfo.isReduceMotionEnabled().catch(() => false),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 150)),
    ]);

    void reduceMotion.then(start);

    // Hard cap: never leave users on the blush stage if animation/a11y stalls.
    const failsafeId = setTimeout(finish, T_EXIT_AT + T_EXIT + 1500);

    return () => {
      cancelled = true;
      cancelAnimationFrame(readyId);
      clearTimeout(failsafeId);
      running?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { cx, cy, ballY, heartTop, heartCenterY, trailD, trailLen, revealD, logoW, logoH } = geo;

  const ballTranslateX = v.ballX.interpolate({ inputRange: [0, 1], outputRange: [-60, cx] });
  const ballRotate = v.ballX.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '760deg'] });
  const logoScale = Animated.multiply(
    v.logoIn.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }),
    v.exit.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }),
  );
  const sheenX = v.sheen.interpolate({ inputRange: [0, 1], outputRange: [-140, logoW + 140] });

  return (
    <Animated.View
      style={[
        styles.root,
        { opacity: v.exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) },
      ]}
      accessible
      accessibilityLabel={`VIVI Crochet. ${SUBTITLE}`}
    >
      {/* Thread trail + stitched heart outline */}
      <Svg width={W} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
        <AnimatedPath
          d={trailD}
          stroke={THREAD}
          strokeWidth={2.5}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={[trailLen, trailLen]}
          strokeDashoffset={v.trail}
          opacity={v.trailOpacity}
        />
      </Svg>

      <View
        style={[styles.abs, { left: cx - HEART_W / 2, top: heartTop, width: HEART_W, height: 92 * HEART_SCALE }]}
        pointerEvents="none"
      >
        <Svg width="100%" height="100%" viewBox="0 0 100 92">
          <AnimatedPath
            d={HEART_D}
            stroke={THREAD}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray={[HEART_LEN, HEART_LEN]}
            strokeDashoffset={v.heart}
          />
        </Svg>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { opacity: v.heartFill, transform: [{ scale: v.heartBeat }] },
          ]}
        >
          <Svg width="100%" height="100%" viewBox="0 0 100 92">
            <Path d={HEART_D} fill={THREAD} />
          </Svg>
        </Animated.View>
      </View>

      {/* Little hearts bursting outward */}
      {particles.map((p, i) => (
        <Animated.Text
          key={`p-${i}`}
          style={[
            styles.particle,
            {
              left: cx - p.size / 2,
              top: heartCenterY - p.size / 2,
              fontSize: p.size,
              opacity: v.burst.interpolate({ inputRange: [0, 0.05, 0.7, 1], outputRange: [0, 1, 0.8, 0] }),
              transform: [
                { translateX: v.burst.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] }) },
                { translateY: v.burst.interpolate({ inputRange: [0, 1], outputRange: [0, p.dy] }) },
                { scale: v.burst.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.2] }) },
              ],
            },
          ]}
        >
          ♥
        </Animated.Text>
      ))}

      {/* Rolling yarn ball */}
      <Animated.View
        style={[
          styles.abs,
          {
            left: 0,
            top: ballY - BALL / 2,
            width: BALL,
            height: BALL,
            marginLeft: -BALL / 2,
            opacity: v.ballOut,
            transform: [
              { translateX: ballTranslateX },
              { translateY: v.ballBounce },
              { rotate: ballRotate },
              { scale: v.ballOut },
            ],
          },
        ]}
        pointerEvents="none"
      >
        <Svg width={BALL} height={BALL} viewBox="0 0 44 44">
          <Defs>
            <ClipPath id="yarnClip">
              <Circle cx={22} cy={22} r={21} />
            </ClipPath>
          </Defs>
          <Circle cx={22} cy={22} r={21} fill={THREAD} />
          <G clipPath="url(#yarnClip)" stroke="#ff7ea2" strokeWidth={3}>
            {[-24, -15, -6, 3, 12, 21, 30].map((o) => (
              <Line key={o} x1={o} y1={44} x2={o + 30} y2={0} />
            ))}
          </G>
          <Circle cx={22} cy={22} r={21} fill="none" stroke={colors.pinkDark} strokeWidth={1.5} />
        </Svg>
      </Animated.View>

      {/* Circle reveal */}
      <Animated.View
        style={[
          styles.reveal,
          {
            width: revealD,
            height: revealD,
            borderRadius: revealD / 2,
            left: cx - revealD / 2,
            top: cy - revealD / 2,
            transform: [{ scale: v.reveal }],
          },
        ]}
        pointerEvents="none"
      />

      {/* Logo + sheen + tagline */}
      <Animated.View
        style={[
          styles.abs,
          {
            left: cx - logoW / 2,
            top: cy - logoH / 2,
            width: logoW,
            height: logoH,
            opacity: v.logoIn.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
            transform: [{ scale: logoScale }],
          },
        ]}
        pointerEvents="none"
      >
        <Animated.Image source={LOGO} style={{ width: logoW, height: logoH }} resizeMode="contain" />
        <View style={styles.sheenClip}>
          <Animated.View style={[styles.sheen, { height: logoH * 1.4, transform: [{ translateX: sheenX }, { rotate: '15deg' }] }]}>
            <LinearGradient
              colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </View>
      </Animated.View>

      <Animated.View
        style={[
          styles.tagWrap,
          {
            top: cy + logoH / 2 + 18,
            opacity: v.tag,
            transform: [
              { translateY: v.tag.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
            ],
          },
        ]}
        pointerEvents="none"
      >
        <Text style={styles.tag}>{SUBTITLE}</Text>
      </Animated.View>
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
  abs: {
    position: 'absolute',
  },
  particle: {
    position: 'absolute',
    color: THREAD,
    fontWeight: '700',
  },
  reveal: {
    position: 'absolute',
    backgroundColor: REVEAL_COLOR,
  },
  sheenClip: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
  },
  sheen: {
    position: 'absolute',
    top: '-20%',
    left: 0,
    width: 70,
  },
  tagWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  tag: {
    fontFamily: fonts.heading,
    fontSize: 24,
    letterSpacing: 0.4,
    color: colors.pinkDark,
  },
});
