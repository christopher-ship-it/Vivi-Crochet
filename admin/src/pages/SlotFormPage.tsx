import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { listProducts } from '../api/products';
import {
  createShopSlot,
  getShopSlot,
  replaceShopSlotProducts,
  updateShopSlot,
} from '../api/shopSlots';
import { ApiClientError } from '../api/client';
import type { Product, ProductType, ShopSlot } from '../types';
import { formatInr } from '../utils/format';

const ROOM_LABEL: Record<ProductType, string> = {
  Handmade: 'Handmade Collection',
  Resell: 'Crochet Essentials',
};

function Thumb({ product }: { product: Product }) {
  return product.imageUrl
    ? <img src={product.imageUrl} alt="" className="thumb-sm" />
    : <span className="thumb-sm slot-thumb-blank">{product.name.charAt(0)}</span>;
}

function stockLabel(p: Product): string {
  return (p.availableStock ?? 0) <= 0 ? 'Out of stock' : `${p.availableStock} in stock`;
}

export function SlotFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [name, setName] = useState('');
  const [room, setRoom] = useState<ProductType>(searchParams.get('type') === 'Handmade' ? 'Handmade' : 'Resell');
  const [displayOrder, setDisplayOrder] = useState<number | ''>(0);
  const [isActive, setIsActive] = useState(true);
  const [original, setOriginal] = useState<ShopSlot | null>(null);
  const [selected, setSelected] = useState<Product[]>([]);

  const [catalog, setCatalog] = useState<Product[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getShopSlot(id)
      .then((slot) => {
        if (cancelled) return;
        setOriginal(slot);
        setName(slot.slotName);
        setRoom(slot.productType);
        setDisplayOrder(slot.displayOrder);
        setIsActive(slot.isActive);
        setSelected(slot.products);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiClientError ? err.message : 'Failed to load the slot.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id]);

  // Catalog is always limited to the slot's room so wrong-room products can never be picked.
  useEffect(() => {
    let cancelled = false;
    setCatalogError(null);
    listProducts(room)
      .then((items) => { if (!cancelled) setCatalog(items); })
      .catch((err) => {
        if (!cancelled) setCatalogError(err instanceof ApiClientError ? err.message : 'Failed to load products.');
      });
    return () => { cancelled = true; };
  }, [room]);

  const selectedIds = useMemo(() => new Set(selected.map((p) => p.id)), [selected]);

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    const pool = catalog.filter((p) => p.productType === room);
    if (!term) return pool;
    return pool.filter((p) =>
      p.name.toLowerCase().includes(term)
      || (p.productCode ?? '').toLowerCase().includes(term));
  }, [catalog, query, room]);

  function addProduct(product: Product) {
    if (selectedIds.has(product.id) || product.productType !== room) return;
    setSelected((list) => [...list, product]);
  }

  function removeProduct(productId: string) {
    setSelected((list) => list.filter((p) => p.id !== productId));
  }

  function moveProduct(from: number, to: number) {
    if (to < 0 || to >= selected.length || from === to) return;
    setSelected((list) => {
      const next = [...list];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Enter a slot name.');
      return;
    }
    setSaving(true);
    setError(null);
    const details = {
      name: name.trim(),
      productType: room,
      displayOrder: displayOrder === '' ? 0 : displayOrder,
    };
    const ids = selected.map((p) => p.id);
    const productsChanged = !original
      || ids.length !== original.products.length
      || ids.some((pid, i) => original.products[i]?.id !== pid);
    try {
      // The API only edits products of an active slot, so keep it active while the list is written.
      const activeDuringWrite = isActive || productsChanged;
      let slot = id
        ? await updateShopSlot(id, { ...details, isActive: activeDuringWrite })
        : await createShopSlot({ ...details, isActive: activeDuringWrite });
      if (productsChanged) {
        slot = await replaceShopSlotProducts(slot.slotId, ids);
        if (!isActive) {
          slot = await updateShopSlot(slot.slotId, { ...details, isActive: false });
        }
      }
      navigate('/slots');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="loading-state"><p>Loading slot…</p></div>;
  }

  const roomLocked = selected.length > 0;

  return (
    <>
      <header className="page-header page-header--compact">
        <div>
          <h1 className="page-header__title">{isEdit ? 'Edit slot' : 'New slot'} · {ROOM_LABEL[room]}</h1>
          <p className="page-header__subtitle">One slot groups many products. Products are references to your catalog.</p>
        </div>
        <div className="page-header__actions">
          <Link to="/slots" className="btn btn--ghost">Cancel</Link>
        </div>
      </header>

      <form className="card form-dense" onSubmit={handleSubmit}>
        {error && <div className="form-error">{error}</div>}

        <div className="form-grid-6">
          <div className="form-field span-3">
            <label htmlFor="slotName">Slot name</label>
            <input
              id="slotName"
              required
              maxLength={80}
              placeholder={room === 'Resell' ? 'e.g. Yarn' : 'e.g. New Arrivals'}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="form-field span-2">
            <label htmlFor="slotRoom">Room</label>
            <select
              id="slotRoom"
              value={room}
              disabled={roomLocked}
              title={roomLocked ? 'Remove all products before changing the room' : undefined}
              onChange={(e) => setRoom(e.target.value as ProductType)}
            >
              <option value="Handmade">Handmade Collection</option>
              <option value="Resell">Crochet Essentials</option>
            </select>
          </div>
          <div className="form-field span-1">
            <label htmlFor="slotOrder" title="Lower numbers appear first.">Display order</label>
            <input
              id="slotOrder"
              type="number"
              value={displayOrder}
              onChange={(e) => setDisplayOrder(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </div>
          <div className="form-field form-field--checkbox span-6">
            <input id="slotActive" type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            <label htmlFor="slotActive">Active — shown in the mobile shop</label>
          </div>
        </div>

        <section className="slot-editor" aria-label="Products in this slot">
          <div className="slot-editor__diagram" aria-hidden>
            <span className="slot-editor__slotchip">{name.trim() || 'Slot'}</span>
            <span className="slot-editor__arrow">→</span>
            <span className="slot-editor__many">{selected.length} {selected.length === 1 ? 'product' : 'products'}</span>
          </div>
          <div className="slot-editor__head">
            <h2 className="slot-editor__title">Products in this slot: {selected.length}</h2>
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => setPickerOpen((v) => !v)}>
              {pickerOpen ? 'Close picker' : '+ Add product'}
            </button>
          </div>

          {selected.length === 0 ? (
            <p className="slot-editor__empty">No products yet. Use “+ Add product” to search the catalog.</p>
          ) : (
            <ol className="slot-list">
              {selected.map((product, index) => (
                <li
                  key={product.id}
                  className={`slot-list__row${dragIndex === index ? ' slot-list__row--drag' : ''}`}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragIndex !== null) moveProduct(dragIndex, index);
                    setDragIndex(null);
                  }}
                  onDragEnd={() => setDragIndex(null)}
                >
                  <span className="slot-list__grip" aria-hidden title="Drag to reorder">⋮⋮</span>
                  <span className="slot-list__num">{index + 1}</span>
                  <span className="slot-list__code">{product.productCode ?? '—'}</span>
                  <Thumb product={product} />
                  <span className="slot-list__name cell-clip">
                    {product.name}
                    {product.status !== 'Published' && <span className="badge badge--draft slot-list__badge">Draft</span>}
                  </span>
                  <span className="slot-list__price">{formatInr(product.price)}</span>
                  <span className="slot-list__actions">
                    <button type="button" className="btn btn--ghost btn--sm" aria-label={`Move ${product.name} up`}
                      disabled={index === 0} onClick={() => moveProduct(index, index - 1)}>↑</button>
                    <button type="button" className="btn btn--ghost btn--sm" aria-label={`Move ${product.name} down`}
                      disabled={index === selected.length - 1} onClick={() => moveProduct(index, index + 1)}>↓</button>
                    <button type="button" className="btn btn--danger btn--sm" onClick={() => removeProduct(product.id)}>Remove</button>
                  </span>
                </li>
              ))}
            </ol>
          )}

          {pickerOpen && (
            <div className="slot-picker">
              <div className="slot-picker__head">
                <input
                  type="search"
                  autoFocus
                  placeholder="Search by product name or code (e.g. DIS039)"
                  aria-label="Search products"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <span className="slot-picker__hint">{ROOM_LABEL[room]} products only</span>
              </div>
              {catalogError && <div className="form-error">{catalogError}</div>}
              {!catalogError && matches.length === 0 && (
                <p className="slot-editor__empty">No matching {ROOM_LABEL[room]} products.</p>
              )}
              <ul className="slot-picker__list">
                {matches.map((product) => {
                  const added = selectedIds.has(product.id);
                  return (
                    <li key={product.id} className="slot-picker__row">
                      <Thumb product={product} />
                      <span className="slot-picker__main">
                        <span className="cell-clip" style={{ fontWeight: 600 }}>{product.name}</span>
                        <span className="slot-picker__meta">
                          {product.productCode ?? 'No code'} · {formatInr(product.price)} · {stockLabel(product)} · {ROOM_LABEL[product.productType]}
                          {product.status !== 'Published' ? ' · Draft' : ''}
                        </span>
                      </span>
                      <button type="button" className="btn btn--secondary btn--sm" disabled={added} onClick={() => addProduct(product)}>
                        {added ? 'Added' : 'Add'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>

        <div className="form-actions">
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save slot'}
          </button>
          <Link to="/slots" className="btn btn--ghost">Cancel</Link>
        </div>
      </form>
    </>
  );
}
