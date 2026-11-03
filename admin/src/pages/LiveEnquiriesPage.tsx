import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiClientError } from '../api/client';
import {
  createAdminLiveEnquiry,
  listAdminLiveCourses,
  listAdminLiveEnquiries,
  listAdminLiveWeeks,
  sendAdminLiveEnquiry,
} from '../api/live';
import type { AdminLiveCourse, AdminLiveEnquiry, AdminLiveWeek, LiveSlotType } from '../types';

const EMPTY_FORM = {
  name: '',
  email: '',
  phone: '',
  courseId: '',
  weekId: '',
  slotType: '' as LiveSlotType | '',
  classTime: '',
  paymentReference: '',
};

function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function LiveEnquiriesPage() {
  const [courses, setCourses] = useState<AdminLiveCourse[]>([]);
  const [weeks, setWeeks] = useState<AdminLiveWeek[]>([]);
  const [enquiries, setEnquiries] = useState<AdminLiveEnquiry[] | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function reload() {
    setEnquiries(await listAdminLiveEnquiries());
  }

  useEffect(() => {
    Promise.all([listAdminLiveCourses(), listAdminLiveWeeks(), listAdminLiveEnquiries()])
      .then(([c, w, e]) => {
        setCourses(c.filter((course) => course.isActive || course.isBundle));
        setWeeks([...w].sort((a, b) => a.startDate.localeCompare(b.startDate)));
        setEnquiries(e);
      })
      .catch((err) =>
        setError(err instanceof ApiClientError ? err.message : 'Could not load Live enquiries.'),
      );
  }, []);

  const selectedWeek = useMemo(() => weeks.find((w) => w.id === form.weekId) ?? null, [weeks, form.weekId]);
  const circles = selectedWeek?.slots ?? [];
  const canSubmit = Boolean(form.courseId && form.weekId && form.slotType && form.classTime.trim());

  function update(patch: Partial<typeof EMPTY_FORM>) {
    setForm((cur) => ({ ...cur, ...patch }));
    setNotice(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const created = await createAdminLiveEnquiry({
        name: form.name,
        email: form.email,
        phone: form.phone,
        courseId: form.courseId,
        weekId: form.weekId,
        slotType: form.slotType as LiveSlotType,
        classTime: form.classTime,
        paymentReference: form.paymentReference,
      });
      setNotice(
        created.sentAt
          ? `Class plan sent to ${created.email}.`
          : `Enquiry saved, but the email was not sent. Use Send again below.`,
      );
      setForm(EMPTY_FORM);
      await reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not save the enquiry.');
    } finally {
      setSaving(false);
    }
  }

  async function handleResend(id: string) {
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      const updated = await sendAdminLiveEnquiry(id);
      setNotice(updated.sentAt ? `Class plan sent to ${updated.email}.` : 'Still not sent. Try again shortly.');
      await reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not send the class plan.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-header__title">Live enquiries</h1>
          <p className="page-header__subtitle">
            Students enquire on WhatsApp and pay outside the app. Record the enquiry here and the class
            plan is emailed to them.
          </p>
        </div>
        <div className="page-header__actions">
          <Link to="/live/courses" className="btn btn--sm">
            Edit courses and prices
          </Link>
        </div>
      </header>

      <form
        className="card form-dense"
        onSubmit={handleSubmit}
        style={{ marginBottom: 24, borderTop: '3px solid #e8215b' }}
      >
        <h2 className="card__title" style={{ marginBottom: 2 }}>Confirm an enquiry</h2>
        <p className="form-hint" style={{ marginBottom: 12 }}>
          Enter the class time and payment reference, then send the class plan to the student.
        </p>
        {error && <div className="form-error">{error}</div>}
        {notice && <div className="alert alert--success">{notice}</div>}

        <div className="form-grid-6">
          <div className="form-field span-2">
            <label htmlFor="enqName">Student name</label>
            <input id="enqName" maxLength={120} required value={form.name} onChange={(e) => update({ name: e.target.value })} />
          </div>
          <div className="form-field span-2">
            <label htmlFor="enqEmail">Email</label>
            <input id="enqEmail" type="email" maxLength={200} required value={form.email} onChange={(e) => update({ email: e.target.value })} />
          </div>
          <div className="form-field span-2">
            <label htmlFor="enqPhone">Phone (optional)</label>
            <input id="enqPhone" inputMode="tel" maxLength={30} value={form.phone} onChange={(e) => update({ phone: e.target.value })} />
          </div>

          <div className="form-field span-2">
            <label htmlFor="enqCourse">Course</label>
            <select id="enqCourse" required value={form.courseId} onChange={(e) => update({ courseId: e.target.value })}>
              <option value="">Choose</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · ₹{c.price}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field span-2">
            <label htmlFor="enqWeek">Starting week</label>
            <select id="enqWeek" required value={form.weekId} onChange={(e) => update({ weekId: e.target.value })}>
              <option value="">Choose</option>
              {weeks.map((w) => (
                <option key={w.id} value={w.id}>
                  Week {w.weekNumber} · {formatDate(w.startDate)}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field span-2">
            <label htmlFor="enqCircle">Circle</label>
            <select id="enqCircle" required value={form.slotType} onChange={(e) => update({ slotType: e.target.value as LiveSlotType })}>
              <option value="">Choose</option>
              {circles.map((s) => (
                <option key={s.slotType} value={s.slotType}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field span-2">
            <label htmlFor="enqTime">Class time</label>
            <input id="enqTime" maxLength={60} required value={form.classTime} onChange={(e) => update({ classTime: e.target.value })} />
          </div>
          <div className="form-field span-4">
            <label htmlFor="enqRef">Payment reference (UPI or bank)</label>
            <input id="enqRef" maxLength={120} required value={form.paymentReference} onChange={(e) => update({ paymentReference: e.target.value })} />
          </div>
        </div>

        <div className="form-actions" style={{ marginTop: 12 }}>
          <button type="submit" className="btn btn--primary" disabled={saving || !canSubmit}>
            {saving ? 'Sending…' : 'Save and send class plan'}
          </button>
        </div>
      </form>

      <section className="card">
        <h2 className="card__title">Recent enquiries</h2>
        {enquiries === null ? (
          <p className="form-hint">Loading…</p>
        ) : enquiries.length === 0 ? (
          <p className="form-hint">No enquiries yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Course</th>
                  <th>Week and circle</th>
                  <th>Payment ref</th>
                  <th>Plan email</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {enquiries.map((e) => (
                  <tr key={e.id}>
                    <td>
                      {e.name}
                      <div className="form-hint">{e.email}</div>
                    </td>
                    <td>{e.courseName}</td>
                    <td>
                      Week {e.weekNumber} · {formatDate(e.startDate)}
                      <div className="form-hint">
                        {e.slotName} · {e.slotHours}
                      </div>
                    </td>
                    <td>{e.paymentReference}</td>
                    <td>{e.sentAt ? <span className="badge badge--published">Sent</span> : <span className="badge">Not sent</span>}</td>
                    <td>
                      {!e.sentAt && (
                        <button type="button" className="btn btn--sm" disabled={busyId === e.id} onClick={() => handleResend(e.id)}>
                          {busyId === e.id ? 'Sending…' : 'Send again'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
