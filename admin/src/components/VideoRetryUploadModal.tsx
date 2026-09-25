import { useEffect, useRef, useState } from 'react';
import { ApiClientError } from '../api/client';
import {
  completeUpload,
  deleteVideo,
  requestUploadUrl,
  updateVideo,
} from '../api/videos';
import type { Video } from '../types';
import { formatFileSize, validateVideoFile } from '../utils/format';
import { uploadToBlob, type UploadProgress } from '../utils/videoUpload';
import { confirmDialog } from './AppDialog';

interface VideoRetryUploadModalProps {
  video: Video;
  onClose: () => void;
  onComplete: () => void;
}

type Step = 'ready' | 'uploading' | 'success' | 'error';

export function VideoRetryUploadModal({
  video,
  onClose,
  onComplete,
}: VideoRetryUploadModalProps) {
  const abortRef = useRef<AbortController | null>(null);
  const [step, setStep] = useState<Step>('ready');
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startUpload(selected: File) {
    const validation = validateVideoFile(selected);
    if (!validation.valid) {
      setError(validation.error ?? 'Invalid file');
      return;
    }

    setStep('uploading');
    setError(null);
    setProgress({ loaded: 0, total: selected.size, percent: 0 });
    abortRef.current = new AbortController();

    try {
      await deleteVideo(video.id);

      const ticket = await requestUploadUrl({
        courseId: video.courseId,
        fileName: selected.name,
        contentType: validation.contentType!,
        fileSizeBytes: selected.size,
      });

      const uploadResult = await uploadToBlob(
        ticket.uploadUrl,
        selected,
        validation.contentType!,
        setProgress,
        abortRef.current.signal,
      );

      if (!uploadResult.success) {
        throw new Error(uploadResult.error ?? 'Upload failed');
      }

      await completeUpload(ticket.videoId);

      await updateVideo(ticket.videoId, {
        title: video.title,
        description: video.description,
        durationSeconds: video.durationSeconds,
        isFreePreview: video.isFreePreview,
        sortOrder: video.sortOrder,
      });

      setStep('success');
      onComplete();
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

  useEffect(() => () => abortRef.current?.abort(), []);

  async function handleCancel() {
    if (step === 'uploading') {
      const confirmed = await confirmDialog(
        'Upload is in progress. Are you sure you want to cancel?',
      );
      if (!confirmed) return;
      abortRef.current?.abort();
    }
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={handleCancel} role="presentation">
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal__header">
          <h2 className="modal__title">Retry upload — {video.title}</h2>
          <button type="button" className="btn btn--ghost btn--icon" onClick={handleCancel} aria-label="Close">✕</button>
        </div>

        {step === 'ready' && (
          <>
            <p style={{ marginBottom: 16, color: 'var(--vivi-muted)' }}>
              Select the video file again. A new upload URL will be requested.
            </p>
            <input
              type="file"
              accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm"
              onChange={(e) => {
                const selected = e.target.files?.[0] ?? null;
                setFile(selected);
                if (selected) startUpload(selected);
              }}
            />
            {error && <div className="form-error" style={{ marginTop: 16 }}>{error}</div>}
          </>
        )}

        {step === 'uploading' && file && (
          <>
            <p style={{ marginBottom: 12 }}>Uploading <strong>{file.name}</strong>…</p>
            <div className="progress-bar" style={{ marginBottom: 8 }}>
              <div className="progress-bar__fill" style={{ width: `${progress?.percent ?? 0}%` }} />
            </div>
            <p style={{ color: 'var(--vivi-muted)', marginBottom: 16 }}>
              {progress?.percent ?? 0}% · {formatFileSize(progress?.loaded ?? 0)} of{' '}
              {formatFileSize(progress?.total ?? file.size)}
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
            <p>Upload complete. The lesson is saved as Draft.</p>
            <div className="modal__footer">
              <button type="button" className="btn btn--primary" onClick={onClose}>Done</button>
            </div>
          </>
        )}

        {step === 'error' && (
          <>
            <div className="form-error" style={{ marginBottom: 16 }}>{error}</div>
            <div className="modal__footer">
              <button type="button" className="btn btn--ghost" onClick={handleCancel}>Close</button>
              <button type="button" className="btn btn--primary" onClick={() => setStep('ready')}>
                Try again
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
