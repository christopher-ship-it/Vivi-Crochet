import { useEffect, useState, type FormEvent } from 'react';
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from '../api/courses';
import { ApiClientError } from '../api/client';
import { RowActionsMenu } from '../components/RowActionsMenu';
import type { Category, CategoryRequest } from '../types';

type CategoryFormState = Omit<CategoryRequest, 'sortOrder'> & { sortOrder: number | '' };

const emptyForm: CategoryFormState = {
  name: '',
  description: '',
  sortOrder: '',
  isActive: true,
};

export function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CategoryFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setCategories(await listCategories());
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load categories.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyForm, sortOrder: categories.length });
    setShowForm(true);
  }

  function openEdit(category: Category) {
    setEditingId(category.id);
    setForm({
      name: category.name,
      description: category.description ?? '',
      sortOrder: category.sortOrder,
      isActive: category.isActive,
    });
    setShowForm(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: CategoryRequest = {
        ...form,
        sortOrder: form.sortOrder === '' ? 0 : form.sortOrder,
      };
      if (editingId) {
        await updateCategory(editingId, payload);
      } else {
        await createCategory(payload);
      }
      setShowForm(false);
      await load();
    } catch (err) {
      alert(err instanceof ApiClientError ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(category: Category) {
    if (!window.confirm(`Delete category "${category.name}"?`)) return;
    setActionId(category.id);
    try {
      await deleteCategory(category.id);
      await load();
    } catch (err) {
      alert(err instanceof ApiClientError ? err.message : 'Delete failed.');
    } finally {
      setActionId(null);
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-header__title">Categories</h1>
          <p className="page-header__subtitle">Learn tab groupings for courses</p>
        </div>
        <div className="page-header__actions">
          <button type="button" className="btn btn--primary" onClick={openCreate}>
            New category
          </button>
        </div>
      </header>

      {loading && (
        <div className="loading-state">
          <p>Loading categories…</p>
        </div>
      )}

      {!loading && error && (
        <div className="error-state">
          <h3>Could not load categories</h3>
          <p>{error}</p>
          <button type="button" className="btn" onClick={load}>Retry</button>
        </div>
      )}

      {!loading && !error && categories.length === 0 && (
        <div className="empty-state">
          <h3>No categories</h3>
          <p>Seeded categories appear after the API starts. You can also create new ones.</p>
          <button type="button" className="btn btn--primary" onClick={openCreate}>
            Create category
          </button>
        </div>
      )}

      {!loading && !error && categories.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Sort</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <tr key={cat.id}>
                  <td style={{ fontWeight: 600 }}>{cat.name}</td>
                  <td>{cat.description || '—'}</td>
                  <td>{cat.sortOrder}</td>
                  <td>
                    <span className={`badge badge--${cat.isActive ? 'published' : 'inactive'}`}>
                      {cat.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div className="data-table__actions">
                      <RowActionsMenu
                        label={`Actions for ${cat.name}`}
                        disabled={actionId === cat.id}
                        items={[
                          { id: 'edit', label: 'Edit', onClick: () => openEdit(cat) },
                          {
                            id: 'delete',
                            label: 'Delete',
                            danger: true,
                            onClick: () => void handleDelete(cat),
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

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)} role="presentation">
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="modal__header">
              <h2 className="modal__title">{editingId ? 'Edit category' : 'New category'}</h2>
              <button type="button" className="btn btn--ghost btn--icon" onClick={() => setShowForm(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                <div className="form-field form-grid--full">
                  <label htmlFor="cat-name">Name</label>
                  <input
                    id="cat-name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </div>
                <div className="form-field form-grid--full">
                  <label htmlFor="cat-desc">Description</label>
                  <textarea
                    id="cat-desc"
                    value={form.description ?? ''}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="cat-sort">Sort order</label>
                  <input
                    id="cat-sort"
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        sortOrder: e.target.value.trim() === '' ? '' : Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="form-field form-field--checkbox">
                  <input
                    id="cat-active"
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  />
                  <label htmlFor="cat-active">Active</label>
                </div>
              </div>
              <div className="modal__footer">
                <button type="button" className="btn btn--ghost" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn--primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
