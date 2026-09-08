import { useState, type FormEvent } from 'react';
import { ApiClientError } from '../api/client';
import { updateVideo } from '../api/videos';
import type { Video } from '../types';
import { formatDuration, parseDuration } from '../utils/format';

interface VideoEditModalProps {
  video: Video;
  onClose: () => void;
  onSaved: (video: Video) => void;
}

export function VideoEditModal({ video, onClose, onSaved }: VideoEditModalProps) {
  const [title, setTitle] = useState(video.title);
  const [description, setDescription] = useState(video.description ?? '');
  const [duration, setDuration] = useState(
    video.durationSeconds != null ? formatDuration(video.durationSeconds) : '',
  );
  const [isFreePreview, setIsFreePreview] = useState(video.isFreePreview);
  const [sortOrder, setSortOrder] = useState(video.sortOrder);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const updated = await updateVideo(video.id, {
        title: title.trim(),
        description: description.trim() || null,
        durationSeconds: parseDuration(duration),
        isFreePreview,
        sortOrder,
      });
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="modal__header">
          <h2 className="modal__title">Edit lesson</h2>
          <button type="button" className="btn btn--ghost btn--icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-field form-grid--full">
              <label htmlFor="edit-title">Title</label>
              <input
                id="edit-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="edit-duration">Duration (mm:ss)</label>
              <input
                id="edit-duration"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="edit-sort">Sort order</label>
              <input
                id="edit-sort"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
              />
            </div>
            <div className="form-field form-grid--full">
              <label htmlFor="edit-desc">Description</label>
              <textarea
                id="edit-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="form-field form-field--checkbox form-grid--full">
              <input
                id="edit-preview"
                type="checkbox"
                checked={isFreePreview}
                onChange={(e) => setIsFreePreview(e.target.checked)}
              />
              <label htmlFor="edit-preview">Free preview lesson</label>
            </div>
          </div>

          {error && <div className="form-error" style={{ marginTop: 16 }}>{error}</div>}

          <div className="modal__footer">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
