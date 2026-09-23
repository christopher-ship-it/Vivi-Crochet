import { useEffect, useMemo, useState } from 'react';
import {
  listAdminLiveBookings,
  listAdminLiveWeeks,
  ensureLiveSeason,
  setLiveSlotBlocked,
  setLiveSlotCapacity,
  requestLiveTutorPhotoUploadUrl,
  completeLiveTutorPhotoUpload,
  deleteLiveTutorPhoto,
  setLiveWeekTutor,
} from '../api/live';
import { ApiClientError } from '../api/client';
import {
  findWeekIndexForToday,
  LiveBookingsCalendar,
} from '../components/LiveBookingsCalendar';
import { RowActionsMenu } from '../components/RowActionsMenu';
import type { AdminLiveBookingListItem, AdminLiveWeek, LiveBookingStatus } from '../types';
import { formatDate, formatInr, validateImageFile } from '../utils/format';
import { uploadToBlob } from '../utils/videoUpload';

const STATUS_OPTIONS: Array<LiveBookingStatus | ''> = [
  '',
  'PendingPayment',
  'Confirmed',
  'Cancelled',
  'Expired',
];

type ViewMode = 'table' | 'calendar';
type SlotType = 'Morning' | 'Evening';

type ModifyDialog = {
  slotType: SlotType;
  capacity: number;
};

type BlockDialog = {
  slotType: SlotType;
  nextBlocked: boolean;
};

function badgeClass(status: string): string {
  const key = status.toLowerCase();
  if (key === 'pendingpayment') return 'badge badge--pending';
  if (key === 'confirmed') return 'badge badge--published';
  if (key === 'cancelled' || key === 'expired') return 'badge badge--inactive';
  return `badge badge--${key}`;
}

function patchWeekSlot(
  weeks: AdminLiveWeek[],
  weekId: string,
  slotType: SlotType,
  patch: Partial<AdminLiveWeek['slots'][number]>,
): AdminLiveWeek[] {
  return weeks.map((week) => {
    if (week.id !== weekId) return week;
    return {
      ...week,
      slots: week.slots.map((slot) =>
        slot.slotType === slotType
          ? {
              ...slot,
              ...patch,
              seatsRemaining:
                patch.isBlocked === true
                  ? 0
                  : Math.max(
                      0,
                      (patch.seatCapacity ?? slot.seatCapacity) - (patch.seatsBooked ?? slot.seatsBooked),
                    ),
              status:
                patch.isBlocked === true
                  ? 'Blocked'
                  : patch.isBlocked === false
                    ? (patch.seatCapacity ?? slot.seatCapacity) -
                        (patch.seatsBooked ?? slot.seatsBooked) <=
                      0
                      ? 'FullyBooked'
                      : 'Available'
                    : patch.status ?? slot.status,
            }
          : slot,
      ),
    };
  });
}

export function LiveBookingsPage() {
  const [view, setView] = useState<ViewMode>('table');
  const [bookings, setBookings] = useState<AdminLiveBookingListItem[]>([]);
  const [status, setStatus] = useState<LiveBookingStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [weeks, setWeeks] = useState<AdminLiveWeek[]>([]);
  const [weekIndex, setWeekIndex] = useState(0);
  const [calendarBookings, setCalendarBookings] = useState<AdminLiveBookingListItem[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [weeksLoaded, setWeeksLoaded] = useState(false);
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const [modifyDialog, setModifyDialog] = useState<ModifyDialog | null>(null);
  const [modifyValue, setModifyValue] = useState('4');
  const [blockDialog, setBlockDialog] = useState<BlockDialog | null>(null);
  const [tutorUploading, setTutorUploading] = useState(false);
  const [tutorUploadError, setTutorUploadError] = useState<string | null>(null);
  const [tutorNameDraft, setTutorNameDraft] = useState('SRI');
  const [tutorNameSaving, setTutorNameSaving] = useState(false);

  const selectedWeek = useMemo(
    () => (weeks.length > 0 ? weeks[weekIndex] ?? null : null),
    [weeks, weekIndex],
  );

  useEffect(() => {
    setTutorNameDraft(selectedWeek?.tutorName?.trim() || 'SRI');
    setTutorUploadError(null);
  }, [selectedWeek?.id, selectedWeek?.tutorName]);

  async function reloadWeeks(keepIndex = true) {
    let data = await listAdminLiveWeeks();
    if (data.length === 0) {
      await ensureLiveSeason();
      data = await listAdminLiveWeeks();
    }
    const sorted = [...data].sort((a, b) => a.startDate.localeCompare(b.startDate));
    setWeeks(sorted);
    setWeekIndex((prev) => {
      if (keepIndex && sorted[prev]) return prev;
      return Math.max(0, findWeekIndexForToday(sorted));
    });
    setWeeksLoaded(true);
  }

  // Table view — existing behavior
  useEffect(() => {
    if (view !== 'table') return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await listAdminLiveBookings({ status });
        if (!cancelled) setBookings(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Failed to load bookings.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [status, view]);

  // Load weeks once when opening calendar
  useEffect(() => {
    if (view !== 'calendar' || weeksLoaded) return;
    let cancelled = false;
    async function loadWeeks() {
      setCalendarLoading(true);
      setCalendarError(null);
      try {
        await reloadWeeks(false);
      } catch (err) {
        if (!cancelled) {
          setCalendarError(
            err instanceof ApiClientError ? err.message : 'Failed to load live weeks.',
          );
        }
      } finally {
        if (!cancelled) setCalendarLoading(false);
      }
    }
    void loadWeeks();
    return () => {
      cancelled = true;
    };
  }, [view, weeksLoaded]);

  // Calendar bookings for selected week + status filter
  useEffect(() => {
    if (view !== 'calendar' || !selectedWeek) return;
    let cancelled = false;
    async function loadWeekBookings() {
      setCalendarLoading(true);
      setCalendarError(null);
      try {
        const data = await listAdminLiveBookings({
          status,
          weekNumber: selectedWeek!.weekNumber,
          seasonYear: selectedWeek!.seasonYear,
        });
        if (!cancelled) setCalendarBookings(data);
      } catch (err) {
        if (!cancelled) {
          setCalendarError(
            err instanceof ApiClientError ? err.message : 'Failed to load week bookings.',
          );
        }
      } finally {
        if (!cancelled) setCalendarLoading(false);
      }
    }
    void loadWeekBookings();
    return () => {
      cancelled = true;
    };
  }, [view, selectedWeek, status]);

  function openModify(slotType: SlotType, currentCapacity: number) {
    setActionError(null);
    setModifyDialog({ slotType, capacity: currentCapacity });
    setModifyValue(String(currentCapacity));
  }

  function openBlock(slotType: SlotType, nextBlocked: boolean) {
    setActionError(null);
    setBlockDialog({ slotType, nextBlocked });
  }

  async function confirmModify() {
    if (!selectedWeek || !modifyDialog) return;
    const seatCapacity = Number.parseInt(modifyValue, 10);
    if (!Number.isFinite(seatCapacity) || seatCapacity < 1) {
      setActionError('Seat capacity must be a number of at least 1.');
      return;
    }

    setBusySlot(modifyDialog.slotType);
    setActionError(null);
    try {
      await setLiveSlotCapacity(selectedWeek.id, modifyDialog.slotType, seatCapacity);
      setWeeks((prev) =>
        patchWeekSlot(prev, selectedWeek.id, modifyDialog.slotType, { seatCapacity }),
      );
      await reloadWeeks(true);
      setModifyDialog(null);
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : 'Could not update capacity.');
    } finally {
      setBusySlot(null);
    }
  }

  async function confirmBlock() {
    if (!selectedWeek || !blockDialog) return;

    setBusySlot(blockDialog.slotType);
    setActionError(null);
    try {
      await setLiveSlotBlocked(selectedWeek.id, blockDialog.slotType, blockDialog.nextBlocked);
      setWeeks((prev) =>
        patchWeekSlot(prev, selectedWeek.id, blockDialog.slotType, {
          isBlocked: blockDialog.nextBlocked,
          status: blockDialog.nextBlocked ? 'Blocked' : 'Available',
        }),
      );
      await reloadWeeks(true);
      setBlockDialog(null);
    } catch (err) {
      setActionError(
        err instanceof ApiClientError
          ? err.message
          : `Could not ${blockDialog.nextBlocked ? 'block' : 'unblock'} slot.`,
      );
    } finally {
      setBusySlot(null);
    }
  }

  async function handleTutorPhotoSelect(fileList: FileList | null) {
    if (!selectedWeek || !fileList?.length) return;
    const file = fileList[0];
    const validation = validateImageFile(file);
    if (!validation.valid) {
      setTutorUploadError(validation.error ?? 'Invalid image');
      return;
    }

    setTutorUploading(true);
    setTutorUploadError(null);
    try {
      const ticket = await requestLiveTutorPhotoUploadUrl(selectedWeek.id, {
        fileName: file.name,
        contentType: validation.contentType ?? file.type,
        fileSizeBytes: file.size,
      });
      const uploadResult = await uploadToBlob(
        ticket.uploadUrl,
        file,
        validation.contentType ?? file.type,
      );
      if (!uploadResult.success) {
        throw new Error(uploadResult.error ?? 'Upload failed');
      }
      const updated = await completeLiveTutorPhotoUpload(selectedWeek.id, {
        blobPath: ticket.blobPath,
        fileSizeBytes: file.size,
        contentType: validation.contentType ?? file.type,
      });
      setWeeks((prev) => prev.map((w) => (w.id === updated.id ? { ...w, ...updated } : w)));
    } catch (err) {
      setTutorUploadError(err instanceof Error ? err.message : 'Tutor photo upload failed.');
    } finally {
      setTutorUploading(false);
    }
  }

  async function handleRemoveTutorPhoto() {
    if (!selectedWeek?.tutorPhotoUrl) return;
    if (!window.confirm('Remove this tutor photo? The app will show the placeholder again.')) {
      return;
    }
    setTutorUploading(true);
    setTutorUploadError(null);
    try {
      const updated = await deleteLiveTutorPhoto(selectedWeek.id);
      setWeeks((prev) => prev.map((w) => (w.id === updated.id ? { ...w, ...updated } : w)));
    } catch (err) {
      setTutorUploadError(
        err instanceof ApiClientError ? err.message : 'Could not remove tutor photo.',
      );
    } finally {
      setTutorUploading(false);
    }
  }

  async function handleSaveTutorName() {
    if (!selectedWeek) return;
    const name = tutorNameDraft.trim();
    if (!name) {
      setTutorUploadError('Tutor name is required.');
      return;
    }
    setTutorNameSaving(true);
    setTutorUploadError(null);
    try {
      const updated = await setLiveWeekTutor(selectedWeek.id, name);
      setWeeks((prev) => prev.map((w) => (w.id === updated.id ? { ...w, ...updated } : w)));
      setTutorNameDraft(updated.tutorName?.trim() || name);
    } catch (err) {
      setTutorUploadError(
        err instanceof ApiClientError ? err.message : 'Could not save tutor name.',
      );
    } finally {
      setTutorNameSaving(false);
    }
  }

  return (
    <>
      <header className="page-header page-header--live">
        <div>
          <h1 className="page-header__title">Live classes</h1>
          <p className="page-header__subtitle">
            Track Morning and Evening Crochet Circle bookings from the app.
          </p>
        </div>

        {view === 'calendar' && selectedWeek ? (
          <div className="live-cal__tutor live-cal__tutor--header">
            <div className="live-cal__tutor-preview" aria-hidden={!selectedWeek.tutorPhotoUrl}>
              {selectedWeek.tutorPhotoUrl ? (
                <img
                  src={selectedWeek.tutorPhotoUrl}
                  alt={`${tutorNameDraft.trim() || selectedWeek.tutorName || 'SRI'} portrait`}
                />
              ) : (
                <div className="live-cal__tutor-placeholder">
                  <span>{(tutorNameDraft.trim() || selectedWeek.tutorName?.trim() || 'SRI').toUpperCase()}</span>
                  <small>Photo</small>
                </div>
              )}
            </div>
            <div className="live-cal__tutor-copy">
              <div className="live-cal__tutor-label">Tutor for this week</div>
              <div className="live-cal__tutor-name-row">
                <input
                  className="live-cal__tutor-name-input"
                  type="text"
                  value={tutorNameDraft}
                  onChange={(e) => setTutorNameDraft(e.target.value)}
                  maxLength={100}
                  aria-label="Tutor name for this week"
                  disabled={tutorNameSaving || tutorUploading}
                />
                <button
                  type="button"
                  className="btn btn--secondary"
                  disabled={
                    tutorNameSaving ||
                    tutorUploading ||
                    tutorNameDraft.trim() === (selectedWeek.tutorName?.trim() || 'SRI')
                  }
                  onClick={() => void handleSaveTutorName()}
                >
                  {tutorNameSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
              <p className="live-cal__tutor-hint">
                Per week · <strong>1200×1500</strong> (4:5), JPG/WebP, max 5 MB
              </p>
              {tutorUploadError ? <p className="form-error">{tutorUploadError}</p> : null}
              <div className="live-cal__tutor-actions">
                <label className={`btn btn--secondary ${tutorUploading ? 'is-disabled' : ''}`}>
                  {tutorUploading
                    ? 'Uploading…'
                    : selectedWeek.tutorPhotoUrl
                      ? 'Replace'
                      : 'Upload photo'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                    hidden
                    disabled={tutorUploading}
                    onChange={(e) => {
                      void handleTutorPhotoSelect(e.target.files);
                      e.target.value = '';
                    }}
                  />
                </label>
                {selectedWeek.tutorPhotoUrl ? (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={tutorUploading}
                    onClick={() => void handleRemoveTutorPhoto()}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </header>

      <div className="toolbar live-bookings-toolbar">
        <div className="live-view-switch" role="tablist" aria-label="Live classes view">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'table'}
            className={`live-view-switch__btn${view === 'table' ? ' live-view-switch__btn--active' : ''}`}
            onClick={() => setView('table')}
          >
            Table
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'calendar'}
            className={`live-view-switch__btn${view === 'calendar' ? ' live-view-switch__btn--active' : ''}`}
            onClick={() => setView('calendar')}
          >
            Calendar
          </button>
        </div>

        <label htmlFor="live-status-filter" style={{ fontWeight: 600 }}>
          Status
        </label>
        <select
          id="live-status-filter"
          value={status}
          onChange={(e) => setStatus(e.target.value as LiveBookingStatus | '')}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt || 'all'} value={opt}>
              {opt || 'All'}
            </option>
          ))}
        </select>
      </div>

      {view === 'calendar' ? (
        <>
          {actionError ? (
            <div className="error-state" style={{ marginBottom: 12 }}>
              <h3>Could not update slot</h3>
              <p>{actionError}</p>
            </div>
          ) : null}
          <LiveBookingsCalendar
            week={selectedWeek}
            weeks={weeks}
            weekIndex={weekIndex}
            bookings={calendarBookings}
            statusFilter={status}
            loading={calendarLoading}
            error={calendarError}
            busySlot={busySlot}
            onPreviousWeek={() => setWeekIndex((i) => Math.max(0, i - 1))}
            onNextWeek={() => setWeekIndex((i) => Math.min(weeks.length - 1, i + 1))}
            onBlockSlot={(slotType, isBlocked) => openBlock(slotType, isBlocked)}
            onModifyCapacity={(slotType, current) => openModify(slotType, current)}
          />
        </>
      ) : (
        <>
          {loading && (
            <div className="loading-state">
              <p>Loading bookings…</p>
            </div>
          )}

          {error && (
            <div className="error-state">
              <h3>Could not load bookings</h3>
              <p>{error}</p>
            </div>
          )}

          {!loading && !error && bookings.length === 0 && (
            <div className="empty-state">
              <h3>No live bookings yet</h3>
              <p>Confirmed and pending seat holds from the mobile app will appear here.</p>
            </div>
          )}

          {!loading && !error && bookings.length > 0 && (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Week</th>
                    <th>Slot</th>
                    <th>Customer</th>
                    <th>Phone</th>
                    <th>Status</th>
                    <th>Order</th>
                    <th>Amount</th>
                    <th>Payment</th>
                    <th>Booked</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((booking) => (
                    <tr key={booking.id}>
                      <td style={{ fontWeight: 600 }}>
                        W{booking.weekNumber} · {booking.seasonYear}
                      </td>
                      <td>{booking.slotName || booking.slotType}</td>
                      <td>{booking.customerName || '—'}</td>
                      <td>{booking.customerPhone || '—'}</td>
                      <td>
                        <span className={badgeClass(booking.status)}>{booking.status}</span>
                      </td>
                      <td>{booking.orderNumber || '—'}</td>
                      <td>{formatInr(booking.totalAmount)}</td>
                      <td>{booking.paymentStatus ?? '—'}</td>
                      <td>{formatDate(booking.createdAt)}</td>
                      <td>
                        <div className="data-table__actions">
                          <RowActionsMenu
                            label={`Actions for booking ${booking.orderNumber || booking.id}`}
                            items={[
                              {
                                id: 'view',
                                label: 'View booking',
                                to: `/live/bookings/${booking.id}`,
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
      )}

      {modifyDialog && selectedWeek ? (
        <div
          className="modal-backdrop"
          onClick={() => !busySlot && setModifyDialog(null)}
          role="presentation"
        >
          <div
            className="modal modal--sm"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="modify-slot-title"
          >
            <div className="modal__header">
              <h2 id="modify-slot-title" className="modal__title">
                Modify {modifyDialog.slotType}
              </h2>
              <button
                type="button"
                className="btn btn--ghost btn--icon"
                disabled={Boolean(busySlot)}
                onClick={() => setModifyDialog(null)}
              >
                ✕
              </button>
            </div>
            <p className="modal__hint">
              Week {selectedWeek.weekNumber} · {selectedWeek.seasonYear}. Change how many seats
              customers can book for this circle.
            </p>
            <div className="form-field">
              <label htmlFor="slot-capacity">Seat capacity</label>
              <input
                id="slot-capacity"
                type="number"
                min={1}
                max={4}
                value={modifyValue}
                onChange={(e) => setModifyValue(e.target.value)}
                autoFocus
              />
            </div>
            <div className="modal__footer">
              <button
                type="button"
                className="btn btn--ghost"
                disabled={Boolean(busySlot)}
                onClick={() => setModifyDialog(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={Boolean(busySlot)}
                onClick={() => void confirmModify()}
              >
                {busySlot === modifyDialog.slotType ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {blockDialog && selectedWeek ? (
        <div
          className="modal-backdrop"
          onClick={() => !busySlot && setBlockDialog(null)}
          role="presentation"
        >
          <div
            className="modal modal--sm"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="block-slot-title"
          >
            <div className="modal__header">
              <h2 id="block-slot-title" className="modal__title">
                {blockDialog.nextBlocked ? 'Block' : 'Unblock'} {blockDialog.slotType}
              </h2>
              <button
                type="button"
                className="btn btn--ghost btn--icon"
                disabled={Boolean(busySlot)}
                onClick={() => setBlockDialog(null)}
              >
                ✕
              </button>
            </div>
            <p className="modal__hint">
              Week {selectedWeek.weekNumber} · {selectedWeek.seasonYear}.{' '}
              {blockDialog.nextBlocked
                ? 'Customers will not be able to book this circle. Existing bookings stay.'
                : 'Customers can book this circle again.'}
            </p>
            <div className="modal__footer">
              <button
                type="button"
                className="btn btn--ghost"
                disabled={Boolean(busySlot)}
                onClick={() => setBlockDialog(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={Boolean(busySlot)}
                onClick={() => void confirmBlock()}
              >
                {busySlot === blockDialog.slotType
                  ? 'Saving…'
                  : blockDialog.nextBlocked
                    ? 'Block slot'
                    : 'Unblock slot'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
