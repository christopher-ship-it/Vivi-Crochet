import { Ionicons } from '@expo/vector-icons';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '../i18n';
import { colors, fonts } from '../theme';

type Props = {
  visible: boolean;
  url: string;
  onClose: () => void;
};

/** Full-screen welcome video with sound. Closes when it ends, or when the person taps Skip. */
export function IntroVideoModal({ visible, url, onClose }: Props) {
  // Mount the player only while open, so nothing downloads or plays in the background.
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {visible ? <IntroVideoPlayer url={url} onClose={onClose} /> : null}
    </Modal>
  );
}

function IntroVideoPlayer({ url, onClose }: { url: string; onClose: () => void }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [muted, setMuted] = useState(false);

  const player = useVideoPlayer({ uri: url }, (p) => {
    p.loop = false;
    p.muted = false;
    p.play();
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });

  useEffect(() => {
    const sub = player.addListener('playToEnd', onClose);
    return () => sub.remove();
  }, [player, onClose]);

  useEffect(() => {
    player.muted = muted;
  }, [player, muted]);

  return (
    <View style={styles.root}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        nativeControls={false}
        fullscreenOptions={{ enable: false }}
      />
      {status === 'loading' ? (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator color={colors.white} size="large" />
        </View>
      ) : null}
      <View style={[styles.topRow, { paddingTop: insets.top + 12 }]}>
        <Pressable
          style={styles.pill}
          onPress={() => setMuted((m) => !m)}
          accessibilityRole="button"
          accessibilityLabel={muted ? t('home.introUnmute') : t('home.introMute')}
          hitSlop={8}
        >
          <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={18} color={colors.white} />
        </Pressable>
        <Pressable
          style={styles.pill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('home.introClose')}
          hitSlop={8}
        >
          <Text style={styles.pillText}>{t('home.introSkip')}</Text>
          <Ionicons name="close" size={18} color={colors.white} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  loading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  pillText: {
    fontFamily: fonts.extraBold,
    fontSize: 13,
    color: colors.white,
  },
});
