import { useVideoPlayer } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getStreamUrl, reportVideoDuration } from '../api/videos';
import type { CourseLesson } from '../types';

type Props = {
  lessons: CourseLesson[];
  /** Called when a lesson duration is saved so the parent can refresh local state. */
  onDurationSaved: (lessonId: string, durationSeconds: number) => void;
};

/**
 * Quietly reads real duration from each published lesson that is missing
 * DurationSeconds, then persists it via report-duration. Processes one at a time.
 */
export function LessonDurationBackfill({ lessons, onDurationSaved }: Props) {
  const missingIds = lessons
    .filter((l) => l.durationSeconds == null || l.durationSeconds <= 0)
    .map((l) => l.id);
  const [queue, setQueue] = useState<string[]>(missingIds);
  const lessonsById = useRef(new Map(lessons.map((l) => [l.id, l])));
  const savedRef = useRef(onDurationSaved);
  savedRef.current = onDurationSaved;
  lessonsById.current = new Map(lessons.map((l) => [l.id, l]));

  useEffect(() => {
    setQueue(
      lessons
        .filter((l) => l.durationSeconds == null || l.durationSeconds <= 0)
        .map((l) => l.id),
    );
  }, [missingIds.join('|')]);

  const currentId = queue[0] ?? null;
  const current = currentId ? lessonsById.current.get(currentId) : null;

  const advance = useCallback((lessonId: string, seconds: number | null) => {
    if (seconds != null && seconds > 0) {
      savedRef.current(lessonId, seconds);
    }
    setQueue((prev) => prev.filter((id) => id !== lessonId));
  }, []);

  if (!current) return null;

  return (
    <LessonDurationProbe
      key={current.id}
      lesson={current}
      onDone={(seconds) => advance(current.id, seconds)}
    />
  );
}

function LessonDurationProbe({
  lesson,
  onDone,
}: {
  lesson: CourseLesson;
  onDone: (seconds: number | null) => void;
}) {
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const finishedRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    let cancelled = false;
    finishedRef.current = false;
    setStreamUrl(null);

    void (async () => {
      try {
        const stream = await getStreamUrl(lesson.id, !lesson.isFreePreview);
        if (!cancelled) setStreamUrl(stream.streamUrl);
      } catch {
        if (!cancelled) onDoneRef.current(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lesson.id, lesson.isFreePreview]);

  const player = useVideoPlayer(
    streamUrl
      ? {
          uri: streamUrl,
          contentType: 'auto',
          useCaching: true,
        }
      : null,
    (p) => {
      p.muted = true;
      p.loop = false;
    },
  );

  useEffect(() => {
    if (!streamUrl) return;

    const timeout = setTimeout(() => {
      if (!finishedRef.current) {
        finishedRef.current = true;
        onDoneRef.current(null);
      }
    }, 20_000);

    const interval = setInterval(() => {
      const dur = player.duration || 0;
      if (dur > 0 && !finishedRef.current) {
        finishedRef.current = true;
        clearInterval(interval);
        clearTimeout(timeout);
        const seconds = Math.round(dur);
        void reportVideoDuration(lesson.id, seconds, !lesson.isFreePreview)
          .then(() => onDoneRef.current(seconds))
          .catch(() => onDoneRef.current(seconds));
      }
    }, 400);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
      try {
        player.pause();
      } catch {
        // released
      }
    };
  }, [streamUrl, player, lesson.id, lesson.isFreePreview]);

  return null;
}
