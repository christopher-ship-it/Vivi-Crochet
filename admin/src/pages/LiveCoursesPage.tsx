import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiClientError } from '../api/client';
import { listAdminLiveCourses, updateAdminLiveCourse } from '../api/live';
import type { AdminLiveCourse } from '../types';

function parseNumberDraft(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** One project per line: "Name" or "Name | https://picture-link". */
function projectsToText(course: AdminLiveCourse): string {
  return course.projects.map((p) => (p.imageUrl ? `${p.name} | ${p.imageUrl}` : p.name)).join('\n');
}

function textToProjects(text: string): AdminLiveCourse['projects'] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, ...rest] = line.split('|');
      const imageUrl = rest.join('|').trim();
      return { name: name.trim(), imageUrl: imageUrl || null };
    });
}

function CourseCard({ initial }: { initial: AdminLiveCourse }) {
  const [form, setForm] = useState(initial);
  const [learnText, setLearnText] = useState(initial.learn.join('\n'));
  const [projectsText, setProjectsText] = useState(projectsToText(initial));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(patch: Partial<AdminLiveCourse>) {
    setForm((cur) => ({ ...cur, ...patch }));
    setSaved(false);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const next = await updateAdminLiveCourse({
        ...form,
        learn: learnText.split('\n').map((l) => l.trim()).filter(Boolean),
        projects: textToProjects(projectsText),
      });
      setForm(next);
      setLearnText(next.learn.join('\n'));
      setProjectsText(projectsToText(next));
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not save this course.');
    } finally {
      setSaving(false);
    }
  }

  const id = `course-${form.code}`;

  return (
    <form className="card form-dense" onSubmit={handleSave} style={{ marginBottom: 20 }}>
      <h2 className="card__title">
        {form.name}{' '}
        {form.isBundle && <span className="badge badge--published">Bundle</span>}
        {!form.isActive && <span className="badge">Hidden from customers</span>}
      </h2>
      {error && <div className="form-error">{error}</div>}
      {saved && <div className="alert alert--success">Saved.</div>}

      <div className="form-grid-6">
        <div className="form-field span-2">
          <label htmlFor={`${id}-name`}>Name</label>
          <input
            id={`${id}-name`}
            maxLength={80}
            value={form.name}
            onChange={(e) => update({ name: e.target.value })}
            required
          />
        </div>
        <div className="form-field span-2">
          <label htmlFor={`${id}-level`}>Level label</label>
          <input
            id={`${id}-level`}
            maxLength={40}
            value={form.level}
            onChange={(e) => update({ level: e.target.value })}
            required
          />
        </div>
        <div className="form-field span-2">
          <label htmlFor={`${id}-price`}>Price</label>
          <div className="input-affix">
            <span className="input-affix__prefix">₹</span>
            <input
              id={`${id}-price`}
              type="number"
              min={1}
              max={100000}
              value={form.price}
              onChange={(e) => update({ price: parseNumberDraft(e.target.value) })}
            />
          </div>
          <p className="form-hint">New bookings only. Paid bookings keep what they paid.</p>
        </div>

        <div className="form-field span-2">
          <label htmlFor={`${id}-mrp`}>Original price (optional)</label>
          <div className="input-affix">
            <span className="input-affix__prefix">₹</span>
            <input
              id={`${id}-mrp`}
              type="number"
              min={1}
              max={100000}
              value={form.mrp ?? ''}
              onChange={(e) => update({ mrp: e.target.value === '' ? null : parseNumberDraft(e.target.value) })}
            />
          </div>
          <p className="form-hint">Shown struck through, with the % off. Must be above the price.</p>
        </div>
        <div className="form-field span-4">
          <label htmlFor={`${id}-tagline`}>Tagline</label>
          <input
            id={`${id}-tagline`}
            maxLength={120}
            value={form.tagline}
            onChange={(e) => update({ tagline: e.target.value })}
          />
        </div>
        <div className="form-field span-2">
          <label htmlFor={`${id}-days`}>Days</label>
          <input
            id={`${id}-days`}
            type="number"
            min={1}
            max={60}
            value={form.durationDays}
            onChange={(e) => update({ durationDays: parseNumberDraft(e.target.value) })}
          />
        </div>
        <div className="form-field span-2">
          <label htmlFor={`${id}-hours`}>Hours a day</label>
          <input
            id={`${id}-hours`}
            type="number"
            min={1}
            max={8}
            value={form.hoursPerDay}
            onChange={(e) => update({ hoursPerDay: parseNumberDraft(e.target.value) })}
          />
        </div>
        <div className="form-field span-2">
          <label htmlFor={`${id}-weeks`}>Weeks in a row</label>
          <input
            id={`${id}-weeks`}
            type="number"
            min={1}
            max={8}
            value={form.weeksSpan}
            onChange={(e) => update({ weeksSpan: parseNumberDraft(e.target.value) })}
          />
        </div>
        <p className="form-hint span-6" style={{ margin: 0 }}>
          Weeks in a row: 1 for a 5-day course, 2 for a 10-day course, 5 for the pack.
        </p>

        <div className="form-field span-3">
          <label htmlFor={`${id}-learn`}>What you will learn (one per line)</label>
          <textarea
            id={`${id}-learn`}
            rows={4}
            value={learnText}
            onChange={(e) => {
              setLearnText(e.target.value);
              setSaved(false);
            }}
          />
        </div>
        <div className="form-field span-3">
          <label htmlFor={`${id}-projects`}>Projects (one per line, optional picture link)</label>
          <textarea
            id={`${id}-projects`}
            rows={4}
            placeholder={'Flower | https://…/flower.jpg\nKeychain'}
            value={projectsText}
            onChange={(e) => {
              setProjectsText(e.target.value);
              setSaved(false);
            }}
          />
        </div>

        <div className="form-field span-6">
          <label>
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => update({ isActive: e.target.checked })}
            />{' '}
            Show this course to customers
          </label>
        </div>
      </div>

      <div className="form-actions" style={{ marginTop: 12 }}>
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? 'Saving…' : `Save ${form.name}`}
        </button>
      </div>
    </form>
  );
}

export function LiveCoursesPage() {
  const [courses, setCourses] = useState<AdminLiveCourse[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    listAdminLiveCourses()
      .then(setCourses)
      .catch((err) =>
        setLoadError(err instanceof ApiClientError ? err.message : 'Failed to load Live courses.'),
      );
  }, []);

  if (loadError) {
    return (
      <div className="error-state">
        <h3>Could not load Live courses</h3>
        <p>{loadError}</p>
      </div>
    );
  }

  if (!courses) {
    return (
      <div className="loading-state">
        <p>Loading Live courses…</p>
      </div>
    );
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-header__title">Live courses</h1>
          <p className="page-header__subtitle">
            The courses customers choose on the Live page: price, class time, what they learn and the
            projects they make. The Artist pack is all courses in one booking.
          </p>
        </div>
        <div className="page-header__actions">
          <Link to="/live" className="btn btn--sm">
            Back to Live classes
          </Link>
        </div>
      </header>

      {courses.map((course) => (
        <CourseCard key={course.id} initial={course} />
      ))}
    </>
  );
}
