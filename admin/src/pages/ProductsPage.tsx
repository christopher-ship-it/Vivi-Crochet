import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  deleteProduct,
  listProducts,
  publishProduct,
  unpublishProduct,
} from '../api/products';
import { ApiClientError } from '../api/client';
import { RowActionsMenu } from '../components/RowActionsMenu';
import type { Product } from '../types';
import { formatDate, formatInr } from '../utils/format';

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  async function loadProducts() {
    setLoading(true);
    setError(null);
    try {
      setProducts(await listProducts());
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load products.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProducts();
  }, []);

  async function handleDelete(product: Product) {
    if (!window.confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
    setActionId(product.id);
    try {
      await deleteProduct(product.id);
      await loadProducts();
    } catch (err) {
      alert(err instanceof ApiClientError ? err.message : 'Delete failed.');
    } finally {
      setActionId(null);
    }
  }

  async function handlePublishToggle(product: Product) {
    setActionId(product.id);
    try {
      if (product.status === 'Published') {
        await unpublishProduct(product.id);
      } else {
        await publishProduct(product.id);
      }
      await loadProducts();
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
          <h1 className="page-header__title">Shop products</h1>
          <p className="page-header__subtitle">Add products with description, price, and photos for the mobile shop</p>
        </div>
        <div className="page-header__actions">
          <Link to="/products/new" className="btn btn--primary">New product</Link>
        </div>
      </header>

      {loading && (
        <div className="loading-state">
          <p>Loading products…</p>
        </div>
      )}

      {!loading && error && (
        <div className="error-state">
          <h3>Could not load products</h3>
          <p>{error}</p>
          <button type="button" className="btn" onClick={loadProducts}>Retry</button>
        </div>
      )}

      {!loading && !error && products.length === 0 && (
        <div className="empty-state">
          <h3>No products yet</h3>
          <p>Create your first shop product with name, description, and price.</p>
          <Link to="/products/new" className="btn btn--primary">Add your first product</Link>
        </div>
      )}

      {!loading && !error && products.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Type</th>
                <th>Category</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Status</th>
                <th>Updated</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt=""
                          style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, border: '1px solid #eadfe3' }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 8,
                            background: 'var(--vivi-canvas)',
                            display: 'grid',
                            placeItems: 'center',
                            fontWeight: 700,
                            color: 'var(--vivi-muted)',
                          }}
                        >
                          {product.name.charAt(0)}
                        </div>
                      )}
                      <span style={{ fontWeight: 600 }}>{product.name}</span>
                    </div>
                  </td>
                  <td>{product.productType ?? 'Handmade'}</td>
                  <td>{product.category}</td>
                  <td>{formatInr(product.price)}</td>
                  <td>
                    {(product.availableStock ?? 0) <= 0
                      ? 'OUT OF STOCK'
                      : `${product.availableStock} available`}
                  </td>
                  <td>
                    <span className={`badge badge--${product.status.toLowerCase()}`}>
                      {product.status}
                    </span>
                  </td>
                  <td>{formatDate(product.updatedAt)}</td>
                  <td>
                    <div className="data-table__actions">
                      <RowActionsMenu
                        label={`Actions for ${product.name}`}
                        disabled={actionId === product.id}
                        items={[
                          { id: 'edit', label: 'Edit', to: `/products/${product.id}/edit` },
                          {
                            id: 'publish',
                            label: product.status === 'Published' ? 'Unpublish' : 'Publish',
                            onClick: () => void handlePublishToggle(product),
                          },
                          {
                            id: 'delete',
                            label: 'Delete',
                            danger: true,
                            onClick: () => void handleDelete(product),
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
