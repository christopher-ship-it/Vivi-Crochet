import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { VideoProgress } from '../api/videoProgress.ts';
import { resumePositionFor, summarizeCourseProgress } from './watchProgress.ts';

const lessons = [
  { id: 'a', sortOrder: 1 },
  { id: 'b', sortOrder: 2 },
  { id: 'c', sortOrder: 3 },
];

const progress = (
  videoId: string,
  position: number,
  duration: number,
  over: Partial<VideoProgress> = {},
): VideoProgress => ({
  videoId,
  courseId: 'course',
  positionSeconds: position,
  durationSeconds: duration,
  isCompleted: false,
  percent: Math.round((100 * position) / duration),
  updatedAt: '2026-10-03T10:00:00Z',
  ...over,
});

describe('summarizeCourseProgress', () => {
  test('a learner who has watched nothing has not started and sits on the first lesson', () => {
    const s = summarizeCourseProgress(lessons, []);
    assert.equal(s.started, false);
    assert.equal(s.currentIndex, 0);
    assert.equal(s.currentPercent, 0);
    assert.equal(s.overallPercent, 0);
    assert.equal(s.completedCount, 0);
  });

  test('part of a lesson counts as that share of the course', () => {
    const s = summarizeCourseProgress(lessons, [progress('a', 300, 600)]);
    assert.equal(s.started, true);
    assert.equal(s.currentIndex, 0);
    assert.equal(s.currentPercent, 50);
    assert.equal(s.overallPercent, 17); // half of one lesson out of three
  });

  test('a finished lesson moves the learner on to the next one', () => {
    const s = summarizeCourseProgress(lessons, [progress('a', 600, 600, { isCompleted: true, percent: 100 })]);
    assert.equal(s.completedCount, 1);
    assert.equal(s.currentIndex, 1);
    assert.equal(s.currentPercent, 0);
    assert.equal(s.overallPercent, 33);
    assert.deepEqual(s.byLesson.a, { percent: 100, completed: true });
  });

  test('the most recently watched unfinished lesson is the one to continue', () => {
    const s = summarizeCourseProgress(lessons, [
      progress('a', 100, 600, { updatedAt: '2026-10-01T10:00:00Z' }),
      progress('c', 200, 600, { updatedAt: '2026-10-03T10:00:00Z' }),
    ]);
    assert.equal(s.currentIndex, 2);
  });

  test('a finished course stays on the last lesson at 100%', () => {
    const done = lessons.map((l) => progress(l.id, 600, 600, { isCompleted: true, percent: 100 }));
    const s = summarizeCourseProgress(lessons, done);
    assert.equal(s.overallPercent, 100);
    assert.equal(s.currentIndex, 2);
    assert.equal(s.completedCount, 3);
  });

  test('lessons are ordered by their sort order, not the order they are given', () => {
    const s = summarizeCourseProgress([lessons[2], lessons[0], lessons[1]], []);
    assert.equal(s.currentLessonId, 'a');
  });

  test('a course with no lessons is empty', () => {
    const s = summarizeCourseProgress([], []);
    assert.equal(s.currentIndex, -1);
    assert.equal(s.currentLessonId, null);
    assert.equal(s.overallPercent, 0);
  });
});

describe('resumePositionFor', () => {
  test('starts a little before where the learner stopped', () => {
    assert.equal(resumePositionFor(progress('a', 300, 600)), 297);
  });

  test('starts from the beginning when there is nothing to resume', () => {
    assert.equal(resumePositionFor(null), 0);
    assert.equal(resumePositionFor(progress('a', 2, 600)), 0);
  });

  test('starts again from the beginning once the lesson was finished or nearly finished', () => {
    assert.equal(resumePositionFor(progress('a', 590, 600)), 0);
    assert.equal(resumePositionFor(progress('a', 100, 600, { isCompleted: true })), 0);
  });
});
