import { Ionicons } from '@expo/vector-icons';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  GestureResponderEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, fonts, radii } from '../theme';
import { formatDuration } from '../utils/format';

interface LessonPlayerProps {
  streamUrl: string;
  title: string;
  onError?: () => void;
  onComplete?: () => void;
  onRetry?: () => void;
}

const CONTROLS_HIDE_MS = 3200;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function LessonPlayer({ streamUrl, onError, onComplete, onRetry }: LessonPlayerProps) {
  const videoRef = useRef<VideoView>(null);
  const completedRef = useRef(false);
  const scrubbingRef = useRef(false);
  const barWidthRef = useRef(0);
  const durationRef = useRef(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const player = useVideoPlayer(streamUrl, (p) => {
    p.loop = false;
  });

  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [finished, setFinished] = useState(false);
  const [scrubRatio, setScrubRatio] = useState<number | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);

  const isBuffering = status === 'loading' || status === 'idle';
  const hasError = status === 'error';

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    if (!player.playing || scrubbingRef.current || moreOpen) return;
    hideTimerRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, CONTROLS_HIDE_MS);
  }, [clearHideTimer, moreOpen, player]);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  useEffect(() => {
    completedRef.current = false;
    setFinished(false);
    setScrubRatio(null);
    scrubbingRef.current = false;
    setControlsVisible(true);
    setMoreOpen(false);
  }, [streamUrl]);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  useEffect(() => {
    if (isPlaying && controlsVisible && !moreOpen) {
      scheduleHide();
    }
    if (!isPlaying) {
      clearHideTimer();
      setControlsVisible(true);
    }
  }, [isPlaying, controlsVisible, moreOpen, scheduleHide, clearHideTimer]);

  useEffect(() => () => clearHideTimer(), [clearHideTimer]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (scrubbingRef.current) return;
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
    }, 250);
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

  function seekTo(seconds: number) {
    const dur = durationRef.current || player.duration || 0;
    if (dur <= 0) return;
    const next = clamp(seconds, 0, dur);
    player.currentTime = next;
    setCurrentTime(next);
    setFinished(false);
    completedRef.current = false;
    revealControls();
  }

  function seekBy(deltaSeconds: number) {
    seekTo(player.currentTime + deltaSeconds);
  }

  function ratioFromLocationX(locationX: number) {
    const width = barWidthRef.current;
    if (!width) return 0;
    return clamp(locationX / width, 0, 1);
  }

  function applySeekRatio(ratio: number) {
    const dur = durationRef.current || player.duration || 0;
    if (dur <= 0) return;
    seekTo(ratio * dur);
  }

  function beginScrub(event: GestureResponderEvent) {
    scrubbingRef.current = true;
    clearHideTimer();
    setControlsVisible(true);
    const ratio = ratioFromLocationX(event.nativeEvent.locationX);
    setScrubRatio(ratio);
  }

  function moveScrub(event: GestureResponderEvent) {
    if (!scrubbingRef.current) return;
    const ratio = ratioFromLocationX(event.nativeEvent.locationX);
    setScrubRatio(ratio);
  }

  function endScrub(event: GestureResponderEvent) {
    const ratio = ratioFromLocationX(event.nativeEvent.locationX);
    applySeekRatio(ratio);
    setScrubRatio(null);
    scrubbingRef.current = false;
    scheduleHide();
  }

  function cancelScrub() {
    setScrubRatio(null);
    scrubbingRef.current = false;
    scheduleHide();
  }

  async function enterFullScreen() {
    try {
      await videoRef.current?.enterFullscreen();
    } catch {
      // Native fullscreen may be unavailable on some builds.
    }
  }

  function togglePlay() {
    if (isPlaying) player.pause();
    else player.play();
    revealControls();
  }

  function toggleChrome() {
    if (moreOpen) {
      setMoreOpen(false);
      return;
    }
    if (controlsVisible && isPlaying) {
      setControlsVisible(false);
      clearHideTimer();
      return;
    }
    revealControls();
  }

  const displayTime = scrubRatio != null && duration > 0 ? scrubRatio * duration : currentTime;
  const progress = duration > 0 ? displayTime / duration : 0;
  const showChrome = controlsVisible || !isPlaying || hasError || isBuffering || moreOpen;

  return (
    <View style={styles.wrap}>
      <View style={styles.videoWrap}>
        <VideoView
          ref={videoRef}
          player={player}
          style={styles.video}
          contentFit="contain"
          nativeControls={false}
          fullscreenOptions={{ enable: true, orientation: 'landscape' }}
        />

        {/* Tap layer — separate from scrubber so drag seeks are not stolen. */}
        <Pressable style={styles.tapLayer} onPress={toggleChrome} />

        {isBuffering && !hasError && (
          <View style={styles.overlay} pointerEvents="none">
            <ActivityIndicator size="large" color={colors.pink} />
            <Text style={styles.overlayText}>Loading lesson…</Text>
          </View>
        )}

        {hasError && (
          <View style={styles.overlay}>
            <Text style={styles.overlayTitle}>Unable to play this lesson</Text>
            <Text style={styles.overlayText}>
              The stream may have expired or your connection dropped.
            </Text>
            {onRetry && (
              <Pressable
                style={styles.retryBtn}
                onPress={onRetry}
                accessibilityRole="button"
                accessibilityLabel="Try again"
              >
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            )}
          </View>
        )}

        {showChrome && !hasError && (
          <View style={styles.chrome} pointerEvents="box-none">
            <View style={styles.chromeTop} pointerEvents="box-none">
              <Pressable
                style={styles.iconBtn}
                onPress={() => {
                  setMoreOpen((open) => !open);
                  revealControls();
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="More player options"
              >
                <Ionicons name="ellipsis-horizontal" size={18} color={colors.white} />
              </Pressable>
              <Pressable
                style={styles.iconBtn}
                onPress={() => {
                  void enterFullScreen();
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Full screen"
              >
                <Ionicons name="expand-outline" size={18} color={colors.white} />
              </Pressable>
            </View>

            {moreOpen && (
              <View style={styles.moreMenu}>
                <Pressable
                  style={styles.moreItem}
                  onPress={() => {
                    seekBy(20);
                    setMoreOpen(false);
                  }}
                >
                  <Text style={styles.moreItemText}>Skip forward 20s</Text>
                </Pressable>
              </View>
            )}

            <View style={styles.transport} pointerEvents="box-none">
              <Pressable
                style={styles.transportBtn}
                onPress={() => seekBy(-10)}
                disabled={isBuffering || duration <= 0}
                accessibilityRole="button"
                accessibilityLabel="Back 10 seconds"
              >
                <Ionicons name="play-back" size={22} color={colors.white} />
                <Text style={styles.seekLabel}>10</Text>
              </Pressable>

              <Pressable
                style={styles.playBtn}
                onPress={togglePlay}
                disabled={isBuffering}
                accessibilityRole="button"
                accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
              >
                <Ionicons
                  name={isPlaying ? 'pause' : 'play'}
                  size={28}
                  color={colors.white}
                  style={!isPlaying ? { marginLeft: 3 } : undefined}
                />
              </Pressable>

              <Pressable
                style={styles.transportBtn}
                onPress={() => seekBy(10)}
                disabled={isBuffering || duration <= 0}
                accessibilityRole="button"
                accessibilityLabel="Forward 10 seconds"
              >
                <Ionicons name="play-forward" size={22} color={colors.white} />
                <Text style={styles.seekLabel}>10</Text>
              </Pressable>
            </View>

            <View style={styles.scrubberBlock} pointerEvents="box-none">
              <View
                style={styles.scrubberHit}
                onLayout={(event) => {
                  barWidthRef.current = event.nativeEvent.layout.width;
                }}
                onStartShouldSetResponder={() => duration > 0}
                onMoveShouldSetResponder={() => duration > 0}
                onResponderTerminationRequest={() => false}
                onResponderGrant={beginScrub}
                onResponderMove={moveScrub}
                onResponderRelease={endScrub}
                onResponderTerminate={cancelScrub}
                accessibilityRole="adjustable"
                accessibilityLabel="Seek"
              >
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${progress * 100}%` }]} />
                </View>
                <View
                  pointerEvents="none"
                  style={[styles.scrubThumb, { left: `${progress * 100}%` }]}
                />
              </View>
              <View style={styles.timeRow} pointerEvents="none">
                <Text style={styles.time}>{formatDuration(Math.floor(displayTime))}</Text>
                <Text style={styles.time}>{formatDuration(Math.floor(duration))}</Text>
              </View>
            </View>
          </View>
        )}
      </View>

      {finished && (
        <Text style={styles.finished}>You reached the end of this lesson.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.dark,
  },
  videoWrap: {
    position: 'relative',
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  video: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
  },
  tapLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 3,
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
    borderRadius: radii.md,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.white,
  },
  chrome: {
    ...StyleSheet.absoluteFill,
    zIndex: 2,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(18,14,16,0.28)',
  },
  chromeTop: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    padding: 10,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  moreMenu: {
    position: 'absolute',
    top: 48,
    right: 12,
    backgroundColor: colors.white,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    minWidth: 160,
    overflow: 'hidden',
    zIndex: 4,
  },
  moreItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  moreItemText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.ink,
  },
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
  },
  transportBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
  },
  seekLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.pink,
  },
  scrubberBlock: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    zIndex: 5,
  },
  scrubberHit: {
    height: 36,
    justifyContent: 'center',
  },
  barTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  barFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.pink,
  },
  scrubThumb: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.white,
    marginLeft: -8,
    top: 10,
    borderWidth: 2,
    borderColor: colors.pink,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  time: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: 'rgba(255,255,255,0.85)',
  },
  finished: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.pink,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.dark,
  },
});
