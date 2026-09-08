import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { getVideo, getStreamUrl } from '../../src/api/videos';
import { ApiClientError } from '../../src/api/client';
import { useShoppingSession } from '../../src/auth/SessionContext';
import { LessonPlayer } from '../../src/components/LessonPlayer';
import { ErrorView, LoadingView } from '../../src/components/StateViews';
import type { Video } from '../../src/types';
import { colors, fonts, radii, spacing } from '../../src/theme';

type LoadPhase = 'idle' | 'metadata' | 'stream';
type AccessBlock = 'auth' | 'enrollment' | 'expired' | null;

export default function LessonScreen() {
  const { id, courseName, courseId: courseIdParam } = useLocalSearchParams<{
    id: string;
    courseName?: string;
    courseId?: string;
  }>();
  const router = useRouter();
  const { isAuthenticated } = useShoppingSession();
  const [video, setVideo] = useState<Video | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<LoadPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [accessBlock, setAccessBlock] = useState<AccessBlock>(null);
  const [playerKey, setPlayerKey] = useState(0);

  const lessonReturnPath = id ? `/lesson/${id}` : '/(tabs)/learn';
  const courseId = courseIdParam || video?.courseId;

  const loadStream = useCallback(async () => {
    if (!id) return;
    setPhase('metadata');
    setError(null);
    setAccessBlock(null);
    setStreamUrl(null);

    try {
      const videoData = await getVideo(id);
      setVideo(videoData);

      if (!videoData.isFreePreview && !isAuthenticated) {
        setAccessBlock('auth');
        setPhase('idle');
        return;
      }

      setPhase('stream');
      const stream = await getStreamUrl(id, !videoData.isFreePreview);
      setStreamUrl(stream.streamUrl);
      setPlayerKey((k) => k + 1);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === 'UNAUTHORIZED' || err.status === 401) {
          setAccessBlock('auth');
          setError(null);
        } else if (err.code === 'ACCESS_EXPIRED') {
          setAccessBlock('expired');
          setError(null);
        } else if (err.code === 'ENROLLMENT_REQUIRED' || err.status === 403) {
          setAccessBlock('enrollment');
          setError(null);
        } else if (err.code === 'VIDEO_NOT_PUBLISHED' || err.status === 404) {
          setError('This lesson is not available yet.');
        } else if (err.code === 'BLOB_MISSING' || err.code === 'UPLOAD_INCOMPLETE') {
          setError('Video file is not ready yet. Try again later.');
        } else if (err.code === 'NETWORK_ERROR' || err.code === 'TIMEOUT') {
          setError(err.message);
        } else {
          setError(err.message);
        }
      } else {
        setError('Unable to prepare this video. Try again.');
      }
    } finally {
      setPhase('idle');
    }
  }, [id, isAuthenticated]);

  useEffect(() => {
    loadStream();
  }, [loadStream]);

  const handlePlayerError = useCallback(() => {
    setError('Playback failed. The stream may have expired.');
    setStreamUrl(null);
  }, []);

  const handleRetry = useCallback(() => {
    setError(null);
    setAccessBlock(null);
    loadStream();
  }, [loadStream]);

  const goStreamSignIn = useCallback(() => {
    router.push({
      pathname: '/login',
      params: { returnTo: lessonReturnPath },
    });
  }, [router, lessonReturnPath]);

  const goToCourse = useCallback(() => {
    if (courseId) {
      router.replace(`/course/${courseId}`);
      return;
    }
    router.replace('/(tabs)/learn');
  }, [router, courseId]);

  if (phase !== 'idle' && !video) {
    return <LoadingView message={phase === 'stream' ? 'Fetching stream…' : 'Loading lesson…'} />;
  }

  if (accessBlock === 'auth') {
    return (
      <>
        <Stack.Screen options={{ title: video?.title ?? 'Lesson' }} />
        <ErrorView
          title="Sign in to stream"
          message="Free previews play without an account. Full lessons need a one-time mobile sign-in for a secure stream link — this is not shop checkout."
          actionLabel="Verify mobile"
          onAction={goStreamSignIn}
          onRetry={loadStream}
        />
      </>
    );
  }

  if (accessBlock === 'enrollment') {
    return (
      <>
        <Stack.Screen options={{ title: video?.title ?? 'Lesson' }} />
        <ErrorView
          title="Course purchase required"
          message="This lesson unlocks after you buy the course. Tap below to purchase with Razorpay."
          actionLabel="Purchase course"
          onAction={goToCourse}
          onRetry={handleRetry}
        />
      </>
    );
  }

  if (accessBlock === 'expired') {
    return (
      <>
        <Stack.Screen options={{ title: video?.title ?? 'Lesson' }} />
        <ErrorView
          title="Access expired"
          message="Your access to this course has ended. Renew from the course page when renewal is available."
          actionLabel={courseId ? 'Back to course' : 'Browse courses'}
          onAction={goToCourse}
          onRetry={handleRetry}
        />
      </>
    );
  }

  if (error || !video) {
    return (
      <>
        <Stack.Screen options={{ title: 'Lesson' }} />
        <ErrorView
          title="Unable to play this video"
          message={error ?? 'Try again.'}
          onRetry={handleRetry}
        />
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: video.title }} />
      <ScrollView style={styles.container}>
        {streamUrl ? (
          <LessonPlayer
            key={playerKey}
            streamUrl={streamUrl}
            title={video.title}
            onError={handlePlayerError}
            onRetry={handleRetry}
          />
        ) : phase === 'stream' ? (
          <LoadingView message="Fetching stream…" />
        ) : (
          <ErrorView
            title="Unable to play this video"
            message="Could not load the stream URL."
            onRetry={handleRetry}
          />
        )}

        <View style={styles.meta}>
          {courseName && (
            <Text style={styles.courseName}>{courseName}</Text>
          )}
          <Text style={styles.title}>{video.title}</Text>
          {video.description && (
            <Text style={styles.description}>{video.description}</Text>
          )}
          {video.isFreePreview && (
            <Text style={styles.previewBadge}>Free preview lesson</Text>
          )}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  meta: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.softBorder,
  },
  courseName: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.pink,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 20,
    color: colors.ink,
    marginTop: 6,
  },
  description: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.muted,
    marginTop: 10,
    lineHeight: 21,
  },
  previewBadge: {
    marginTop: 12,
    alignSelf: 'flex-start',
    fontFamily: fonts.extraBold,
    fontSize: 10,
    letterSpacing: 0.6,
    color: colors.pinkDark,
    backgroundColor: colors.pinkSoft,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    textTransform: 'uppercase',
    overflow: 'hidden',
  },
});
