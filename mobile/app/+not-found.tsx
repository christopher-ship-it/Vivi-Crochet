import { Redirect } from 'expo-router';

/**
 * Deep links / stale resume hrefs should never strand the user on Expo's
 * default Unmatched Route screen.
 */
export default function NotFound() {
  return <Redirect href="/(tabs)" />;
}
