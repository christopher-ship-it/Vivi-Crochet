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
import type { Product, ProductType } from '../types';
import { formatDate, formatInr } from '../utils/format';
import { confirmDialog, alertDialog } from '../components/AppDialog';

const ROOM_OPTIONS: { id: ProductType; label: string; subtitle: string; emptyHint: string }[] = [
  {
    id: 'Handmade',
    label: 'Handmade Collection',
    subtitle: 'Shop handmade pieces made by VIVI',
    emptyHint: 'Create your first handmade shop product with name, description, and price.',
  },
  {
    id: 'Resell',
    label: 'Crochet Essentials',
    subtitle: 'Yarn, hooks, bag rings, handles, accessories, and other materials we stock',
    emptyHint: 'Add yarn, hooks, bag rings, handles, accessories, or other crochet materials.',
  },
];

function productTypeLabel(type: ProductType | undefined): string {
  return type === 'Resell' ? 'Crochet Essentials' : 'Handmade Collection';
}

export function ProductsPage() {
  const [room, setRoom] = useState<ProductType>('Handmade');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const activeRoom = ROOM_OPTIONS.find((r) => r.id === room) ?? ROOM_OPTIONS[0];
  const newProductHref = `/products/new?type=${room}`;

  async function loadProducts(productType: ProductType = room) {
    setLoading(true);
    setError(null);
    try {
      setProducts(await listProducts(productType));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load products.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProducts(room);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when room changes
  }, [room]);

  async function handleDelete(product: Product) {
    if (!await confirmDialog(`Delete "${product.name}"? This cannot be undone.`)) return;
    setActionId(product.id);
    try {
      await deleteProduct(product.id);
      await loadProducts();
    } catch (err) {
      void alertDialog(err instanceof ApiClientError ? err.message : 'Delete failed.', { title: 'Something went wrong' });
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
      void alertDialog(err instanceof ApiClientError ? err.message : 'Status change failed.', { title: 'Something went wrong' });
    } finally {
      setActionId(null);
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-header__title">Shop products</h1>
          <p className="page-header__subtitle">{activeRoom.subtitle}</p>
        </div>
        <div className="page-header__actions">
          <Link to={newProductHref} className="btn btn--primary">New product</Link>
        </div>
      </header>

      <div className="page-toolbar">
        <div className="live-view-switch" role="tablist" aria-label="Product room">
          {ROOM_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={room === option.id}
              className={`live-view-switch__btn${room === option.id ? ' live-view-switch__btn--active' : ''}`}
              onClick={() => setRoom(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="loading-state">
          <p>Loading products…</p>
        </div>
      )}

      {!loading && error && (
        <div className="error-state">
          <h3>Could not load products</h3>
          <p>{error}</p>
          <button type="button" className="btn" onClick={() => void loadProducts()}>Retry</button>
        </div>
      )}

      {!loading && !error && products.length === 0 && (
        <div className="empty-state">
          <h3>No {activeRoom.label.toLowerCase()} products yet</h3>
          <p>{activeRoom.emptyHint}</p>
          <Link to={newProductHref} className="btn btn--primary">Add your first product</Link>
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
                    <div className="cell-media">
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt=""
                          className="thumb-sm"
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
                  <td>{productTypeLabel(product.productType)}</td>
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
