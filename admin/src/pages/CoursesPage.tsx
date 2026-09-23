import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listCourses, deleteCourse, publishCourse, unpublishCourse } from '../api/courses';
import { ApiClientError } from '../api/client';
import { RowActionsMenu } from '../components/RowActionsMenu';
import type { Course } from '../types';
import { COURSE_TYPE_LABELS, formatDate, formatInr } from '../utils/format';

export function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  async function loadCourses() {
    setLoading(true);
    setError(null);
    try {
      setCourses(await listCourses());
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load courses.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCourses();
  }, []);

  async function handleDelete(course: Course) {
    if (!window.confirm(`Delete "${course.name}" and all its videos? This cannot be undone.`)) return;
    setActionId(course.id);
    try {
      await deleteCourse(course.id);
      await loadCourses();
    } catch (err) {
      alert(err instanceof ApiClientError ? err.message : 'Delete failed.');
    } finally {
      setActionId(null);
    }
  }

  async function handlePublishToggle(course: Course) {
    setActionId(course.id);
    try {
      if (course.status === 'Published') {
        await unpublishCourse(course.id);
      } else {
        await publishCourse(course.id);
      }
      await loadCourses();
    } catch (err) {
      alert(err instanceof ApiClientError ? err.message : 'Status change failed.');
    } finally {
      setActionId(null);
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-header__title">Courses & videos</h1>
          <p className="page-header__subtitle">
            Manage Learn &amp; Loop, Viral projects, and Trending Tutorials
          </p>
        </div>
        <div className="page-header__actions">
          <Link to="/courses/new" className="btn btn--primary">New course</Link>
        </div>
      </header>

      {loading && (
        <div className="loading-state">
          <p>Loading courses…</p>
        </div>
      )}

      {!loading && error && (
        <div className="error-state">
          <h3>Could not load courses</h3>
          <p>{error}</p>
          <button type="button" className="btn" onClick={loadCourses}>Retry</button>
        </div>
      )}

      {!loading && !error && courses.length === 0 && (
        <div className="empty-state">
          <h3>No courses yet</h3>
          <p>Create your first course to start uploading lessons.</p>
          <Link to="/courses/new" className="btn btn--primary">Create your first course</Link>
        </div>
      )}

      {!loading && !error && courses.length > 0 && (
        <div className="table-wrap">
          <table className="data-table data-table--courses">
            <thead>
              <tr>
                <th className="col-name">Name</th>
                <th className="col-category">Category</th>
                <th className="col-order">Order</th>
                <th className="col-type">Type</th>
                <th className="col-price">Price</th>
                <th className="col-videos">Videos</th>
                <th className="col-status">Status</th>
                <th className="col-updated">Updated</th>
                <th className="col-actions" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {courses.map((course) => (
                <tr key={course.id}>
                  <td className="col-name">
                    <Link to={`/courses/${course.id}`} className="cell-link" title={course.name}>
                      {course.name}
                    </Link>
                  </td>
                  <td className="col-category">
                    <span className="cell-clip" title={course.categoryName ?? undefined}>
                      {course.categoryName ?? '—'}
                    </span>
                  </td>
                  <td className="col-order">{course.sortOrder ?? 0}</td>
                  <td className="col-type">
                    <span className="cell-clip">
                      {COURSE_TYPE_LABELS[course.type] ?? course.type}
                    </span>
                  </td>
                  <td className="col-price">{formatInr(course.price)}</td>
                  <td className="col-videos">{course.videoCount}</td>
                  <td className="col-status">
                    <span className={`badge badge--${course.status.toLowerCase()}`}>
                      {course.status}
                    </span>
                  </td>
                  <td className="col-updated">{formatDate(course.updatedAt)}</td>
                  <td className="col-actions">
                    <div className="data-table__actions">
                      <RowActionsMenu
                        label={`Actions for ${course.name}`}
                        disabled={actionId === course.id}
                        items={[
                          { id: 'edit', label: 'Edit', to: `/courses/${course.id}/edit` },
                          { id: 'videos', label: 'Videos', to: `/courses/${course.id}` },
                          {
                            id: 'publish',
                            label: course.status === 'Published' ? 'Unpublish' : 'Publish',
                            onClick: () => void handlePublishToggle(course),
                          },
                          {
                            id: 'delete',
                            label: 'Delete',
                            danger: true,
                            onClick: () => void handleDelete(course),
                          },
                        ]}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
