import { StyleSheet } from 'react-native';
import { HeroGradient } from './HeroGradient';

/** Pink gradient fill for React Navigation headers. */
export function HeaderBackground() {
  return <HeroGradient style={StyleSheet.absoluteFillObject} />;
}
