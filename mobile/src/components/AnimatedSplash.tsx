import { useEffect, useRef } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../theme';

const LOGO = require('../../assets/vivi-splash-logo.png');

const SUBTITLE = 'Handmade with Love';
const CHARS = SUBTITLE.split('');
const STITCH_GAP_MS = 28;
const STITCH_IN_MS = 70;
const AFTER_SUBTITLE_MS = 420;
const HEART_POP_MS = 200;
const HEART_HOLD_MS = 280;
const HEART_FLIGHT_MS = 2800;
const FADE_OUT_MS = 350;
const DARK_PINK = colors.pinkDark;
const HEART_RED = '#e0214a';

const LOGO_ASPECT = 807 / 948;

function logoSize(screenW: number, screenH: number, bottomPad: number) {
  const maxW = screenW - 32;
  const maxH = screenH - bottomPad - 120;
  let width = maxW;
  let height = width / LOGO_ASPECT;
  if (height > maxH) {
    height = maxH;
    width = height * LOGO_ASPECT;
  }
  return { width, height };
}

/** Small hearts that rise from the screen bottom after the subtitle. */
const HEARTS = [
  { xRatio: 0.1, size: 11, delay: 0, drift: -14 },
  { xRatio: 0.24, size: 9, delay: 80, drift: 10 },
  { xRatio: 0.38, size: 12, delay: 40, drift: -8 },
  { xRatio: 0.52, size: 10, delay: 120, drift: 12 },
  { xRatio: 0.66, size: 11, delay: 60, drift: -10 },
  { xRatio: 0.8, size: 9, delay: 100, drift: 8 },
  { xRatio: 0.18, size: 8, delay: 160, drift: 6 },
  { xRatio: 0.72, size: 10, delay: 140, drift: -12 },
] as const;

interface AnimatedSplashProps {
  /** Fired once the branded frame is painted (safe to hide the native splash). */
  onReady?: () => void;
  onFinish: () => void;
}

export function AnimatedSplash({ onReady, onFinish }: AnimatedSplashProps) {
  const insets = useSafeAreaInsets();
  const screen = Dimensions.get('window');
  const { width: logoW, height: logoH } = logoSize(
    screen.width,
    screen.height,
    insets.bottom + insets.top,
  );

  // Start visible so the handoff from the native splash never flashes blank white.
  const logoOpacity = useRef(new Animated.Value(1)).current;
  const screenOpacity = useRef(new Animated.Value(1)).current;
  const charAnims = useRef(
    CHARS.map(() => ({
      opacity: new Animated.Value(0),
      scale: new Animated.Value(0.2),
      y: new Animated.Value(14),
    })),
  ).current;
  const heartAnims = useRef(
    HEARTS.map(() => ({
      opacity: new Animated.Value(0),
      translateY: new Animated.Value(0),
      translateX: new Animated.Value(0),
      scale: new Animated.Value(0.5),
    })),
  ).current;

  useEffect(() => {
    // Let the first paint land with the logo already visible, then drop the native splash.
    const readyId = requestAnimationFrame(() => {
      onReady?.();
    });

    const onFinishRef = onFinish;
    const flightDistance = -(screen.height + 120);

    const stitchLetter = (index: number) => {
      const { opacity, scale, y } = charAnims[index];
      if (CHARS[index] === ' ') {
        return Animated.timing(opacity, {
          toValue: 1,
          duration: 24,
          useNativeDriver: true,
        });
      }

      return Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: STITCH_IN_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(y, {
            toValue: -4,
            duration: STITCH_IN_MS * 0.45,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(y, {
            toValue: 0,
            duration: STITCH_IN_MS * 0.55,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1.28,
            duration: STITCH_IN_MS * 0.45,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1,
            duration: STITCH_IN_MS * 0.55,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ]);
    };

    const stitchSteps: Animated.CompositeAnimation[] = [];
    CHARS.forEach((_, index) => {
      stitchSteps.push(stitchLetter(index));
      if (index < CHARS.length - 1) {
        stitchSteps.push(Animated.delay(STITCH_GAP_MS));
      }
    });

    // Appear at the very bottom, pause, then rise past the logo and fade out.
    const heartsFly = Animated.parallel(
      heartAnims.map((heart, index) => {
        const cfg = HEARTS[index];
        return Animated.sequence([
          Animated.delay(cfg.delay),
          Animated.parallel([
            Animated.timing(heart.opacity, {
              toValue: 1,
              duration: HEART_POP_MS,
              useNativeDriver: true,
            }),
            Animated.timing(heart.scale, {
              toValue: 1,
              duration: HEART_POP_MS,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
          ]),
          Animated.delay(HEART_HOLD_MS),
          Animated.parallel([
            Animated.timing(heart.translateY, {
              toValue: flightDistance,
              duration: HEART_FLIGHT_MS,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(heart.translateX, {
              toValue: cfg.drift,
              duration: HEART_FLIGHT_MS,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.sequence([
              Animated.delay(HEART_FLIGHT_MS * 0.65),
              Animated.timing(heart.opacity, {
                toValue: 0,
                duration: HEART_FLIGHT_MS * 0.35,
                easing: Easing.in(Easing.quad),
                useNativeDriver: true,
              }),
            ]),
          ]),
        ]);
      }),
    );

    const animation = Animated.sequence([
      Animated.delay(120),
      Animated.sequence(stitchSteps),
      Animated.delay(AFTER_SUBTITLE_MS),
      heartsFly,
      Animated.delay(80),
      Animated.timing(screenOpacity, {
        toValue: 0,
        duration: FADE_OUT_MS,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]);

    animation.start(({ finished }) => {
      if (finished) onFinishRef();
    });

    return () => {
      cancelAnimationFrame(readyId);
      animation.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View style={[styles.root, { opacity: screenOpacity }]}>
      <View
        style={[
          styles.center,
          {
            paddingTop: insets.top + 320,
            paddingBottom: Math.max(insets.bottom, 16) + 8,
          },
        ]}
      >
        <Animated.Image
          source={LOGO}
          style={[styles.logo, { width: logoW, height: logoH, opacity: logoOpacity }]}
          resizeMode="contain"
          accessible
          accessibilityLabel="VIVI Crochet"
        />

        <View style={styles.subtitleBlock} accessible accessibilityLabel={SUBTITLE}>
          <View style={styles.subtitleRow}>
            {CHARS.map((char, index) => (
              <View key={`${char}-${index}`} style={styles.charSlot}>
                <Animated.Text
                  style={[
                    styles.subtitleChar,
                    {
                      opacity: charAnims[index].opacity,
                      transform: [
                        { translateY: charAnims[index].y },
                        { scale: charAnims[index].scale },
                      ],
                    },
                  ]}
                >
                  {char === ' ' ? '\u00A0' : char}
                </Animated.Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Absolute bottom layer — hearts start here, then fly upward. */}
      <View style={styles.heartsLayer} pointerEvents="none">
        {HEARTS.map((heart, index) => (
          <Animated.View
            key={`heart-${index}`}
            style={[
              styles.heartWrap,
              {
                left: screen.width * heart.xRatio,
                bottom: Math.max(insets.bottom, 8) + 20,
                opacity: heartAnims[index].opacity,
                transform: [
                  { translateY: heartAnims[index].translateY },
                  { translateX: heartAnims[index].translateX },
                  { scale: heartAnims[index].scale },
                ],
              },
            ]}
          >
            <Text style={[styles.heart, { fontSize: heart.size }]}>♥</Text>
          </Animated.View>
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#ffffff',
    zIndex: 100,
  },
  heartsLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    elevation: 20,
  },
  heartWrap: {
    position: 'absolute',
  },
  heart: {
    color: HEART_RED,
    fontWeight: '700',
    textShadowColor: 'rgba(224, 33, 74, 0.25)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  logo: {},
  subtitleBlock: {
    marginTop: 16,
    alignItems: 'center',
    minHeight: 42,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    flexWrap: 'nowrap',
  },
  charSlot: {
    minWidth: 8,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  subtitleChar: {
    fontFamily: fonts.heading,
    fontSize: 26,
    letterSpacing: 0.4,
    color: DARK_PINK,
  },
});
