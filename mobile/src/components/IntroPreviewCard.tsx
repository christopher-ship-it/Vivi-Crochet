import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../i18n';
import { colors, fonts, radii, shadows } from '../theme';

type Props = {
  url: string;
  /** Opens the full-screen video with sound. */
  onWatch: () => void;
  /** Dismisses the preview. */
  onSkip: () => void;
};

/** A small muted preview that appears on Home once. The person can watch it fully or skip it. */
export function IntroPreviewCard({ url, onWatch, onSkip }: Props) {
  const { t } = useI18n();

  const player = useVideoPlayer({ uri: url }, (p) => {
    p.loop = false;
    p.muted = true;
    p.play();
  });

  // Done playing: go away on its own.
  useEffect(() => {
    const sub = player.addListener('playToEnd', onSkip);
    return () => sub.remove();
  }, [player, onSkip]);

  return (
    <View style={styles.card} accessibilityViewIsModal={false}>
      <Pressable
        style={styles.video}
        onPress={onWatch}
        accessibilityRole="button"
        accessibilityLabel={t('home.introPlay')}
      >
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          nativeControls={false}
          fullscreenOptions={{ enable: false }}
          pointerEvents="none"
        />
      </Pressable>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {t('home.introTitle')}
        </Text>
        <View style={styles.actions}>
          <Pressable style={styles.watch} onPress={onWatch} accessibilityRole="button" hitSlop={6}>
            <Ionicons name="volume-high" size={14} color={colors.white} />
            <Text style={styles.watchText}>{t('home.introWatch')}</Text>
          </Pressable>
          <Pressable style={styles.skip} onPress={onSkip} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.skipText}>{t('home.introSkip')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 8,
    maxWidth: 300,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.softBorder,
    ...shadows.card,
  },
  video: {
    width: 84,
    height: 112,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  body: {
    flexShrink: 1,
    gap: 8,
  },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 14,
    color: colors.ink,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  watch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.pink,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  watchText: {
    fontFamily: fonts.extraBold,
    fontSize: 12,
    color: colors.white,
  },
  skip: {
    paddingVertical: 6,
  },
  skipText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.muted,
  },
});
