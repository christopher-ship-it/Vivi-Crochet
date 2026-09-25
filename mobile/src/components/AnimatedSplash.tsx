import { useEffect, useRef } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../theme';

const LOGO = require('../../assets/vivi-splash-logo.png');

/** Must match the native splash backgroundColor in app.config.js. */
export const SPLASH_STAGE_COLOR = '#ffd0e0';

const SUBTITLE = 'Handmade with Love';
const LOGO_ASPECT = 807 / 948;
const HOLD_MS = 1600;
const FADE_MS = 350;
/** Never stay on blush longer than this, even if animation/a11y stalls. */
const FAILSAFE_MS = 3500;

interface AnimatedSplashProps {
  /** Fired once the branded frame is painted (safe to hide the native splash). */
  onReady?: () => void;
  onFinish: () => void;
}

/**
 * Release-safe splash: logo + tagline only (no SVG).
 * Prior yarn/SVG splash could hang or crash on some production devices.
 */
export function AnimatedSplash({ onReady, onFinish }: AnimatedSplashProps) {
  const insets = useSafeAreaInsets();
  const screen = Dimensions.get('window');
  const maxW = Math.min(screen.width - 32, 300);
  const logoW = maxW;
  const logoH = logoW / LOGO_ASPECT;

  const opacity = useRef(new Animated.Value(1)).current;
  const logoScale = useRef(new Animated.Value(0.94)).current;
  const tagOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let finishedOnce = false;
    const finish = () => {
      if (finishedOnce) return;
      finishedOnce = true;
      onFinish();
    };

    // First paint has the logo — drop native splash immediately.
    const readyId = requestAnimationFrame(() => onReady?.());

    const anim = Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, friction: 7, tension: 70, useNativeDriver: true }),
        Animated.timing(tagOpacity, {
          toValue: 1,
          duration: 400,
          delay: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(HOLD_MS),
      Animated.timing(opacity, {
        toValue: 0,
        duration: FADE_MS,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]);

    anim.start(({ finished }) => {
      if (finished) finish();
    });

    const failsafeId = setTimeout(finish, FAILSAFE_MS);

    return () => {
      cancelAnimationFrame(readyId);
      clearTimeout(failsafeId);
      anim.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View
      style={[styles.root, { opacity }]}
      accessible
      accessibilityLabel={`VIVI Crochet. ${SUBTITLE}`}
    >
      <View
        style={[
          styles.center,
          {
            paddingTop: insets.top + 48,
            paddingBottom: Math.max(insets.bottom, 16) + 24,
          },
        ]}
      >
        <Animated.Image
          source={LOGO}
          style={{
            width: logoW,
            height: logoH,
            transform: [{ scale: logoScale }],
          }}
          resizeMode="contain"
        />
        <Animated.Text style={[styles.tag, { opacity: tagOpacity }]}>{SUBTITLE}</Animated.Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: SPLASH_STAGE_COLOR,
    zIndex: 100,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  tag: {
    marginTop: 18,
    fontFamily: fonts.heading,
    fontSize: 24,
    letterSpacing: 0.4,
    color: colors.pinkDark,
  },
});
