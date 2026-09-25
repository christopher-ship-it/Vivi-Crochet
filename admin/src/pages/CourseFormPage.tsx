import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  completeCourseThumbnailUpload,
  createCourse,
  deleteCourseThumbnail,
  getCourse,
  listCategories,
  listCourses,
  requestCourseThumbnailUploadUrl,
  updateCourse,
} from '../api/courses';
import { ApiClientError } from '../api/client';
import type { Category, Course, CourseRequest, CourseType } from '../types';
import { LANGUAGE_OPTIONS, validateImageFile } from '../utils/format';
import { uploadToBlob, type UploadProgress } from '../utils/videoUpload';
import { confirmDialog } from '../components/AppDialog';

const COURSE_TYPES: { value: CourseType; label: string }[] = [
  { value: 'DigitalCourse', label: 'Course' },
  { value: 'ProjectCourse', label: 'Viral project' },
  { value: 'Bundle', label: 'Bundle' },
];

type NumberDraft = number | '';

type CourseFormState = Omit<
  CourseRequest,
  'price' | 'sortOrder' | 'launchPrice' | 'launchLimit' | 'regularPriceAfterLaunch' | 'accessDays' | 'renewalPercentage'
> & {
  price: NumberDraft;
  sortOrder: NumberDraft;
  launchPrice: NumberDraft;
  launchLimit: NumberDraft;
  regularPriceAfterLaunch: NumberDraft;
  accessDays: NumberDraft;
  renewalPercentage: NumberDraft;
};

function parseNumberDraft(raw: string): NumberDraft {
  if (raw.trim() === '') return '';
  const n = Number(raw);
  return Number.isFinite(n) ? n : '';
}

const emptyForm: CourseFormState = {
  name: '',
  categoryId: null,
  type: 'DigitalCourse',
  level: '',
  description: '',
  about: '',
  price: '',
  mrp: null,
  accessDays: 30,
  renewalPercentage: 50,
  sortOrder: 0,
  includedCourseIds: [],
  launchPrice: 999,
  launchLimit: 100,
  regularPriceAfterLaunch: 1699,
};

/** Single admin field powers app "What you get" (+ Home hero fallback). */
function whatYouGetFromCourse(course: Pick<Course, 'about' | 'description'>): string {
  return (course.about?.trim() || course.description?.trim() || '');
}

function descriptionFromWhatYouGet(whatYouGet: string): string | null {
  const trimmed = whatYouGet.trim();
  if (!trimmed) return null;
  return trimmed.length > 400 ? trimmed.slice(0, 400) : trimmed;
}

export function CourseFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState<CourseFormState>(emptyForm);
  const [selectedLangs, setSelectedLangs] = useState<string[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [catalog, setCatalog] = useState<Course[]>([]);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    listCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
    listCourses()
      .then(setCatalog)
      .catch(() => setCatalog([]));
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const course = await getCourse(id!);
        if (cancelled) return;
        setForm({
          name: course.name,
          categoryId: course.categoryId ?? null,
          type: course.type,
          level: course.level ?? '',
          description: '',
          about: whatYouGetFromCourse(course),
          price: course.price,
          mrp: course.mrp ?? null,
          accessDays: course.accessDays,
          renewalPercentage: course.renewalPercentage,
          languages: course.languages ?? '',
          sortOrder: course.sortOrder ?? 0,
          includedCourseIds: course.includedCourses?.map((c) => c.id) ?? [],
          launchPrice: course.launchOffer?.launchPrice ?? 999,
          launchLimit: course.launchOffer?.launchLimit ?? 100,
          regularPriceAfterLaunch: course.launchOffer?.regularPriceAfterLaunch ?? course.price,
        });
        setSelectedLangs(
          course.languages ? course.languages.split(',').map((l) => l.trim()).filter(Boolean) : [],
        );
        setThumbnailUrl(course.thumbnailUrl ?? null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Failed to load course.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  function toggleLang(lang: string) {
    setSelectedLangs((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang],
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (form.price === '' || form.price < 0) {
      setError('Enter a valid price (₹).');
      return;
    }
    if (form.accessDays === '' || form.accessDays < 1) {
      setError('Enter access days (1 or more).');
      return;
    }
    setSaving(true);
    setError(null);
    const payload: CourseRequest = {
      ...form,
      price: form.price,
      accessDays: form.accessDays,
      renewalPercentage: form.renewalPercentage === '' ? 50 : form.renewalPercentage,
      sortOrder: form.sortOrder === '' ? 0 : form.sortOrder,
      languages: selectedLangs.join(', ') || null,
      level: form.level || null,
      about: form.about?.trim() || null,
      description: descriptionFromWhatYouGet(form.about ?? ''),
      mrp: form.mrp || null,
      includedCourseIds: form.type === 'Bundle' ? (form.includedCourseIds ?? []) : [],
      launchPrice: form.type === 'Bundle'
        ? (form.launchPrice === '' ? 999 : form.launchPrice)
        : null,
      launchLimit: form.type === 'Bundle'
        ? (form.launchLimit === '' ? 100 : form.launchLimit)
        : null,
      regularPriceAfterLaunch: form.type === 'Bundle'
        ? (form.regularPriceAfterLaunch === '' ? form.price : form.regularPriceAfterLaunch)
        : null,
    };
    try {
      if (isEdit && id) {
        await updateCourse(id, payload);
        navigate(`/courses/${id}`);
      } else {
        const created = await createCourse(payload);
        navigate(`/courses/${created.id}/edit`);
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function handleThumbnailSelect(fileList: FileList | null) {
    if (!id || !fileList?.length) return;
    const file = fileList[0];
    const validation = validateImageFile(file);
    if (!validation.valid) {
      setUploadError(validation.error ?? 'Invalid image');
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadProgress(null);
    try {
      const ticket = await requestCourseThumbnailUploadUrl(id, {
        fileName: file.name,
        contentType: validation.contentType ?? file.type,
        fileSizeBytes: file.size,
      });
      const uploadResult = await uploadToBlob(
        ticket.uploadUrl,
        file,
        validation.contentType ?? file.type,
        setUploadProgress,
      );
      if (!uploadResult.success) {
        throw new Error(uploadResult.error ?? 'Upload failed');
      }
      const course = await completeCourseThumbnailUpload(id, {
        blobPath: ticket.blobPath,
        fileSizeBytes: file.size,
        contentType: validation.contentType ?? file.type,
      });
      setThumbnailUrl(course.thumbnailUrl ?? null);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Thumbnail upload failed.');
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  async function handleRemoveThumbnail() {
    if (!id || !thumbnailUrl) return;
    if (!await confirmDialog('Remove this course thumbnail?')) return;
    setUploadError(null);
    try {
      const course = await deleteCourseThumbnail(id);
      setThumbnailUrl(course.thumbnailUrl ?? null);
    } catch (err) {
      setUploadError(err instanceof ApiClientError ? err.message : 'Could not remove thumbnail.');
    }
  }

  if (loading) {
    return (
      <div className="loading-state">
        <p>Loading course…</p>
      </div>
    );
  }

  return (
    <>
      <header className="page-header page-header--compact">
        <div>
          <h1 className="page-header__title">{isEdit ? 'Edit course' : 'New course'}</h1>
          <p className="page-header__subtitle">
            {isEdit
              ? 'Update course details and Learn & Loop thumbnail'
              : 'Courses are created as Draft — add a thumbnail after creating'}
          </p>
        </div>
        <div className="page-header__actions">
          <Link to={isEdit && id ? `/courses/${id}` : '/courses'} className="btn btn--ghost">
            Cancel
          </Link>
        </div>
      </header>

      <form className="card form-dense" onSubmit={handleSubmit}>
        {error && <div className="form-error">{error}</div>}

        <div className="form-grid-6">
          <div className="form-field span-4">
            <label htmlFor="name">Name</label>
            <input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              maxLength={160}
              placeholder="e.g. Amigurumi for beginners"
            />
          </div>

          <div className="form-field">
            <label htmlFor="type">Type</label>
            <select
              id="type"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as CourseType })}
            >
              {COURSE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="level">Level</label>
            <input
              id="level"
              value={form.level ?? ''}
              onChange={(e) => setForm({ ...form, level: e.target.value })}
              maxLength={160}
              placeholder="Beginner Level — From First Hook Hold to Your First Projects"
            />
          </div>

          <div className="form-field span-2">
            <label
              htmlFor="category"
              title="Use Viral projects or Trending Tutorials to show this on Home / Learn. Publish to make it active; Draft hides it from the app."
            >
              Category
            </label>
            <select
              id="category"
              value={form.categoryId ?? ''}
              onChange={(e) =>
                setForm({ ...form, categoryId: e.target.value || null })
              }
            >
              <option value="">— None —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="sortOrder" title="Lower numbers appear first (0 = top).">
              Display order
            </label>
            <input
              id="sortOrder"
              type="number"
              min={0}
              max={10000}
              title="Lower numbers appear first (0 = top)."
              value={form.sortOrder}
              onChange={(e) =>
                setForm({ ...form, sortOrder: parseNumberDraft(e.target.value) })
              }
            />
          </div>

          <div className="form-field">
            <label htmlFor="price">Price</label>
            <div className="input-affix">
              <span className="input-affix__prefix">₹</span>
              <input
                id="price"
                type="number"
                min={0}
                value={form.price}
                onChange={(e) => setForm({ ...form, price: parseNumberDraft(e.target.value) })}
                required
              />
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="mrp">MRP / strike-through</label>
            <div className="input-affix">
              <span className="input-affix__prefix">₹</span>
              <input
                id="mrp"
                type="number"
                min={0}
                placeholder="Optional"
                value={form.mrp ?? ''}
                onChange={(e) =>
                  setForm({ ...form, mrp: e.target.value ? Number(e.target.value) : null })
                }
              />
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="accessDays">Access days</label>
            <input
              id="accessDays"
              type="number"
              min={1}
              value={form.accessDays}
              onChange={(e) => setForm({ ...form, accessDays: parseNumberDraft(e.target.value) })}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="renewal">Renewal discount (%)</label>
            <input
              id="renewal"
              type="number"
              min={0}
              max={100}
              value={form.renewalPercentage}
              onChange={(e) => setForm({ ...form, renewalPercentage: parseNumberDraft(e.target.value) })}
              required
            />
          </div>

          <div className="form-field span-5">
            <span className="form-label">Audio languages</span>
            <div className="lang-chips">
              {LANGUAGE_OPTIONS.map((lang) => (
                <button
                  key={lang}
                  type="button"
                  aria-pressed={selectedLangs.includes(lang)}
                  className={`lang-chip${selectedLangs.includes(lang) ? ' lang-chip--selected' : ''}`}
                  onClick={() => toggleLang(lang)}
                >
                  {lang}
                </button>
              ))}
            </div>
          </div>

          <p className="form-hint span-6 form-hint--note">
            <strong>Category:</strong> use <strong>Viral projects</strong> or <strong>Trending Tutorials</strong> to
            show this on Home / Learn. Publish to make it active; Draft hides it from the app.
          </p>

          <div className="form-field span-6">
            <div className="form-label-row">
              <label
                htmlFor="whatYouGet"
                title="Shown as What you get on the course page in the app (also used on Home Viral / Trending slides)."
              >
                What you get
              </label>
              <span className="form-hint">{(form.about ?? '').length}/2000</span>
            </div>
            <textarea
              id="whatYouGet"
              value={form.about ?? ''}
              onChange={(e) => setForm({ ...form, about: e.target.value })}
              maxLength={2000}
              rows={5}
              placeholder={
                '7 guided lessons + 5 mini cute projects.\nBeginner Level - From First Hook Hold to Creating Your First Crochet Projects'
              }
            />
          </div>

          {form.type === 'Bundle' && (
            <>
              <div className="form-field span-6">
                <div className="form-label-row">
                  <span className="form-label">Included courses</span>
                  <span className="form-hint">
                    The bundle references these courses. Lessons are not duplicated ·{' '}
                    {(form.includedCourseIds ?? []).length} selected
                  </span>
                </div>
                <div className="check-list check-list--compact">
                  {catalog
                    .filter((c) => c.type !== 'Bundle' && c.id !== id)
                    .map((c) => {
                      const checked = (form.includedCourseIds ?? []).includes(c.id);
                      return (
                        <label key={c.id} className="choice">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setForm((f) => {
                                const current = f.includedCourseIds ?? [];
                                return {
                                  ...f,
                                  includedCourseIds: checked
                                    ? current.filter((x) => x !== c.id)
                                    : [...current, c.id],
                                };
                              });
                            }}
                          />
                          <span className="cell-clip">{c.name}</span>
                        </label>
                      );
                    })}
                </div>
              </div>
              <div className="form-field span-2">
                <label htmlFor="standardPrice">Standard bundle price</label>
                <div className="input-affix">
                  <span className="input-affix__prefix">₹</span>
                  <input
                    id="standardPrice"
                    type="number"
                    min={0}
                    value={form.price}
                    onChange={(e) => {
                      const next = parseNumberDraft(e.target.value);
                      setForm({
                        ...form,
                        price: next,
                        regularPriceAfterLaunch: next,
                      });
                    }}
                  />
                </div>
              </div>
              <div className="form-field span-2">
                <label htmlFor="launchPrice">Launch price</label>
                <div className="input-affix">
                  <span className="input-affix__prefix">₹</span>
                  <input
                    id="launchPrice"
                    type="number"
                    min={0}
                    value={form.launchPrice}
                    onChange={(e) => setForm({ ...form, launchPrice: parseNumberDraft(e.target.value) })}
                  />
                </div>
              </div>
              <div className="form-field span-2">
                <label htmlFor="launchLimit">Maximum launch purchases</label>
                <input
                  id="launchLimit"
                  type="number"
                  min={1}
                  value={form.launchLimit}
                  onChange={(e) => setForm({ ...form, launchLimit: parseNumberDraft(e.target.value) })}
                />
              </div>
            </>
          )}
        </div>

        <div className="form-actions form-actions--sticky">
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create course'}
          </button>
          <Link to={isEdit && id ? `/courses/${id}` : '/courses'} className="btn btn--ghost">
            Cancel
          </Link>
          {!isEdit ? (
            <span className="form-hint form-actions__note">
              Created as Draft. Add a thumbnail after creating.
            </span>
          ) : null}
        </div>
      </form>

      {isEdit && id && (
        <section className="card">
          <div className="card__header">
            <div>
              <h2 className="card__title">Course thumbnail</h2>
              <p className="card__subtitle">
                Shown on Learn &amp; Loop course cards. JPG, PNG, or WebP up to 5 MB.
              </p>
            </div>
          </div>

          {uploadError && <div className="form-error">{uploadError}</div>}

          {thumbnailUrl ? (
            <div className="thumb-editor">
              <img
                src={thumbnailUrl}
                alt={form.name || 'Course thumbnail'}
                className="thumb-editor__img"
              />
              <div className="thumb-editor__actions">
                <label className="btn btn--ghost" style={{ cursor: uploading ? 'wait' : 'pointer' }}>
                  {uploading ? 'Uploading…' : 'Replace image'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                    hidden
                    disabled={uploading}
                    onChange={(e) => {
                      void handleThumbnailSelect(e.target.files);
                      e.target.value = '';
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn--danger"
                  disabled={uploading}
                  onClick={() => void handleRemoveThumbnail()}
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <div className="upload-drop">
              <p className="form-hint">No thumbnail yet. A square image works best.</p>
              <label className="btn btn--primary" style={{ cursor: uploading ? 'wait' : 'pointer' }}>
                {uploading ? 'Uploading…' : 'Upload thumbnail'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                  hidden
                  disabled={uploading}
                  onChange={(e) => {
                    void handleThumbnailSelect(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          )}

          {uploadProgress && (
            <div style={{ marginTop: 14, maxWidth: 360 }}>
              <p className="form-hint" style={{ marginBottom: 6 }}>
                Uploading… {Math.round(uploadProgress.percent)}%
              </p>
              <div className="progress-bar">
                <div className="progress-bar__fill" style={{ width: `${uploadProgress.percent}%` }} />
              </div>
            </div>
          )}
        </section>
      )}
    </>
  );
}
