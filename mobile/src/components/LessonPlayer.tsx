import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme';
import { formatDuration } from '../utils/format';

interface LessonPlayerProps {
  streamUrl: string;
  title: string;
  onError?: () => void;
  onComplete?: () => void;
  onRetry?: () => void;
}

export function LessonPlayer({ streamUrl, title, onError, onComplete, onRetry }: LessonPlayerProps) {
  const completedRef = useRef(false);
  const player = useVideoPlayer(streamUrl, (p) => {
    p.loop = false;
  });

  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [barWidth, setBarWidth] = useState(0);
  const [finished, setFinished] = useState(false);

  const isBuffering = status === 'loading' || status === 'idle';
  const hasError = status === 'error';

  useEffect(() => {
    completedRef.current = false;
    setFinished(false);
  }, [streamUrl]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(player.currentTime);
      setDuration(player.duration || 0);

      const dur = player.duration || 0;
      if (
        dur > 0
        && player.currentTime >= dur - 1
        && !completedRef.current
        && player.playing === false
      ) {
        completedRef.current = true;
        setFinished(true);
        onComplete?.();
      }
    }, 500);
    return () => clearInterval(interval);
  }, [player, onComplete]);

  useEffect(() => {
    const sub = player.addListener('statusChange', ({ status: nextStatus, error }) => {
      if (nextStatus === 'error' || error) {
        onError?.();
      }
    });
    return () => sub.remove();
  }, [player, onError]);

  useEffect(() => () => {
    try {
      player.pause();
    } catch {
      // Player may already be released.
    }
  }, [player]);

  const progress = duration > 0 ? currentTime / duration : 0;

  function handleSeek(event: { nativeEvent: { locationX: number } }) {
    if (!barWidth || duration <= 0) return;
    const ratio = Math.max(0, Math.min(1, event.nativeEvent.locationX / barWidth));
    player.currentTime = ratio * duration;
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.videoWrap}>
        <VideoView
          player={player}
          style={styles.video}
          contentFit="contain"
          nativeControls={false}
          fullscreenOptions={{ enable: true }}
        />
        {isBuffering && !hasError && (
          <View style={styles.overlay}>
            <ActivityIndicator size="large" color={colors.pink} />
            <Text style={styles.overlayText}>Loading video…</Text>
          </View>
        )}
        {hasError && (
          <View style={styles.overlay}>
            <Text style={styles.overlayTitle}>Playback failed</Text>
            <Text style={styles.overlayText}>The stream may have expired or your connection dropped.</Text>
            {onRetry && (
              <Pressable style={styles.retryBtn} onPress={onRetry}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
      <View style={styles.controls}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {finished && (
          <Text style={styles.finished}>You reached the end of this lesson.</Text>
        )}
        <Pressable
          style={styles.barTrack}
          onPress={handleSeek}
          onLayout={(e: LayoutChangeEvent) => setBarWidth(e.nativeEvent.layout.width)}
        >
          <View style={[styles.barFill, { width: `${progress * 100}%` }]} />
        </Pressable>
        <View style={styles.row}>
          <Pressable
            style={styles.playBtn}
            onPress={() => (isPlaying ? player.pause() : player.play())}
            disabled={hasError || isBuffering}
          >
            <Text style={styles.playText}>
              {isPlaying ? 'Pause' : isBuffering ? 'Loading…' : 'Play'}
            </Text>
          </Pressable>
          <Text style={styles.time}>
            {formatDuration(Math.floor(currentTime))} / {formatDuration(Math.floor(duration))}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.dark,
  },
  videoWrap: {
    position: 'relative',
  },
  video: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(18,14,16,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  overlayTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 16,
    color: colors.white,
    marginBottom: 8,
    textAlign: 'center',
  },
  overlayText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    lineHeight: 19,
  },
  retryBtn: {
    marginTop: 16,
    backgroundColor: colors.pink,
    borderWidth: 2,
    borderColor: colors.white,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryText: {
    fontFamily: fonts.extraBold,
    fontSize: 13,
    color: colors.white,
  },
  controls: {
    padding: 16,
    backgroundColor: colors.dark,
  },
  title: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.white,
    marginBottom: 10,
  },
  finished: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.pink,
    marginBottom: 8,
  },
  barTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginBottom: 12,
  },
  barFill: {
    height: 3,
    backgroundColor: colors.pink,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  playBtn: {
    backgroundColor: colors.pink,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderWidth: 2,
    borderColor: colors.white,
  },
  playText: {
    fontFamily: fonts.extraBold,
    color: colors.white,
    fontSize: 13,
  },
  time: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
  },
});
