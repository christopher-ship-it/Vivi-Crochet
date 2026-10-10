import Constants from 'expo-constants';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { getAppVersionInfo } from '../api/appVersion';
import { colors, fonts, radii, spacing } from '../theme';
import { isBelowMinVersion } from '../updates/forceUpdate';

const FALLBACK_STORE_URL = 'https://play.google.com/store/apps/details?id=in.vivicrochet.app';

/**
 * Full-screen, non-dismissable "update required" screen when this build is older than the
 * minimum version the server asks for. Fails open: if the check fails, the app keeps running.
 */
export function ForceUpdateGate() {
  const [storeUrl, setStoreUrl] = useState(FALLBACK_STORE_URL);
  const [required, setRequired] = useState(false);

  const check = useCallback(async () => {
    try {
      const info = await getAppVersionInfo();
      const current = Constants.expoConfig?.version ?? '0.0.0';
      setRequired(isBelowMinVersion(current, info.minVersion));
      if (info.storeUrl) setStoreUrl(info.storeUrl);
    } catch {
      // Offline or API down: never lock people out because of a failed check.
    }
  }, []);

  useEffect(() => {
    void check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    return () => sub.remove();
  }, [check]);

  if (!required) return null;

  return (
    <Modal visible animationType="fade" transparent={false} onRequestClose={() => {}}>
      <View style={styles.screen}>
        <Text style={styles.title}>Update required</Text>
        <Text style={styles.body}>
          A new version of VIVI Crochet is available. Please update from the Play Store to keep
          using the app.
        </Text>
        <Pressable
          style={styles.btn}
          onPress={() => void Linking.openURL(storeUrl)}
          accessibilityRole="button"
          accessibilityLabel="Update on Play Store"
        >
          <Text style={styles.btnText}>Update now</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: { fontFamily: fonts.extraBold, fontSize: 24, color: colors.ink, textAlign: 'center' },
  body: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
    textAlign: 'center',
  },
  btn: {
    backgroundColor: colors.pink,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  btnText: { fontFamily: fonts.semiBold, fontSize: 16, color: colors.white },
});
