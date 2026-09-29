import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteShopSlot, listShopSlots, updateShopSlot } from '../api/shopSlots';
import { ApiClientError } from '../api/client';
import { RowActionsMenu } from '../components/RowActionsMenu';
import { alertDialog, confirmDialog } from '../components/AppDialog';
import type { ProductType, ShopSlot } from '../types';

const ROOMS: { id: ProductType; label: string; subtitle: string }[] = [
  { id: 'Handmade', label: 'Handmade Collection', subtitle: 'e.g. New Arrivals, Trending Bags, Best Sellers' },
  { id: 'Resell', label: 'Crochet Essentials', subtitle: 'e.g. Yarn, Crochet Hooks, Bag Rings, Handles' },
];

export function SlotsPage() {
  const [room, setRoom] = useState<ProductType>('Resell');
  const [slots, setSlots] = useState<ShopSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const activeRoom = ROOMS.find((r) => r.id === room) ?? ROOMS[0];
  const newHref = `/slots/new?type=${room}`;

  async function load(productType: ProductType = room) {
    setLoading(true);
    setError(null);
    try {
      setSlots(await listShopSlots(productType));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to load slots.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(room);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when room changes
  }, [room]);

  async function toggleActive(slot: ShopSlot) {
    setActionId(slot.slotId);
    try {
      await updateShopSlot(slot.slotId, {
        name: slot.slotName,
        productType: slot.productType,
        displayOrder: slot.displayOrder,
        isActive: !slot.isActive,      });
      await load();
    } catch (err) {
      void alertDialog(err instanceof ApiClientError ? err.message : 'Update failed.', { title: 'Something went wrong' });
    } finally {
      setActionId(null);
    }
  }

  async function handleDelete(slot: ShopSlot) {
    if (!await confirmDialog(`Delete slot "${slot.slotName}"? The products themselves are not deleted.`)) return;
    setActionId(slot.slotId);
    try {
      await deleteShopSlot(slot.slotId);
      await load();
    } catch (err) {
      void alertDialog(err instanceof ApiClientError ? err.message : 'Delete failed.', { title: 'Something went wrong' });
    } finally {
      setActionId(null);
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-header__title">Shop slots</h1>
          <p className="page-header__subtitle">
            Curated groups shown in the shop. One slot holds many products. {activeRoom.subtitle}
          </p>
        </div>
        <div className="page-header__actions">
          <Link to={newHref} className="btn btn--primary">New slot</Link>
        </div>
      </header>

      <div className="page-toolbar">
        <div className="live-view-switch" role="tablist" aria-label="Shop room">
          {ROOMS.map((option) => (
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

      {loading && <div className="loading-state"><p>Loading slots…</p></div>}

      {!loading && error && (
        <div className="error-state">
          <h3>Could not load slots</h3>
          <p>{error}</p>
          <button type="button" className="btn" onClick={() => void load()}>Retry</button>
        </div>
      )}

      {!loading && !error && slots.length === 0 && (
        <div className="empty-state">
          <h3>No {activeRoom.label.toLowerCase()} slots yet</h3>
          <p>
            Without slots the shop keeps showing its normal category grid. Create a slot such as
            &ldquo;{room === 'Resell' ? 'Yarn' : 'New Arrivals'}&rdquo; and add products to it.
          </p>
          <Link to={newHref} className="btn btn--primary">Create your first slot</Link>
        </div>
      )}

      {!loading && !error && slots.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Slot</th>
                <th>Products</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {slots.map((slot) => (
                <tr key={slot.slotId}>
                  <td>{slot.displayOrder}</td>
                  <td>
                    <Link to={`/slots/${slot.slotId}/edit`} style={{ fontWeight: 600 }}>{slot.slotName}</Link>
                  </td>
                  <td>
                    <div className="slot-thumbs">
                      {slot.products.slice(0, 5).map((p) => (
                        p.imageUrl
                          ? <img key={p.id} src={p.imageUrl} alt="" className="slot-thumbs__img" />
                          : <span key={p.id} className="slot-thumbs__img slot-thumbs__img--blank">{p.name.charAt(0)}</span>
                      ))}
                      <span className="slot-thumbs__count">
                        {slot.productCount} {slot.productCount === 1 ? 'product' : 'products'}
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className={`badge badge--${slot.isActive ? 'active' : 'inactive'}`}>
                      {slot.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div className="data-table__actions">
                      <RowActionsMenu
                        label={`Actions for ${slot.slotName}`}
                        disabled={actionId === slot.slotId}
                        items={[
                          { id: 'edit', label: 'Edit', to: `/slots/${slot.slotId}/edit` },
                          {
                            id: 'toggle',
                            label: slot.isActive ? 'Deactivate' : 'Activate',
                            onClick: () => void toggleActive(slot),
                          },
                          { id: 'delete', label: 'Delete', danger: true, onClick: () => void handleDelete(slot) },
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
