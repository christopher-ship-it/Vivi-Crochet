import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useI18n } from '../i18n';
import { uiFonts } from '../i18n/uiFonts';
import { colors } from '../theme';

type Props = {
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
};

/** Soft glowing status dot + “In stock” — used for crochet essentials. */
export function InStockLabel({ style, compact = false }: Props) {
  const { t, language } = useI18n();
  const fonts = uiFonts(language);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const haloScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.35],
  });
  const haloOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 0.2],
  });

  const size = compact ? 20 : 18;
  const mid = compact ? 12 : 11;
  const core = compact ? 7 : 6;

  return (
    <View style={[styles.row, compact && styles.rowCompact, style]}>
      <View style={[styles.dotWrap, { width: size, height: size }]}>
        {/* Soft outer bloom */}
        <Animated.View
          style={[
            styles.halo,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              opacity: haloOpacity,
              transform: [{ scale: haloScale }],
            },
          ]}
        />
        {/* Static mid wash */}
        <View
          style={[
            styles.mid,
            {
              width: mid,
              height: mid,
              borderRadius: mid / 2,
            },
          ]}
        />
        {/* Solid center */}
        <View
          style={[
            styles.dot,
            {
              width: core,
              height: core,
              borderRadius: core / 2,
            },
          ]}
        />
      </View>
      <Text
        style={[
          styles.label,
          compact && styles.labelCompact,
          { fontFamily: fonts.regular },
        ]}
      >
        {t('product.inStockLabel')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  rowCompact: {
    marginTop: 8,
    gap: 9,
  },
  dotWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    backgroundColor: 'rgba(232, 33, 91, 0.45)',
    ...Platform.select({
      ios: {
        shadowColor: colors.pink,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.9,
        shadowRadius: 8,
      },
      android: {
        elevation: 0,
      },
      default: {},
    }),
  },
  mid: {
    position: 'absolute',
    backgroundColor: 'rgba(232, 33, 91, 0.28)',
  },
  dot: {
    backgroundColor: '#3d1f24',
    ...Platform.select({
      ios: {
        shadowColor: colors.pink,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.75,
        shadowRadius: 4,
      },
      default: {},
    }),
  },
  label: {
    fontSize: 12,
    lineHeight: 15,
    color: colors.ink,
  },
  labelCompact: {
    fontSize: 13,
    lineHeight: 16,
  },
});
