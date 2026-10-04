import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useI18n } from '../i18n';
import {
  hasWatchedIntro,
  markIntroWatched,
  registerIntroLabelView,
} from '../introVideo/storage';
import { colors, fonts } from '../theme';

/** Phones narrower than this skip the label so the cart button never gets squeezed. */
const MIN_WIDTH_FOR_LABEL = 340;

type Props = {
  onPress: () => void;
};

/**
 * Header play icon for the welcome video. Until the person has opened the video it pulses softly, and for the
 * first few app launches a small "Watch intro" label sits beside it. After that it is just a quiet icon.
 */
export function IntroPlayButton({ onPress }: Props) {
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const [watched, setWatched] = useState(true); // Quiet until storage says otherwise.
  const [labelVisible, setLabelVisible] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const seen = await hasWatchedIntro();
      if (cancelled) return;
      setWatched(seen);
      if (!seen) {
        const showLabel = await registerIntroLabelView();
        if (!cancelled) setLabelVisible(showLabel);
      }
    })();
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => !cancelled && setReduceMotion(enabled))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const animate = !watched && !reduceMotion;
  useEffect(() => {
    if (!animate) {
      pulse.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1400,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(700),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animate, pulse]);

  function handlePress() {
    setWatched(true);
    setLabelVisible(false);
    void markIntroWatched();
    onPress();
  }

  const showLabel = labelVisible && !watched && width >= MIN_WIDTH_FOR_LABEL;

  return (
    <Pressable
      style={styles.row}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={t('home.introPlay')}
      hitSlop={8}
    >
      {showLabel ? (
        <View style={styles.label}>
          <Text style={styles.labelText} numberOfLines={1}>
            {t('home.introLabel')}
          </Text>
        </View>
      ) : null}
      <View style={styles.iconWrap}>
        {animate ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.ring,
              {
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] }),
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.9] }) }],
              },
            ]}
          />
        ) : null}
        <Ionicons name="play-circle" size={28} color={colors.pink} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
  },
  iconWrap: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.pink,
  },
  label: {
    backgroundColor: colors.pink,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  labelText: {
    fontFamily: fonts.extraBold,
    fontSize: 12,
    color: colors.white,
  },
});
