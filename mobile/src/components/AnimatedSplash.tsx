import { useEffect, useRef } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../theme';

const LOGO = require('../../assets/vivi-splash-logo.png');

const SUBTITLE = 'Handmade with Love';
const CHARS = SUBTITLE.split('');
const FADE_IN_MS = 450;
const STITCH_GAP_MS = 28;
const STITCH_IN_MS = 70;
const HEART_FLIGHT_MS = 3500;
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

const HEARTS = [
  { xRatio: 0.08, size: 28, delay: 0, drift: -22 },
  { xRatio: 0.22, size: 20, delay: 50, drift: 14 },
  { xRatio: 0.38, size: 32, delay: 25, drift: -10 },
  { xRatio: 0.52, size: 22, delay: 70, drift: 18 },
  { xRatio: 0.66, size: 26, delay: 40, drift: -16 },
  { xRatio: 0.78, size: 18, delay: 90, drift: 12 },
  { xRatio: 0.14, size: 16, delay: 110, drift: 8 },
  { xRatio: 0.88, size: 24, delay: 60, drift: -20 },
  { xRatio: 0.44, size: 14, delay: 100, drift: 6 },
  { xRatio: 0.72, size: 19, delay: 120, drift: -12 },
] as const;

interface AnimatedSplashProps {
  onFinish: () => void;
}

export function AnimatedSplash({ onFinish }: AnimatedSplashProps) {
  const insets = useSafeAreaInsets();
  const screen = Dimensions.get('window');
  const { width: logoW, height: logoH } = logoSize(
    screen.width,
    screen.height,
    insets.bottom + insets.top,
  );

  const logoOpacity = useRef(new Animated.Value(0)).current;
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

    const heartsFly = Animated.parallel(
      heartAnims.map((heart, index) => {
        const cfg = HEARTS[index];
        return Animated.sequence([
          Animated.delay(cfg.delay),
          // Pop in at bottom
          Animated.parallel([
            Animated.timing(heart.opacity, {
              toValue: 1,
              duration: 180,
              useNativeDriver: true,
            }),
            Animated.timing(heart.scale, {
              toValue: 1,
              duration: 220,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
          ]),
          // Fly to top (keep fully visible most of the way)
          Animated.parallel([
            Animated.timing(heart.translateY, {
              toValue: flightDistance,
              duration: HEART_FLIGHT_MS,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(heart.translateX, {
              toValue: cfg.drift,
              duration: HEART_FLIGHT_MS,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.sequence([
              Animated.delay(HEART_FLIGHT_MS * 0.72),
              Animated.timing(heart.opacity, {
                toValue: 0,
                duration: HEART_FLIGHT_MS * 0.28,
                easing: Easing.in(Easing.quad),
                useNativeDriver: true,
              }),
            ]),
          ]),
        ]);
      }),
    );

    const animation = Animated.sequence([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: FADE_IN_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.delay(120),
      Animated.sequence(stitchSteps),
      Animated.delay(100),
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

    return () => animation.stop();
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

      {/* Render last so hearts always paint above the logo. */}
      <View style={styles.heartsLayer} pointerEvents="none">
        {HEARTS.map((heart, index) => (
          <Animated.View
            key={`heart-${index}`}
            style={[
              styles.heartWrap,
              {
                left: screen.width * heart.xRatio,
                bottom: 12 + insets.bottom,
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
    textShadowColor: 'rgba(224, 33, 74, 0.35)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
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
    minHeight: 36,
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
    fontFamily: fonts.extraBold,
    fontSize: 17,
    letterSpacing: 1.2,
    color: DARK_PINK,
  },
});
