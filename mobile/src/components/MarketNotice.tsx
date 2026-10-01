import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radii, spacing } from '../theme';

/** A soft note shown where something is only available in India (products, live classes). */
export function MarketNotice({ text }: { text: string }) {
  return (
    <View style={styles.box} accessibilityRole="alert">
      <Ionicons name="information-circle-outline" size={18} color={colors.pinkDark} />
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radii.md,
    backgroundColor: colors.pinkSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.pink,
  },
  text: {
    flex: 1,
    fontFamily: fonts.semiBold,
    fontSize: 13,
    lineHeight: 19,
    color: colors.pinkDark,
  },
});
