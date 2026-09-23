import { Ionicons } from '@expo/vector-icons';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { colors, fonts, radii } from '../theme';
import { formatDuration } from '../utils/format';

interface LessonPlayerProps {
  streamUrl: string;
  title: string;
  /** From API — large camera MOVs need softer progressive buffering. */
  fileSizeBytes?: number | null;
  contentType?: string | null;
  onError?: () => void;
  onComplete?: () => void;
  onRetry?: () => void;
  /** Fired once when the native player reports a positive duration. */
  onDurationKnown?: (seconds: number) => void;
  /** Fired whenever play/pause state changes. */
  onPlayingChange?: (playing: boolean) => void;
  /** True while the user is dragging the seek thumb — parent should lock scroll. */
  onScrubbingChange?: (scrubbing: boolean) => void;
}

const CONTROLS_HIDE_MS = 3200;
/** Above this, show a clearer “large file” loading hint (production camera MOVs are often 400MB+). */
const LARGE_LESSON_BYTES = 80 * 1024 * 1024;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function resolveContentType(
  mime?: string | null,
): 'auto' | 'progressive' {
  const value = (mime ?? '').trim().toLowerCase();
  // QuickTime / huge progressive files: let the native stack sniff the container.
  // Forcing 'progressive' on Azure SAS URLs has been flaky in standalone builds.
  if (!value || value.includes('quicktime') || value.includes('mov')) return 'auto';
  return 'progressive';
}

export function LessonPlayer({
  streamUrl,
  fileSizeBytes,
  contentType: sourceMime,
  onError,
  onComplete,
  onRetry,
  onDurationKnown,
  onPlayingChange,
  onScrubbingChange,
}: LessonPlayerProps) {
  const videoRef = useRef<VideoView>(null);
  const completedRef = useRef(false);
  const scrubbingRef = useRef(false);
  const barWidthRef = useRef(0);
  const barPageXRef = useRef(0);
  const scrubberRef = useRef<View>(null);
  const durationRef = useRef(0);
  const durationReportedRef = useRef(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onScrubbingChangeRef = useRef(onScrubbingChange);
  onScrubbingChangeRef.current = onScrubbingChange;
  const wasPlayingBeforeScrubRef = useRef(false);
  const postSeekResumeRef = useRef(false);
  const isLargeLesson = (fileSizeBytes ?? 0) >= LARGE_LESSON_BYTES;
  const sourceContentType = resolveContentType(sourceMime);

  const player = useVideoPlayer(
    {
      uri: streamUrl,
      contentType: sourceContentType,
      // Avoid caching multi-hundred-MB camera MOVs onto device storage.
      useCaching: !isLargeLesson,
    },
    (p) => {
      p.loop = false;
      p.keepScreenOnWhilePlaying = true;
      // Prefer quick resume after seek over a deep forward buffer.
      // Progressive Blob MP4 still needs a short fetch when jumping to a new
      // keyframe — these thresholds keep that closer to ~1s than 3s+.
      p.bufferOptions = {
        preferredForwardBufferDuration: isLargeLesson ? 8 : 12,
        minBufferForPlayback: 0.5,
        prioritizeTimeOverSizeThreshold: true,
        waitsToMinimizeStalling: false,
      };
      // Snap to nearby keyframes — exact seeks on progressive files are slow.
      try {
        (p as { seekTolerance?: { toleranceBefore: number; toleranceAfter: number } }).seekTolerance = {
          toleranceBefore: 1.25,
          toleranceAfter: 1.25,
        };
      } catch {
        // Older expo-video builds may not expose seekTolerance.
      }
    },
  );

  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [finished, setFinished] = useState(false);
  const [scrubRatio, setScrubRatio] = useState<number | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);

  // #region agent log
  useEffect(() => {
    let host = '';
    try { host = new URL(streamUrl).host; } catch { host = 'bad-url'; }
    fetch('http://127.0.0.1:7353/ingest/2555e7db-7b21-431f-aef7-257bbbc7370c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'01e32e'},body:JSON.stringify({sessionId:'01e32e',runId:'post-fix',hypothesisId:'B',location:'LessonPlayer.tsx:mount',message:'player mounted with stream',data:{host,urlLen:streamUrl.length,bufferMin:2,bufferFwd:isLargeLesson?12:20,contentType:sourceContentType,fileSizeMB:fileSizeBytes!=null?Math.round(fileSizeBytes/1048576):null,isLargeLesson},timestamp:Date.now()})}).catch(()=>{});
  }, [streamUrl, fileSizeBytes, isLargeLesson, sourceContentType]);

  useEffect(() => {
    fetch('http://127.0.0.1:7353/ingest/2555e7db-7b21-431f-aef7-257bbbc7370c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'01e32e'},body:JSON.stringify({sessionId:'01e32e',runId:'post-fix',hypothesisId:'B',location:'LessonPlayer.tsx:status',message:'player status change',data:{status,isPlaying,hasStarted,duration:player.duration||0,currentTime:Math.round(player.currentTime||0)},timestamp:Date.now()})}).catch(()=>{});
  }, [status, isPlaying, hasStarted, player]);
  // #endregion

  useEffect(() => {
    onPlayingChange?.(isPlaying);
  }, [isPlaying, onPlayingChange]);

  const isLoadingStatus = status === 'loading' || status === 'idle';
  const showInitialLoader = !hasStarted && isLoadingStatus;
  const showRebufferSpinner =
    hasStarted && status === 'loading' && !isPlaying && !scrubbingRef.current;
  const hasError = status === 'error';

  useEffect(() => {
    if (!postSeekResumeRef.current) return;
    if (status === 'readyToPlay' || isPlaying) {
      postSeekResumeRef.current = false;
      setIsSeeking(false);
      if (!player.playing && wasPlayingBeforeScrubRef.current && !finished) {
        try {
          player.play();
        } catch {
          // Native player may reject play before the surface is ready.
        }
      }
      wasPlayingBeforeScrubRef.current = false;
    }
  }, [status, isPlaying, player, finished]);

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
    onScrubbingChangeRef.current?.(false);
    wasPlayingBeforeScrubRef.current = false;
    postSeekResumeRef.current = false;
    setIsSeeking(false);
    setControlsVisible(true);
    setMoreOpen(false);
    setHasStarted(false);
  }, [streamUrl]);

  useEffect(() => {
    if (isPlaying || status === 'readyToPlay') {
      setHasStarted(true);
    }
  }, [isPlaying, status]);

  useEffect(() => {
    if (status === 'readyToPlay' && !player.playing && !finished) {
      try {
        player.play();
      } catch {
        // Native player may reject play before the surface is ready.
      }
    }
  }, [status, player, finished]);

  useEffect(() => {
    durationRef.current = duration;
    if (duration > 0 && !durationReportedRef.current) {
      durationReportedRef.current = true;
      onDurationKnown?.(Math.round(duration));
    }
  }, [duration, onDurationKnown]);

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
        // #region agent log
        fetch('http://127.0.0.1:7353/ingest/2555e7db-7b21-431f-aef7-257bbbc7370c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'01e32e'},body:JSON.stringify({sessionId:'01e32e',runId:'stream-debug',hypothesisId:'C',location:'LessonPlayer.tsx:error',message:'player error event',data:{nextStatus,errorMessage:error&&typeof error==='object'&&'message' in error?String((error as {message?:unknown}).message).slice(0,160):String(error??'').slice(0,160)},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
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

  function measureScrubber() {
    scrubberRef.current?.measureInWindow((x, _y, width) => {
      if (width > 0) {
        barPageXRef.current = x;
        barWidthRef.current = width;
      }
    });
  }

  function ratioFromPageX(pageX: number) {
    const width = barWidthRef.current;
    if (!width) return 0;
    return clamp((pageX - barPageXRef.current) / width, 0, 1);
  }

  function setScrubbing(active: boolean) {
    scrubbingRef.current = active;
    onScrubbingChangeRef.current?.(active);
  }

  const seekHelpersRef = useRef({
    clearHideTimer,
    scheduleHide,
    revealControls,
    beginScrub: () => {},
    seekToRatio: (_ratio: number) => {},
    endScrubCancel: () => {},
  });
  seekHelpersRef.current = {
    clearHideTimer,
    scheduleHide,
    revealControls,
    beginScrub: () => {
      wasPlayingBeforeScrubRef.current = player.playing;
      postSeekResumeRef.current = false;
      setIsSeeking(false);
      if (player.playing) {
        try {
          player.pause();
        } catch {
          // Ignore pause failures while starting a scrub.
        }
      }
      // Faster keyframe seeks while the thumb moves / lands.
      try {
        const scrubPlayer = player as {
          scrubbingModeOptions?: { scrubbingModeEnabled: boolean };
        };
        if (scrubPlayer.scrubbingModeOptions) {
          scrubPlayer.scrubbingModeOptions = { scrubbingModeEnabled: true };
        }
      } catch {
        // Optional API.
      }
    },
    seekToRatio: (ratio: number) => {
      const dur = durationRef.current || player.duration || 0;
      if (dur <= 0) return;
      const next = clamp(ratio * dur, 0, dur);
      player.currentTime = next;
      setCurrentTime(next);
      setFinished(false);
      completedRef.current = false;
      seekHelpersRef.current.revealControls();

      try {
        const scrubPlayer = player as {
          scrubbingModeOptions?: { scrubbingModeEnabled: boolean };
        };
        if (scrubPlayer.scrubbingModeOptions) {
          scrubPlayer.scrubbingModeOptions = { scrubbingModeEnabled: false };
        }
      } catch {
        // Optional API.
      }

      if (wasPlayingBeforeScrubRef.current) {
        postSeekResumeRef.current = true;
        setIsSeeking(true);
        try {
          player.play();
        } catch {
          // Will retry when status returns to readyToPlay.
        }
      } else {
        setIsSeeking(false);
        postSeekResumeRef.current = false;
      }
    },
    endScrubCancel: () => {
      try {
        const scrubPlayer = player as {
          scrubbingModeOptions?: { scrubbingModeEnabled: boolean };
        };
        if (scrubPlayer.scrubbingModeOptions) {
          scrubPlayer.scrubbingModeOptions = { scrubbingModeEnabled: false };
        }
      } catch {
        // Optional API.
      }
      postSeekResumeRef.current = false;
      setIsSeeking(false);
      if (wasPlayingBeforeScrubRef.current) {
        try {
          player.play();
        } catch {
          // Ignore.
        }
      }
      wasPlayingBeforeScrubRef.current = false;
    },
  };

  const scrubPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => durationRef.current > 0,
        onStartShouldSetPanResponderCapture: () => durationRef.current > 0,
        onMoveShouldSetPanResponder: () => durationRef.current > 0,
        onMoveShouldSetPanResponderCapture: () => durationRef.current > 0,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: (event) => {
          measureScrubber();
          setScrubbing(true);
          seekHelpersRef.current.clearHideTimer();
          setControlsVisible(true);
          seekHelpersRef.current.beginScrub();
          const ratio = ratioFromPageX(event.nativeEvent.pageX);
          setScrubRatio(ratio);
        },
        onPanResponderMove: (event) => {
          if (!scrubbingRef.current) return;
          const ratio = ratioFromPageX(event.nativeEvent.pageX);
          setScrubRatio(ratio);
        },
        onPanResponderRelease: (event) => {
          const ratio = ratioFromPageX(event.nativeEvent.pageX);
          seekHelpersRef.current.seekToRatio(ratio);
          setScrubRatio(null);
          setScrubbing(false);
          seekHelpersRef.current.scheduleHide();
        },
        onPanResponderTerminate: () => {
          setScrubRatio(null);
          setScrubbing(false);
          seekHelpersRef.current.endScrubCancel();
          seekHelpersRef.current.scheduleHide();
        },
      }),
    // Stable once — handlers read latest values via refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function onScrubberLayout(event: LayoutChangeEvent) {
    barWidthRef.current = event.nativeEvent.layout.width;
    measureScrubber();
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
  const showChrome = controlsVisible || !isPlaying || hasError || showInitialLoader || moreOpen || scrubRatio != null;
  const showScrubber = !hasError && duration > 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.videoWrap}>
        <VideoView
          ref={videoRef}
          player={player}
          style={styles.video}
          contentFit="contain"
          nativeControls={false}
          fullscreenOptions={{ enable: true, orientation: 'portrait' }}
        />

        {/* Tap layer — below chrome/scrubber so drag seeks are not stolen. */}
        <Pressable style={styles.tapLayer} onPress={toggleChrome} />

        {showInitialLoader && !hasError && (
          <View style={styles.overlay} pointerEvents="none">
            <ActivityIndicator size="large" color={colors.pink} />
            <Text style={styles.overlayText}>
              {isLargeLesson
                ? 'Large lesson — starting playback…'
                : 'Loading lesson…'}
            </Text>
          </View>
        )}

        {showRebufferSpinner && !hasError && (
          <View style={styles.rebufferBadge} pointerEvents="none">
            <ActivityIndicator size="small" color={colors.white} />
            <Text style={styles.rebufferText}>
              {isSeeking ? 'Seeking…' : 'Buffering…'}
            </Text>
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
                disabled={showInitialLoader || duration <= 0}
                accessibilityRole="button"
                accessibilityLabel="Back 10 seconds"
              >
                <Ionicons name="play-back" size={22} color={colors.white} />
                <Text style={styles.seekLabel}>10</Text>
              </Pressable>

              <Pressable
                style={styles.playBtn}
                onPress={togglePlay}
                disabled={showInitialLoader}
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
                disabled={showInitialLoader || duration <= 0}
                accessibilityRole="button"
                accessibilityLabel="Forward 10 seconds"
              >
                <Ionicons name="play-forward" size={22} color={colors.white} />
                <Text style={styles.seekLabel}>10</Text>
              </Pressable>
            </View>

            {/* Spacer — real scrubber is always mounted below so it stays draggable. */}
            <View style={styles.scrubberSpacer} pointerEvents="none" />
          </View>
        )}

        {showScrubber ? (
          <View style={styles.scrubberDock} pointerEvents="box-none">
            <View
              ref={scrubberRef}
              style={styles.scrubberHit}
              onLayout={onScrubberLayout}
              {...scrubPan.panHandlers}
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
        ) : null}
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
    // Portrait lesson frame — matches phone-first 9:16 course videos.
    aspectRatio: 9 / 16,
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
  rebufferBadge: {
    position: 'absolute',
    top: 14,
    alignSelf: 'center',
    left: 0,
    right: 0,
    zIndex: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    pointerEvents: 'none',
  },
  rebufferText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.white,
    backgroundColor: 'rgba(0,0,0,0.45)',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
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
  scrubberSpacer: {
    height: 56,
  },
  scrubberDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 6,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: 'rgba(18,14,16,0.35)',
  },
  scrubberHit: {
    height: 44,
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
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.white,
    marginLeft: -9,
    top: 13,
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
