import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme';

/** Typographic brand mark — Nunito Bold VIVI + tracked CROCHET. */
export function BrandWordmark({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const compact = size === 'sm';
  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="header"
      accessibilityLabel="VIVI Crochet"
    >
      <Text style={[styles.vivi, compact && styles.viviSm]}>VIVI</Text>
      <Text style={[styles.crochet, compact && styles.crochetSm]}>CROCHET</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  vivi: {
    fontFamily: fonts.display,
    fontSize: 28,
    lineHeight: 30,
    color: colors.ink,
    letterSpacing: 1.5,
  },
  viviSm: {
    fontSize: 22,
    lineHeight: 24,
    letterSpacing: 1,
  },
  crochet: {
    fontFamily: fonts.semiBold,
    fontSize: 8,
    lineHeight: 11,
    color: colors.ink,
    letterSpacing: 5.2,
    marginTop: 1,
  },
  crochetSm: {
    fontSize: 7,
    letterSpacing: 4,
  },
});
