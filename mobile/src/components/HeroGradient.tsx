import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { heroGradient } from '../theme';

type Props = {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * Pink wash for headers/heroes that soft-fades into the page gradient
 * (no hard edge / divider line).
 */
export function HeroGradient({ children, style }: Props) {
  return (
    <View style={[styles.wrap, style]}>
      <LinearGradient
        colors={[...heroGradient.colors]}
        locations={[...heroGradient.locations]}
        start={heroGradient.start}
        end={heroGradient.end}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
  },
});
