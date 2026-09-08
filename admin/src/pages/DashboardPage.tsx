import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listCourses } from '../api/courses';
import { listVideos } from '../api/videos';
import { ApiClientError } from '../api/client';
import type { Course, Video } from '../types';
import { formatDate } from '../utils/format';

export function DashboardPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [courseData, videoData] = await Promise.all([listCourses(), listVideos()]);
        if (!cancelled) {
          setCourses(courseData);
          setVideos(videoData);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Failed to load dashboard.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const publishedCourses = courses.filter((c) => c.status === 'Published').length;
  const draftCourses = courses.filter((c) => c.status === 'Draft').length;
  const publishedVideos = videos.filter((v) => v.status === 'Published').length;

  const recentCourses = [...courses]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);

  if (loading) {
    return (
      <div className="loading-state">
        <p>Loading dashboard…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-state">
        <h3>Could not load dashboard</h3>
        <p>{error}</p>
        <button type="button" className="btn" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-header__title">Dashboard</h1>
          <p className="page-header__subtitle">Overview of your courses and videos</p>
        </div>
        <div className="page-header__actions">
          <Link to="/courses/new" className="btn btn--primary">New course</Link>
        </div>
      </header>

      <div className="form-grid" style={{ marginBottom: 32 }}>
        <div className="card card--stat">
          <span className="card__label">Total courses</span>
          <span className="card__value">{courses.length}</span>
        </div>
        <div className="card card--stat">
          <span className="card__label">Published courses</span>
          <span className="card__value">{publishedCourses}</span>
        </div>
        <div className="card card--stat">
          <span className="card__label">Draft courses</span>
          <span className="card__value">{draftCourses}</span>
        </div>
        <div className="card card--stat">
          <span className="card__label">Total videos</span>
          <span className="card__value">{videos.length}</span>
        </div>
      </div>

      <section>
        <h2 style={{ fontSize: 18, marginBottom: 16 }}>Recent courses</h2>
        {recentCourses.length === 0 ? (
          <div className="empty-state">
            <h3>No courses yet</h3>
            <p>Create your first course to start uploading lessons.</p>
            <Link to="/courses/new" className="btn btn--primary">Create your first course</Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Videos</th>
                  <th>Status</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {recentCourses.map((course) => (
                  <tr key={course.id}>
                    <td>
                      <Link to={`/courses/${course.id}`} style={{ fontWeight: 600 }}>
                        {course.name}
                      </Link>
                    </td>
                    <td>{course.videoCount}</td>
                    <td>
                      <span className={`badge badge--${course.status.toLowerCase()}`}>
                        {course.status}
                      </span>
                    </td>
                    <td>{formatDate(course.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {videos.length > 0 && (
        <section style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>Published videos</h2>
          <p className="page-header__subtitle" style={{ marginBottom: 16 }}>
            {publishedVideos} of {videos.length} videos published
          </p>
        </section>
      )}
    </>
  );
}
