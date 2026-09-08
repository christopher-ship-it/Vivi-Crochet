import { useEffect, useRef, useState } from 'react';
import { ApiClientError } from '../api/client';
import {
  completeUpload,
  deleteVideo,
  requestUploadUrl,
  updateVideo,
} from '../api/videos';
import type { Video } from '../types';
import { formatFileSize, parseDuration, validateVideoFile } from '../utils/format';
import { uploadToBlob, type UploadProgress } from '../utils/videoUpload';

interface VideoUploadModalProps {
  courseId: string;
  nextSortOrder: number;
  onClose: () => void;
  onComplete: (video: Video) => void;
}

type Step = 'select' | 'uploading' | 'success' | 'error';

export function VideoUploadModal({
  courseId,
  nextSortOrder,
  onClose,
  onComplete,
}: VideoUploadModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState('');
  const [isFreePreview, setIsFreePreview] = useState(false);
  const [sortOrder, setSortOrder] = useState(nextSortOrder);
  const [step, setStep] = useState<Step>('select');
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);

  function handleFileChange(selected: File | null) {
    if (!selected) return;
    const validation = validateVideoFile(selected);
    if (!validation.valid) {
      setError(validation.error ?? 'Invalid file');
      setFile(null);
      return;
    }
    setError(null);
    setFile(selected);
    if (!title) {
      const baseName = selected.name.replace(/\.[^.]+$/, '');
      setTitle(baseName);
    }
  }

  async function startUpload() {
    if (!file) return;
    const validation = validateVideoFile(file);
    if (!validation.valid) {
      setError(validation.error ?? 'Invalid file');
      return;
    }

    setStep('uploading');
    setError(null);
    setProgress({ loaded: 0, total: file.size, percent: 0 });
    abortRef.current = new AbortController();

    try {
      const ticket = await requestUploadUrl({
        courseId,
        fileName: file.name,
        contentType: validation.contentType!,
        fileSizeBytes: file.size,
      });

      setVideoId(ticket.videoId);

      const uploadResult = await uploadToBlob(
        ticket.uploadUrl,
        file,
        validation.contentType!,
        setProgress,
        abortRef.current.signal,
      );

      if (!uploadResult.success) {
        throw new Error(uploadResult.error ?? 'Upload failed');
      }

      let video = await completeUpload(ticket.videoId);

      const durationSeconds = parseDuration(duration);
      video = await updateVideo(ticket.videoId, {
        title: title.trim() || video.title,
        description: description.trim() || null,
        durationSeconds,
        isFreePreview,
        sortOrder,
      });

      setStep('success');
      onComplete(video);
    } catch (err) {
      setStep('error');
      setError(
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Upload failed',
      );
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
    onClose();
  }

  async function handleRetry() {
    if (videoId) {
      try {
        await deleteVideo(videoId);
      } catch {
        // Orphan cleanup is best-effort before a fresh upload.
      }
    }
    setStep('select');
    setProgress(null);
    setError(null);
    setVideoId(null);
  }

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  return (
    <div className="modal-backdrop" onClick={handleCancel} role="presentation">
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="upload-modal-title"
      >
        <div className="modal__header">
          <h2 id="upload-modal-title" className="modal__title">Add video lesson</h2>
          <button type="button" className="btn btn--ghost btn--icon" onClick={handleCancel} aria-label="Close">
            ✕
          </button>
        </div>

        {step === 'select' && (
          <>
            <div className="form-field" style={{ marginBottom: 16 }}>
              <label>Video file (MP4, MOV, WebM · max 2 GB)</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm"
                onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
              />
            </div>

            {file && (
              <div className="upload-info" style={{ marginBottom: 16 }}>
                <strong>{file.name}</strong>
                <span>{formatFileSize(file.size)} · {file.type || 'video'}</span>
              </div>
            )}

            <div className="form-grid">
              <div className="form-field form-grid--full">
                <label htmlFor="v-title">Title</label>
                <input
                  id="v-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>
              <div className="form-field">
                <label htmlFor="v-duration">Duration (mm:ss)</label>
                <input
                  id="v-duration"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="5:30"
                />
              </div>
              <div className="form-field">
                <label htmlFor="v-sort">Sort order</label>
                <input
                  id="v-sort"
                  type="number"
                  min={0}
                  value={sortOrder}
                  onChange={(e) => setSortOrder(Number(e.target.value))}
                />
              </div>
              <div className="form-field form-grid--full">
                <label htmlFor="v-desc">Description</label>
                <textarea
                  id="v-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="form-field form-field--checkbox form-grid--full">
                <input
                  id="v-preview"
                  type="checkbox"
                  checked={isFreePreview}
                  onChange={(e) => setIsFreePreview(e.target.checked)}
                />
                <label htmlFor="v-preview">Free preview lesson</label>
              </div>
            </div>

            {error && <div className="form-error" style={{ marginTop: 16 }}>{error}</div>}

            <div className="modal__footer">
              <button type="button" className="btn btn--ghost" onClick={handleCancel}>Cancel</button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={!file || !title.trim()}
                onClick={startUpload}
              >
                Upload video
              </button>
            </div>
          </>
        )}

        {step === 'uploading' && (
          <>
            <p style={{ marginBottom: 12 }}>
              Uploading <strong>{file?.name}</strong> directly to storage…
            </p>
            <div className="progress-bar" style={{ marginBottom: 8 }}>
              <div
                className="progress-bar__fill"
                style={{ width: `${progress?.percent ?? 0}%` }}
              />
            </div>
            <p style={{ color: 'var(--vivi-muted)', marginBottom: 16 }}>
              {progress?.percent ?? 0}% · {formatFileSize(progress?.loaded ?? 0)} of{' '}
              {formatFileSize(progress?.total ?? file?.size ?? 0)}
            </p>
            <div className="modal__footer">
              <button type="button" className="btn btn--ghost" onClick={handleCancel}>
                Cancel upload
              </button>
            </div>
          </>
        )}

        {step === 'success' && (
          <>
            <p style={{ marginBottom: 16 }}>
              Upload complete. The video is saved as <strong>Draft</strong> until you publish it.
            </p>
            <div className="modal__footer">
              <button type="button" className="btn btn--primary" onClick={onClose}>Done</button>
            </div>
          </>
        )}

        {step === 'error' && (
          <>
            <div className="form-error" style={{ marginBottom: 16 }}>
              Upload failed
              <br />
              {error}
            </div>
            {videoId && (
              <p style={{ color: 'var(--vivi-muted)', marginBottom: 16, fontSize: 13 }}>
                Video record {videoId.slice(0, 8)}… was created. You can retry the upload or delete the video from the list.
              </p>
            )}
            <div className="modal__footer">
              <button type="button" className="btn btn--ghost" onClick={handleCancel}>Close</button>
              <button type="button" className="btn btn--primary" onClick={handleRetry}>Retry</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
