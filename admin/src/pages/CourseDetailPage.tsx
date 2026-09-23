import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getCourse,
  publishCourse,
  unpublishCourse,
} from '../api/courses';
import {
  deleteVideo,
  getStreamUrl,
  listVideos,
  publishVideo,
  reportVideoDuration,
  requeueVideoTranscode,
  unpublishVideo,
  updateVideo,
} from '../api/videos';
import { ApiClientError } from '../api/client';
import { RowActionsMenu } from '../components/RowActionsMenu';
import { VideoEditModal } from '../components/VideoEditModal';
import { VideoRetryUploadModal } from '../components/VideoRetryUploadModal';
import { VideoUploadModal } from '../components/VideoUploadModal';
import type { Course, Video } from '../types';
import {
  COURSE_TYPE_LABELS,
  formatDuration,
  formatFileSize,
  formatInr,
  readVideoUrlDurationSeconds,
} from '../utils/format';

type Tab = 'lessons' | 'info';

function videoUploadStatus(video: Video): {
  label: string;
  detail?: string;
  className: string;
} {
  if (!video.uploadConfirmed) {
    return { label: 'Pending upload', className: 'uploading' };
  }
  switch (video.transcodeStatus) {
    case 'Queued':
      return { label: 'Queued', detail: 'Waiting to compress', className: 'uploading' };
    case 'Processing': {
      const mb = video.fileSizeBytes > 0 ? Math.round(video.fileSizeBytes / (1024 * 1024)) : 0;
      return {
        label: 'Compressing…',
        detail: mb >= 100 ? `~${mb} MB · can take a while` : 'Optimizing for mobile',
        className: 'uploading',
      };
    }
    case 'Failed':
      return { label: 'Compress failed', className: 'inactive' };
    case 'Ready':
      return { label: video.status, className: video.status.toLowerCase() };
    default:
      return { label: video.status, className: video.status.toLowerCase() };
  }
}

function canPublishVideo(video: Video): boolean {
  return video.uploadConfirmed && video.status === 'Draft' && video.transcodeStatus === 'Ready';
}

function needsRecompress(video: Video): boolean {
  if (!video.uploadConfirmed) return false;
  const status = video.transcodeStatus ?? 'None';
  if (status === 'Failed' || status === 'None') return true;
  // Legacy lessons marked Ready while still on the original camera file.
  if (status === 'Ready') {
    const playable = video.playableContentType?.toLowerCase() ?? '';
    const hasMobileMp4 = playable.includes('mp4') && video.playableFileSizeBytes != null;
    return !hasMobileMp4;
  }
  return false;
}

export function CourseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [course, setCourse] = useState<Course | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [tab, setTab] = useState<Tab>('lessons');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [editingVideo, setEditingVideo] = useState<Video | null>(null);
  const [retryVideo, setRetryVideo] = useState<Video | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [detectingDurations, setDetectingDurations] = useState(false);

  async function load() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [courseData, videoData] = await Promise.all([
        getCourse(id),
        listVideos(id),
      ]);
      setCourse(courseData);
      setVideos(videoData.sort((a, b) => a.sortOrder - b.sortOrder));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load course.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDetectDurations() {
    const missing = videos.filter(
      (v) => v.uploadConfirmed && (v.durationSeconds == null || v.durationSeconds <= 0),
    );
    if (missing.length === 0) {
      alert('All uploaded lessons already have a duration.');
      return;
    }

    setDetectingDurations(true);
    let filled = 0;
    try {
      for (const video of missing) {
        try {
          const stream = await getStreamUrl(video.id);
          const seconds = await readVideoUrlDurationSeconds(stream.streamUrl);
          if (seconds == null || seconds <= 0) continue;
          const updated = await reportVideoDuration(video.id, seconds);
          setVideos((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
          filled += 1;
        } catch {
          // Continue with remaining lessons.
        }
      }
      alert(
        filled > 0
          ? `Filled duration for ${filled} lesson${filled === 1 ? '' : 's'}.`
          : 'Could not read duration from the video files. Try opening a lesson in the app once, or enter mm:ss manually.',
      );
    } finally {
      setDetectingDurations(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    const busy = videos.some(
      (v) =>
        v.uploadConfirmed
        && (v.transcodeStatus === 'Queued' || v.transcodeStatus === 'Processing'),
    );
    if (!busy || !id) return;

    const timer = window.setInterval(() => {
      void listVideos(id)
        .then((videoData) => setVideos(videoData.sort((a, b) => a.sortOrder - b.sortOrder)))
        .catch(() => {
          /* ignore transient poll errors */
        });
    }, 4000);

    return () => window.clearInterval(timer);
  }, [id, videos]);

  async function handlePublishCourse() {
    if (!course) return;
    setActionId('course');
    try {
      const updated = await publishCourse(course.id);
      setCourse(updated);
    } catch (err) {
      alert(err instanceof ApiClientError ? err.message : 'Publish failed.');
    } finally {
      setActionId(null);
    }
  }

  async function handleUnpublishCourse() {
    if (!course) return;
    setActionId('course');
    try {
      const updated = await unpublishCourse(course.id);
      setCourse(updated);
    } catch (err) {
      alert(err instanceof ApiClientError ? err.message : 'Unpublish failed.');
    } finally {
      setActionId(null);
    }
  }

  async function handleVideoPublish(video: Video) {
    if (!canPublishVideo(video)) {
      alert(
        video.transcodeStatus === 'Failed'
          ? 'Compress failed. Use Retry compress, then publish.'
          : 'Wait until “Compressing for mobile…” finishes before publishing.',
      );
      return;
    }
    setActionId(video.id);
    try {
      const updated = await publishVideo(video.id);
      setVideos((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
    } catch (err) {
      alert(err instanceof ApiClientError ? err.message : 'Publish failed.');
    } finally {
      setActionId(null);
    }
  }

  async function handleRequeueTranscode(video: Video) {
    setActionId(video.id);
    try {
      const updated = await requeueVideoTranscode(video.id);
      setVideos((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
    } catch (err) {
      alert(err instanceof ApiClientError ? err.message : 'Could not queue compress.');
    } finally {
      setActionId(null);
    }
  }

  async function handleRecompressAll() {
    const targets = videos.filter(needsRecompress);
    if (targets.length === 0) {
      alert('No lessons need mobile compress right now.');
      return;
    }
    if (
      !window.confirm(
        `Queue H.264 compress for ${targets.length} lesson${targets.length === 1 ? '' : 's'}? Originals are kept.`,
      )
    ) {
      return;
    }
    setActionId('recompress-all');
    let queued = 0;
    try {
      for (const video of targets) {
        try {
          const updated = await requeueVideoTranscode(video.id);
          setVideos((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
          queued += 1;
        } catch {
          // Continue with remaining lessons.
        }
      }
      alert(
        queued > 0
          ? `Queued ${queued} lesson${queued === 1 ? '' : 's'} for mobile compress.`
          : 'Could not queue compress for any lesson.',
      );
    } finally {
      setActionId(null);
    }
  }

  async function handleVideoUnpublish(video: Video) {
    setActionId(video.id);
    try {
      const updated = await unpublishVideo(video.id);
      setVideos((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
    } catch (err) {
      alert(err instanceof ApiClientError ? err.message : 'Unpublish failed.');
    } finally {
      setActionId(null);
    }
  }

  async function handleVideoDelete(video: Video) {
    if (!window.confirm(`Delete "${video.title}"? Remaining lessons keep their order.`)) return;
    setActionId(video.id);
    try {
      await deleteVideo(video.id);
      await load();
    } catch (err) {
      const message =
        err instanceof ApiClientError
          ? `${err.message}${err.code ? ` (${err.code})` : ''}`
          : 'Delete failed.';
      alert(message);
    } finally {
      setActionId(null);
    }
  }

  async function handleReorder(video: Video, direction: 'up' | 'down') {
    const idx = videos.findIndex((v) => v.id === video.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= videos.length) return;

    const other = videos[swapIdx];
    setActionId(video.id);
    try {
      const [a, b] = await Promise.all([
        updateVideo(video.id, {
          title: video.title,
          description: video.description,
          durationSeconds: video.durationSeconds,
          isFreePreview: video.isFreePreview,
          sortOrder: other.sortOrder,
        }),
        updateVideo(other.id, {
          title: other.title,
          description: other.description,
          durationSeconds: other.durationSeconds,
          isFreePreview: other.isFreePreview,
          sortOrder: video.sortOrder,
        }),
      ]);
      setVideos((prev) => {
        const next = [...prev];
        next[idx] = a;
        next[swapIdx] = b;
        return next.sort((x, y) => x.sortOrder - y.sortOrder);
      });
    } catch (err) {
      alert(err instanceof ApiClientError ? err.message : 'Reorder failed.');
    } finally {
      setActionId(null);
    }
  }

  const nextSortOrder =
    videos.length > 0 ? Math.max(...videos.map((v) => v.sortOrder)) + 1 : 0;

  if (loading) {
    return (
      <div className="loading-state">
        <p>Loading course…</p>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="error-state">
        <h3>Could not load course</h3>
        <p>{error ?? 'Course not found.'}</p>
        <Link to="/courses" className="btn btn--secondary">Back to courses</Link>
      </div>
    );
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-header__title page-header__title--display">{course.name}</h1>
          <div className="page-header__meta">
            <p className="page-header__subtitle">
              {COURSE_TYPE_LABELS[course.type]} · {formatInr(course.price)}
            </p>
            <span className={`badge badge--${course.status.toLowerCase()}`}>
              {course.status}
            </span>
          </div>
        </div>
        <div className="page-header__actions">
          <RowActionsMenu
            label={`Actions for ${course.name}`}
            disabled={actionId === 'course'}
            items={[
              { id: 'edit', label: 'Edit course', to: `/courses/${course.id}/edit` },
              {
                id: 'publish',
                label: course.status === 'Published' ? 'Unpublish course' : 'Publish course',
                onClick: () =>
                  void (course.status === 'Published' ? handleUnpublishCourse() : handlePublishCourse()),
              },
            ]}
          />
        </div>
      </header>

      <div className="tabs" role="tablist" aria-label="Course sections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'lessons'}
          className={`tab${tab === 'lessons' ? ' tab--active' : ''}`}
          onClick={() => setTab('lessons')}
        >
          Lessons / Videos ({videos.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'info'}
          className={`tab${tab === 'info' ? ' tab--active' : ''}`}
          onClick={() => setTab('info')}
        >
          Course information
        </button>
      </div>

      {tab === 'info' && (
        <div className="card">
          <h2 className="section-title">Course information</h2>
          <dl className="info-grid">
            <dt>Course name</dt>
            <dd>{course.name}</dd>
            <dt>Type</dt>
            <dd>{COURSE_TYPE_LABELS[course.type]}</dd>
            <dt>Level</dt>
            <dd>{course.level || '—'}</dd>
            <dt>Price</dt>
            <dd>{formatInr(course.price)}</dd>
            <dt>MRP</dt>
            <dd>{course.mrp != null ? formatInr(course.mrp) : '—'}</dd>
            <dt>Access days</dt>
            <dd>{course.accessDays}</dd>
            <dt>Category</dt>
            <dd>{course.categoryName || '—'}</dd>
            <dt>Status</dt>
            <dd>
              <span className={`badge badge--${course.status.toLowerCase()}`}>
                {course.status}
              </span>
            </dd>
            <dt>Renewal discount</dt>
            <dd>{course.renewalPercentage}%</dd>
            <dt>Languages</dt>
            <dd>{course.languages || '—'}</dd>
            <dt>Slide description</dt>
            <dd className="dd--block">{course.description || '—'}</dd>
            <dt>About</dt>
            <dd className="dd--block">{course.about || '—'}</dd>
            {course.type === 'Bundle' && (
              <>
                <dt>Included courses</dt>
                <dd>
                  {course.includedCourses?.length
                    ? course.includedCourses.map((c) => c.name).join(', ')
                    : '—'}
                </dd>
                <dt>Launch offer</dt>
                <dd>
                  {course.launchOffer
                    ? `₹${course.launchOffer.launchPrice} for first ${course.launchOffer.launchLimit} purchases, then ₹${course.launchOffer.regularPriceAfterLaunch} · completed ${course.launchOffer.completedPurchaseCount ?? 0}/${course.launchOffer.launchLimit}`
                    : '—'}
                </dd>
              </>
            )}
          </dl>
        </div>
      )}

      {tab === 'lessons' && course.type === 'Bundle' && (
        <div className="card">
          <h2 className="section-title">Bundle lessons</h2>
          <p className="page-header__subtitle">
            This bundle does not store its own videos. Lessons come from the included courses.
          </p>
          <ul className="bundle-list">
            {(course.includedCourses ?? []).map((c) => (
              <li key={c.id}>
                <Link to={`/courses/${c.id}`}>{c.name}</Link>
                {' · '}
                {c.videoCount} lesson{c.videoCount === 1 ? '' : 's'} · {c.accessDays} days access when bought alone
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'lessons' && course.type !== 'Bundle' && (
        <>
          <div className="page-toolbar">
            <button type="button" className="btn btn--primary" onClick={() => setShowUpload(true)}>
              + Add video
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={detectingDurations}
              onClick={() => void handleDetectDurations()}
            >
              {detectingDurations ? 'Detecting…' : 'Detect missing durations'}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={actionId === 'recompress-all' || !videos.some(needsRecompress)}
              onClick={() => void handleRecompressAll()}
            >
              {actionId === 'recompress-all' ? 'Queuing…' : 'Compress all for mobile'}
            </button>
          </div>
          {videos.some(
            (v) =>
              v.uploadConfirmed
              && (v.transcodeStatus === 'Queued' || v.transcodeStatus === 'Processing'),
          ) && (
            <p className="form-hint" style={{ marginTop: '-8px', marginBottom: '16px' }}>
              Compressing one lesson at a time (720p / ultrafast on the API). Typical clips finish
              in a few minutes on B2; very large camera files can still take longer — refresh later
              if needed; you don’t need to click again.
            </p>
          )}

          {videos.length === 0 ? (
            <div className="empty-state">
              <h3>No lessons yet</h3>
              <p>Upload your first video lesson. Files upload directly to Azure Blob Storage.</p>
              <button type="button" className="btn btn--primary" onClick={() => setShowUpload(true)}>
                + Add video
              </button>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table data-table--videos">
                <thead>
                  <tr>
                    <th className="col-order">#</th>
                    <th className="col-title">Title</th>
                    <th className="col-duration">Duration</th>
                    <th className="col-preview">Preview</th>
                    <th className="col-upload">Upload</th>
                    <th className="col-status">Status</th>
                    <th className="col-file">File</th>
                    <th className="col-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {videos.map((video, idx) => {
                    const upload = videoUploadStatus(video);
                    return (
                      <tr key={video.id}>
                        <td className="col-order">{video.sortOrder}</td>
                        <td className="col-title">
                          <span className="video-title" title={video.title}>
                            {video.title}
                          </span>
                        </td>
                        <td className="col-duration">{formatDuration(video.durationSeconds)}</td>
                        <td className="col-preview">
                          {video.isFreePreview ? (
                            <span className="badge badge--yes">Yes</span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="col-upload">
                          <div
                            className="upload-status"
                            title={upload.detail ? `${upload.label} — ${upload.detail}` : upload.label}
                          >
                            <span className={`badge badge--${upload.className}`}>
                              {upload.label}
                            </span>
                            {upload.detail ? (
                              <span className="upload-status__detail">{upload.detail}</span>
                            ) : null}
                          </div>
                        </td>
                        <td className="col-status">
                          <span className={`badge badge--${video.status.toLowerCase()}`}>
                            {video.status}
                          </span>
                        </td>
                        <td className="col-file">
                          <div className="file-cell">
                            <span className="file-cell__name" title={video.videoFileName}>
                              {video.videoFileName}
                            </span>
                            <span className="file-cell__size">
                              {video.playableFileSizeBytes
                                ? `${formatFileSize(video.playableFileSizeBytes)} playable`
                                : formatFileSize(video.fileSizeBytes)}
                            </span>
                            {video.transcodeStatus === 'Failed' && video.transcodeError ? (
                              <span className="file-cell__size" title={video.transcodeError}>
                                {video.transcodeError}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="col-actions">
                          <div className="data-table__actions">
                            <button
                              type="button"
                              className="row-actions__trigger"
                              disabled={idx === 0 || actionId === video.id}
                              onClick={() => handleReorder(video, 'up')}
                              title="Move up"
                              aria-label={`Move ${video.title} up`}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              className="row-actions__trigger"
                              disabled={idx === videos.length - 1 || actionId === video.id}
                              onClick={() => handleReorder(video, 'down')}
                              title="Move down"
                              aria-label={`Move ${video.title} down`}
                            >
                              ↓
                            </button>
                            <RowActionsMenu
                              label={`Actions for ${video.title}`}
                              disabled={actionId === video.id}
                              items={[
                                {
                                  id: 'edit',
                                  label: 'Edit',
                                  onClick: () => setEditingVideo(video),
                                },
                                {
                                  id: 'retry',
                                  label: 'Retry upload',
                                  hidden: video.uploadConfirmed,
                                  onClick: () => setRetryVideo(video),
                                },
                                {
                                  id: 'publish',
                                  label: 'Publish',
                                  hidden: !canPublishVideo(video),
                                  onClick: () => void handleVideoPublish(video),
                                },
                                {
                                  id: 'recompress',
                                  label:
                                    video.transcodeStatus === 'Failed'
                                      ? 'Retry compress'
                                      : 'Re-compress for mobile',
                                  hidden: !needsRecompress(video),
                                  onClick: () => void handleRequeueTranscode(video),
                                },
                                {
                                  id: 'unpublish',
                                  label: 'Unpublish',
                                  hidden: video.status !== 'Published',
                                  onClick: () => void handleVideoUnpublish(video),
                                },
                                {
                                  id: 'delete',
                                  label: 'Delete',
                                  danger: true,
                                  onClick: () => void handleVideoDelete(video),
                                },
                              ]}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {showUpload && id && (
        <VideoUploadModal
          courseId={id}
          nextSortOrder={nextSortOrder}
          onClose={() => setShowUpload(false)}
          onComplete={() => load()}
        />
      )}

      {retryVideo && (
        <VideoRetryUploadModal
          video={retryVideo}
          onClose={() => setRetryVideo(null)}
          onComplete={() => {
            setRetryVideo(null);
            load();
          }}
        />
      )}

      {editingVideo && (
        <VideoEditModal
          video={editingVideo}
          onClose={() => setEditingVideo(null)}
          onSaved={(updated) => {
            setVideos((prev) =>
              prev.map((v) => (v.id === updated.id ? updated : v)).sort((a, b) => a.sortOrder - b.sortOrder),
            );
          }}
        />
      )}
    </>
  );
}
