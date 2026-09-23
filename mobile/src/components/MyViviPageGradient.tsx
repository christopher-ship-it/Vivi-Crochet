import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { tabPageGradient, tabPageGradientMix } from '../theme';

type Props = {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * Soft mixed peach ↔ blush page wash (no hard left/right line).
 * Used on Home, Shop, and Learn — not Live or My Vivi.
 */
export function MyViviPageGradient({ children, style }: Props) {
  return (
    <View style={[styles.root, style]}>
      <LinearGradient
        colors={[...tabPageGradient.colors]}
        locations={[...tabPageGradient.locations]}
        start={tabPageGradient.start}
        end={tabPageGradient.end}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <LinearGradient
        colors={[...tabPageGradientMix.colors]}
        locations={[...tabPageGradientMix.locations]}
        start={tabPageGradientMix.start}
        end={tabPageGradientMix.end}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
