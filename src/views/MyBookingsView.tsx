import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type { Booking, Me } from '../types';
import { confirmAction, haptic } from '../telegram';
import {
  formatDateHuman,
  formatPrice,
  PAYMENT_LABEL,
  PAYMENT_STATUS_LABEL,
  STATUS_LABEL,
  todayISO,
} from '../utils';

export default function MyBookingsView({ me, onBook }: { me: Me; onBook: () => void }) {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [payingId, setPayingId] = useState<number | null>(null);

  const load = useCallback(() => {
    api
      .myBookings()
      .then((r) => setBookings(r.bookings))
      .catch((e) => setError((e as Error).message));
  }, []);

  useEffect(load, [load]);

  const cancel = async (booking: Booking) => {
    const ok = await confirmAction(
      `${booking.field_name} — ${formatDateHuman(booking.date)} ${booking.start_time} vaqtidagi bronni bekor qilasizmi?`,
    );
    if (!ok) return;

    setBusyId(booking.id);
    try {
      await api.cancelBooking(booking.id);
      haptic('success');
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const pay = async (booking: Booking) => {
    setPayingId(booking.id);
    setError('');
    try {
      const res = await api.payBooking(booking.id);
      window.location.href = res.url;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPayingId(null);
    }
  };

  const today = todayISO();
  const upcoming = (bookings ?? [])
    .filter((b) => b.date >= today && b.status !== 'cancelled' && b.status !== 'completed')
    .sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));
  const history = (bookings ?? []).filter((b) => !upcoming.includes(b));

  return (
    <div className="stack">
      <section className="hello">
        <h2 className="hello__title">Mening bronlarim</h2>
        <p className="hello__text">Faol bronlar va o‘tgan buyurtmalar tarixi.</p>
      </section>

      {error && <div className="notice notice--error">{error}</div>}
      {!bookings && !error && (
        <>
          <div className="skeleton" />
          <div className="skeleton" />
        </>
      )}

      {bookings && bookings.length === 0 && (
        <div className="empty">
          <span className="empty__icon">🗓</span>
          <h3>Hozircha bron yo‘q</h3>
          <p>Maydonni tanlab, o‘zingizga qulay vaqtni band qiling.</p>
          <button className="btn" onClick={onBook}>
            Maydonlarni ko‘rish
          </button>
        </div>
      )}

      {upcoming.length > 0 && <h3 className="section__title">Faol bronlar</h3>}
      {upcoming.map((b) => (
        <BookingCard
          key={b.id}
          booking={b}
          onCancel={() => void cancel(b)}
          busy={busyId === b.id}
          onPay={() => void pay(b)}
          paying={payingId === b.id}
        />
      ))}

      {history.length > 0 && <h3 className="section__title section__title--spaced">Tarix</h3>}
      {history.map((b) => (
        <BookingCard key={b.id} booking={b} />
      ))}
    </div>
  );
}

function BookingCard({
  booking,
  onCancel,
  busy,
  onPay,
  paying,
}: {
  booking: Booking;
  onCancel?: () => void;
  busy?: boolean;
  onPay?: () => void;
  paying?: boolean;
}) {
  const canCancel = Boolean(onCancel) && booking.status !== 'cancelled';
  const needsPayment =
    Boolean(onPay) && booking.payment_method !== 'arrival' && booking.payment_status !== 'paid';
  const paymentClass =
    booking.payment_status === 'paid'
      ? 'badge--paid'
      : booking.payment_status === 'pending'
        ? 'badge--pending'
        : 'badge--unpaid';

  return (
    <article className="card card--pad booking">
      <div className="booking__head">
        <div>
          <h4 className="booking__title">{booking.field_name}</h4>
          <p className="booking__when">
            {formatDateHuman(booking.date)} · {booking.start_time} – {booking.end_time}
          </p>
        </div>
        <span className={`badge badge--${booking.status}`}>{STATUS_LABEL[booking.status]}</span>
      </div>

      <p className="booking__pay">
        <span className={`badge ${paymentClass}`}>
          {PAYMENT_LABEL[booking.payment_method]} · {PAYMENT_STATUS_LABEL[booking.payment_status]}
        </span>
      </p>

      <div className="booking__foot">
        <span className="booking__price">{formatPrice(booking.total_price)}</span>
        <div className="actions">
          {needsPayment && (
            <button className="btn btn--sm" disabled={paying} onClick={onPay}>
              {paying ? '…' : 'To‘lash'}
            </button>
          )}
          {canCancel && (
            <button className="btn btn--ghost btn--sm" disabled={busy} onClick={onCancel}>
              {busy ? '…' : 'Bekor qilish'}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
