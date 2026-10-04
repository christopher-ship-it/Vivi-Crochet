import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  completeIntroUpload,
  deleteIntroVideo,
  getIntroVideo,
  requestIntroUploadUrl,
  setIntroVideoEnabled,
} from '../api/introVideo';
import { ApiClientError } from '../api/client';
import type { AdminIntroVideo } from '../types';
import { formatDate, formatFileSize, validateVideoFile } from '../utils/format';
import { uploadToBlob, type UploadProgress } from '../utils/videoUpload';

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiClientError || err instanceof Error ? err.message : fallback;
}

export function IntroVideoPage() {
  const [intro, setIntro] = useState<AdminIntroVideo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    try {
      setIntro(await getIntroVideo());
      setError(null);
    } catch (err) {
      setError(errorMessage(err, 'Could not load the intro video.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // While the server is compressing the video, check back every few seconds.
  const busy = intro?.status === 'Queued' || intro?.status === 'Processing';
  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(() => void load(), 8000);
    return () => window.clearInterval(timer);
  }, [busy, load]);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const validation = validateVideoFile(file);
    if (!validation.valid) {
      setError(validation.error ?? 'Invalid file.');
      return;
    }

    setUploading(true);
    setError(null);
    setNotice(null);
    setProgress({ loaded: 0, total: file.size, percent: 0 });
    abortRef.current = new AbortController();

    try {
      const ticket = await requestIntroUploadUrl({
        fileName: file.name,
        contentType: validation.contentType!,
        fileSizeBytes: file.size,
      });
      const result = await uploadToBlob(
        ticket.uploadUrl,
        file,
        validation.contentType!,
        setProgress,
        abortRef.current.signal,
      );
      if (!result.success) throw new Error(result.error ?? 'Upload failed.');

      setIntro(
        await completeIntroUpload({
          blobPath: ticket.blobPath,
          fileName: file.name,
          contentType: validation.contentType!,
          fileSizeBytes: file.size,
        }),
      );
      setNotice('Uploaded. The server is now compressing it for phones. This can take a few minutes for a large file.');
    } catch (err) {
      setError(errorMessage(err, 'Upload failed.'));
    } finally {
      setUploading(false);
      setProgress(null);
      abortRef.current = null;
    }
  }

  async function toggleEnabled(next: boolean) {
    setError(null);
    try {
      setIntro(await setIntroVideoEnabled(next));
    } catch (err) {
      setError(errorMessage(err, 'Could not change the setting.'));
    }
  }

  async function remove() {
    if (!window.confirm('Remove the intro video? The app will stop showing the play icon and the first-visit preview.')) {
      return;
    }
    setError(null);
    try {
      await deleteIntroVideo();
      setNotice('Intro video removed.');
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Could not remove the video.'));
    }
  }

  if (loading) {
    return (
      <div className="loading-state">
        <p>Loading intro video…</p>
      </div>
    );
  }

  const hasUpload = Boolean(intro && (intro.hasVideo || intro.fileName));

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-header__title">Intro video</h1>
          <p className="page-header__subtitle">
            The welcome video in the app: a play icon next to the cart, and a preview shown once to new users.
          </p>
        </div>
      </header>

      {error && <div className="form-error">{error}</div>}
      {notice && <div className="alert alert--success">{notice}</div>}

      <section className="section-block so-panel">
        <div className="section-block__head">
          <h2 className="section-title" style={{ marginBottom: 0 }}>Video</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              ref={fileInput}
              type="file"
              accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
              onChange={(e) => void handleFile(e)}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              className="btn btn--primary"
              disabled={uploading}
              onClick={() => fileInput.current?.click()}
            >
              {uploading ? 'Uploading…' : hasUpload ? 'Replace video' : 'Upload video'}
            </button>
            {hasUpload && !uploading && (
              <button type="button" className="btn btn--ghost" onClick={() => void remove()}>
                Remove
              </button>
            )}
          </div>
        </div>

        {uploading && progress && (
          <div style={{ marginBottom: 16 }}>
            <div
              role="progressbar"
              aria-valuenow={progress.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              style={{ height: 8, borderRadius: 4, background: 'var(--vivi-pink-soft, #fbd3df)', overflow: 'hidden' }}
            >
              <div style={{ width: `${progress.percent}%`, height: '100%', background: 'var(--vivi-pink, #e8215b)' }} />
            </div>
            <p className="form-hint">
              {progress.percent}% · {formatFileSize(progress.loaded)} of {formatFileSize(progress.total)}. Keep this page open until it finishes.
            </p>
          </div>
        )}

        {!hasUpload && !uploading && (
          <div className="empty-state">
            <h3>No intro video yet</h3>
            <p>
              Upload an MP4, MOV or WebM. The server compresses it to a phone-friendly size, so a large file is fine.
              Until a video is ready, the app shows nothing.
            </p>
          </div>
        )}

        {intro && hasUpload && (
          <div className="info-grid">
            <span className="form-hint">File</span>
            <span>{intro.fileName ?? '—'}</span>

            <span className="form-hint">Status</span>
            <span>
              <span
                className={`badge ${
                  intro.status === 'Ready' ? 'badge--published' : intro.status === 'Failed' ? 'badge--draft' : 'badge--inactive'
                }`}
              >
                {intro.status === 'Queued'
                  ? 'WAITING TO COMPRESS'
                  : intro.status === 'Processing'
                    ? 'COMPRESSING'
                    : intro.status.toUpperCase()}
              </span>
              {busy && <span className="form-hint"> This page updates by itself.</span>}
            </span>

            {intro.error && (
              <>
                <span className="form-hint">Problem</span>
                <span>
                  {intro.error}
                  {intro.hasVideo ? ' The previous video is still in use.' : ''}
                </span>
              </>
            )}

            <span className="form-hint">Sizes</span>
            <span>
              {intro.uploadedFileSizeBytes ? `Uploaded ${formatFileSize(intro.uploadedFileSizeBytes)}` : '—'}
              {intro.playableFileSizeBytes ? ` · In the app ${formatFileSize(intro.playableFileSizeBytes)}` : ''}
            </span>

            <span className="form-hint">Updated</span>
            <span>{intro.updatedAt ? formatDate(intro.updatedAt) : '—'}</span>

            <span className="form-hint">Show in the app</span>
            <span>
              <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={intro.isEnabled}
                  onChange={(e) => void toggleEnabled(e.target.checked)}
                />
                {intro.isEnabled ? 'On: icon and first-visit preview are shown' : 'Off: hidden in the app'}
              </label>
            </span>
          </div>
        )}
      </section>

      {intro?.previewUrl && (
        <section className="section-block so-panel">
          <div className="section-block__head">
            <h2 className="section-title" style={{ marginBottom: 0 }}>What the app plays</h2>
          </div>
          <video
            key={intro.version}
            src={intro.previewUrl}
            controls
            preload="metadata"
            style={{ width: '100%', maxWidth: 420, borderRadius: 12, background: '#000' }}
          />
        </section>
      )}
    </>
  );
}
