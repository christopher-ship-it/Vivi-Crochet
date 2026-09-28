import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listCourses } from '../api/courses';
import { ApiClientError } from '../api/client';
import type { Course } from '../types';
import { formatDate, formatInr } from '../utils/format';

export function ViralProjectsPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await listCourses();
        if (!cancelled) setCourses(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Failed to load viral projects.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const projects = useMemo(() => {
    const term = query.trim().toLowerCase();
    return courses
      .filter((c) => c.type === 'ProjectCourse')
      .filter((c) => !term || c.name.toLowerCase().includes(term))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }, [courses, query]);

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-header__title">Viral Projects</h1>
          <p className="page-header__subtitle">
            Standalone projects (e.g. "Rose Crochet Bag") that can be offered free with the ₹999 Founding
            Membership. Manage which one is included on the{' '}
            <Link to="/special-offers" className="cell-link">Special Offers</Link> page.
          </p>
        </div>
        <div className="page-header__actions">
          <Link to="/courses/new?type=ProjectCourse" className="btn btn--primary">New viral project</Link>
        </div>
      </header>

      <form className="toolbar inline-form page-toolbar" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="viral-project-search" className="sr-only">Search</label>
        <input
          id="viral-project-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name"
          style={{ minWidth: 220 }}
        />
      </form>

      {loading && (
        <div className="loading-state">
          <p>Loading viral projects…</p>
        </div>
      )}

      {error && (
        <div className="error-state">
          <h3>Could not load viral projects</h3>
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && projects.length === 0 && (
        <div className="empty-state">
          <h3>No viral projects yet</h3>
          <p>Create one to offer it free with the Founding Membership.</p>
          <Link to="/courses/new?type=ProjectCourse" className="btn btn--primary">New viral project</Link>
        </div>
      )}

      {!loading && projects.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Price</th>
                <th>Videos</th>
                <th>Status</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id}>
                  <td>
                    <Link to={`/courses/${project.id}/edit`} className="cell-link cell-strong">
                      {project.name}
                    </Link>
                  </td>
                  <td>{project.price > 0 ? formatInr(project.price) : '—'}</td>
                  <td>{project.videoCount}</td>
                  <td>
                    <span className={`badge badge--${project.status.toLowerCase()}`}>{project.status}</span>
                  </td>
                  <td>{formatDate(project.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
