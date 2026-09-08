import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  createCourse,
  getCourse,
  listCategories,
  listCourses,
  updateCourse,
} from '../api/courses';
import { ApiClientError } from '../api/client';
import type { Category, Course, CourseRequest, CourseType } from '../types';
import { LANGUAGE_OPTIONS } from '../utils/format';

const COURSE_TYPES: { value: CourseType; label: string }[] = [
  { value: 'DigitalCourse', label: 'Course' },
  { value: 'ProjectCourse', label: 'Viral project' },
  { value: 'Bundle', label: 'Bundle' },
];

const emptyForm: CourseRequest = {
  name: '',
  categoryId: null,
  type: 'DigitalCourse',
  level: '',
  about: '',
  price: 299,
  mrp: null,
  accessDays: 30,
  renewalPercentage: 50,
  includedCourseIds: [],
  launchPrice: 999,
  launchLimit: 100,
  regularPriceAfterLaunch: 1699,
};

export function CourseFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState<CourseRequest>(emptyForm);
  const [selectedLangs, setSelectedLangs] = useState<string[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [catalog, setCatalog] = useState<Course[]>([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          about: course.about ?? '',
          price: course.price,
          mrp: course.mrp ?? null,
          accessDays: course.accessDays,
          renewalPercentage: course.renewalPercentage,
          languages: course.languages ?? '',
          includedCourseIds: course.includedCourses?.map((c) => c.id) ?? [],
          launchPrice: course.launchOffer?.launchPrice ?? 999,
          launchLimit: course.launchOffer?.launchLimit ?? 100,
          regularPriceAfterLaunch: course.launchOffer?.regularPriceAfterLaunch ?? course.price,
        });
        setSelectedLangs(
          course.languages ? course.languages.split(',').map((l) => l.trim()).filter(Boolean) : [],
        );
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
    setSaving(true);
    setError(null);
    const payload: CourseRequest = {
      ...form,
      languages: selectedLangs.join(', ') || null,
      level: form.level || null,
      about: form.about || null,
      mrp: form.mrp || null,
      includedCourseIds: form.type === 'Bundle' ? (form.includedCourseIds ?? []) : [],
      launchPrice: form.type === 'Bundle' ? form.launchPrice ?? 999 : null,
      launchLimit: form.type === 'Bundle' ? form.launchLimit ?? 100 : null,
      regularPriceAfterLaunch: form.type === 'Bundle' ? form.regularPriceAfterLaunch ?? form.price : null,
    };
    try {
      if (isEdit && id) {
        await updateCourse(id, payload);
        navigate(`/courses/${id}`);
      } else {
        const created = await createCourse(payload);
        navigate(`/courses/${created.id}`);
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
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
      <header className="page-header">
        <div>
          <h1 className="page-header__title">{isEdit ? 'Edit course' : 'New course'}</h1>
          <p className="page-header__subtitle">
            {isEdit ? 'Update course details' : 'Courses are created as Draft'}
          </p>
        </div>
        <div className="page-header__actions">
          <Link to={isEdit && id ? `/courses/${id}` : '/courses'} className="btn btn--ghost">
            Cancel
          </Link>
        </div>
      </header>

      <form className="card" onSubmit={handleSubmit}>
        {error && <div className="form-error" style={{ marginBottom: 20 }}>{error}</div>}

        <div className="form-grid">
          <div className="form-field form-grid--full">
            <label htmlFor="name">Name</label>
            <input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              maxLength={160}
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
            <label htmlFor="category">Category</label>
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
            <label htmlFor="level">Level</label>
            <input
              id="level"
              value={form.level ?? ''}
              onChange={(e) => setForm({ ...form, level: e.target.value })}
              placeholder="Beginner"
            />
          </div>

          <div className="form-field">
            <label htmlFor="price">Price (₹)</label>
            <input
              id="price"
              type="number"
              min={0}
              value={form.price}
              onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="mrp">MRP / strike-through (₹)</label>
            <input
              id="mrp"
              type="number"
              min={0}
              value={form.mrp ?? ''}
              onChange={(e) =>
                setForm({ ...form, mrp: e.target.value ? Number(e.target.value) : null })
              }
            />
          </div>

          <div className="form-field">
            <label htmlFor="accessDays">Access days</label>
            <input
              id="accessDays"
              type="number"
              min={1}
              value={form.accessDays}
              onChange={(e) => setForm({ ...form, accessDays: Number(e.target.value) })}
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
              onChange={(e) => setForm({ ...form, renewalPercentage: Number(e.target.value) })}
              required
            />
          </div>

          <div className="form-field form-grid--full">
            <label>Audio languages</label>
            <div className="lang-chips">
              {LANGUAGE_OPTIONS.map((lang) => (
                <button
                  key={lang}
                  type="button"
                  className={`lang-chip${selectedLangs.includes(lang) ? ' lang-chip--selected' : ''}`}
                  onClick={() => toggleLang(lang)}
                >
                  {lang}
                </button>
              ))}
            </div>
          </div>

          <div className="form-field form-grid--full">
            <label htmlFor="about">About</label>
            <textarea
              id="about"
              value={form.about ?? ''}
              onChange={(e) => setForm({ ...form, about: e.target.value })}
              maxLength={2000}
            />
          </div>
        </div>

        {form.type === 'Bundle' && (
          <div className="form-grid" style={{ marginTop: 24 }}>
            <div className="form-field form-grid--full">
              <label>Included courses</label>
              <p className="page-header__subtitle" style={{ marginBottom: 8 }}>
                The bundle references these courses. Lessons are not duplicated.
              </p>
              {catalog
                .filter((c) => c.type !== 'Bundle' && c.id !== id)
                .map((c) => {
                  const checked = (form.includedCourseIds ?? []).includes(c.id);
                  return (
                    <label key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
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
                      <span>{c.name}</span>
                    </label>
                  );
                })}
            </div>
            <div className="form-field">
              <label htmlFor="standardPrice">Standard bundle price (₹)</label>
              <input
                id="standardPrice"
                type="number"
                min={0}
                value={form.price}
                onChange={(e) => setForm({
                  ...form,
                  price: Number(e.target.value),
                  regularPriceAfterLaunch: Number(e.target.value),
                })}
              />
            </div>
            <div className="form-field">
              <label htmlFor="launchPrice">Launch price (₹)</label>
              <input
                id="launchPrice"
                type="number"
                min={0}
                value={form.launchPrice ?? 999}
                onChange={(e) => setForm({ ...form, launchPrice: Number(e.target.value) })}
              />
            </div>
            <div className="form-field">
              <label htmlFor="launchLimit">Maximum launch purchases</label>
              <input
                id="launchLimit"
                type="number"
                min={1}
                value={form.launchLimit ?? 100}
                onChange={(e) => setForm({ ...form, launchLimit: Number(e.target.value) })}
              />
            </div>
          </div>
        )}

        <div style={{ marginTop: 24, display: 'flex', gap: 8 }}>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create course'}
          </button>
        </div>
      </form>
    </>
  );
}
