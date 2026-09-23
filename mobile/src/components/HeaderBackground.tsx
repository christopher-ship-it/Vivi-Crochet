import { StyleSheet } from 'react-native';
import { HeroGradient } from './HeroGradient';

/** Soft pink overlay for headers/heroes — fades into the page (no hard edge). */
export function HeaderBackground() {
  return <HeroGradient style={StyleSheet.absoluteFillObject} />;
}
