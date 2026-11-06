import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../api';
import type { Booking, Field, Me, PaymentMethod, Slot } from '../types';
import {
  addDaysISO,
  formatDateFull,
  formatPrice,
  formatWorkingHours,
  MONTHS,
  PAYMENT_LABEL,
  PAYMENT_STATUS_LABEL,
  parseISODate,
  todayISO,
  WEEKDAYS,
} from '../utils';
import { haptic } from '../telegram';

const DAYS_AHEAD = 14;

const PAYMENT_OPTIONS: { id: PaymentMethod; icon: string; title: string; text: string }[] = [
  { id: 'payme', icon: '💳', title: 'Payme', text: 'Hozir onlayn to‘lash' },
  { id: 'click', icon: '💠', title: 'Click', text: 'Hozir onlayn to‘lash' },
  { id: 'arrival', icon: '💵', title: 'Joyida to‘lash', text: 'Maydonga kelganda naqd yoki karta' },
];

export default function BookingView({
  field,
  me,
  onBack,
  onGoToMy,
}: {
  field: Field;
  me: Me;
  onBack: () => void;
  onGoToMy: () => void;
}) {
  const [date, setDate] = useState(todayISO());
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [hours, setHours] = useState(1);
  const [name, setName] = useState(
    me.user ? `${me.user.first_name}${me.user.last_name ? ` ${me.user.last_name}` : ''}` : '',
  );
  const [phone, setPhone] = useState(me.phone ?? '+998');
  const [payment, setPayment] = useState<PaymentMethod>('arrival');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');
  const [result, setResult] = useState<Booking | null>(null);
  const [online, setOnline] = useState<{ payme: boolean; click: boolean } | null>(null);

  const days = useMemo(
    () => Array.from({ length: DAYS_AHEAD }, (_, i) => addDaysISO(todayISO(), i)),
    [],
  );

  const loadSlots = (forDate: string) => {
    setSlots(null);
    setSelected(null);
    api
      .slots(field.id, forDate)
      .then((r) => setSlots(r.slots))
      .catch((e) => setError((e as Error).message));
  };

  useEffect(() => {
    loadSlots(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, field.id]);

  useEffect(() => {
    api
      .paymentMethods()
      .then(setOnline)
      .catch(() => setOnline({ payme: false, click: false }));
  }, []);

  const maxHours = useMemo(() => {
    if (selected === null || !slots) return 1;
    let count = 0;
    for (let i = selected; i < slots.length && count < 3; i++) {
      if (!slots[i].available) break;
      count++;
    }
    return Math.max(1, count);
  }, [selected, slots]);

  const chosenStart = selected !== null && slots ? slots[selected] : null;
  const total = field.price_per_hour * hours;

  const pickSlot = (index: number) => {
    haptic('tap');
    setSelected(index);
    setHours(1);
    setError('');
  };

  const submit = async () => {
    if (selected === null || !slots) {
      setError('Iltimos, vaqtni tanlang');
      return;
    }
    const cleanPhone = phone.replace(/[\s()-]/g, '');
    if (!/^\+?\d{9,15}$/.test(cleanPhone)) {
      setError('Telefon raqamini to‘g‘ri kiriting (masalan +998901234567)');
      return;
    }
    if (name.trim().length < 2) {
      setError('Ismingizni kiriting');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const res = await api.createBooking({
        fieldId: field.id,
        date,
        startTime: slots[selected].time,
        hours,
        name: name.trim(),
        phone: cleanPhone,
        payment,
      });
      setResult(res.booking);
      haptic('success');
    } catch (e) {
      setError((e as Error).message);
      haptic('error');
      if (e instanceof ApiError && e.status === 409) loadSlots(date);
    } finally {
      setBusy(false);
    }
  };

  const startPayment = async (bookingId: number) => {
    setPaying(true);
    setPayError('');
    try {
      const res = await api.payBooking(bookingId);
      window.location.href = res.url;
    } catch (e) {
      setPayError((e as Error).message);
    } finally {
      setPaying(false);
    }
  };

  if (result) {
    const online = result.payment_method !== 'arrival';
    const unpaid = result.payment_status !== 'paid';

    return (
      <div className="stack">
        <div className="success">
          <div className="success__icon">✓</div>
          <h2 className="success__title">Bron yuborildi!</h2>
          <p className="success__text">
            {online
              ? `${PAYMENT_LABEL[result.payment_method]} orqali to‘lovni yakunlang.`
              : 'Admin tasdiqlagach siz bilan bog‘lanamiz. To‘lovni maydonda amalga oshirasiz.'}
          </p>
        </div>

        {online && unpaid && (
          <div className="notice">
            <strong>To‘lov kutilmoqda</strong>
            <p>{formatPrice(result.total_price)} — {PAYMENT_LABEL[result.payment_method]} orqali onlayn to‘lang.</p>
            <button className="btn btn--block" disabled={paying} onClick={() => void startPayment(result.id)}>
              {paying ? 'Ochilmoqda…' : `${PAYMENT_LABEL[result.payment_method]} orqali to‘lash`}
            </button>
            {payError && <div className="notice notice--error notice--inline">{payError}</div>}
          </div>
        )}

        <div className="card card--pad summary">
          <div className="summary__row">
            <span>Maydon</span>
            <strong>{result.field_name ?? field.name}</strong>
          </div>
          <div className="summary__row">
            <span>Sana</span>
            <strong>{formatDateFull(result.date)}</strong>
          </div>
          <div className="summary__row">
            <span>Vaqt</span>
            <strong>{result.start_time} – {result.end_time}</strong>
          </div>
          <div className="summary__row">
            <span>Davomiylik</span>
            <strong>{result.hours} soat</strong>
          </div>
          <div className="summary__row">
            <span>To‘lov</span>
            <strong>
              {PAYMENT_LABEL[result.payment_method]} · {PAYMENT_STATUS_LABEL[result.payment_status]}
            </strong>
          </div>
          <div className="summary__row summary__row--total">
            <span>Jami</span>
            <strong>{formatPrice(result.total_price)}</strong>
          </div>
        </div>

        <button className="btn btn--block" onClick={onGoToMy}>
          Bronlarimni ko‘rish
        </button>
        <button
          className="btn btn--ghost btn--block"
          onClick={() => {
            setResult(null);
            setPayError('');
            loadSlots(date);
          }}
        >
          Yana bron qilish
        </button>
      </div>
    );
  }

  return (
    <div className="stack">
      <button className="backlink" onClick={onBack}>
        ← Maydonlarga qaytish
      </button>

      <section className="hero">
        <div className="hero__top">
          <h2 className="hero__title">{field.name}</h2>
          <span className="hero__price">{formatPrice(field.price_per_hour)}<small>/soat</small></span>
        </div>
        {field.address && <p className="hero__meta">📍 {field.address}</p>}
        <p className="hero__meta">🕒 Ish vaqti: {formatWorkingHours(field.open_time, field.close_time)}</p>
        <p className="hero__meta">💡 Narxga svet (yoritish) kiritilgan</p>
      </section>

      <section className="card card--pad">
        <h3 className="section__title">1. Sanani tanlang</h3>
        <div className="dates">
          {days.map((day) => {
            const d = parseISODate(day);
            const active = day === date;
            return (
              <button
                key={day}
                className={`date${active ? ' date--active' : ''}`}
                onClick={() => setDate(day)}
              >
                <span className="date__week">{WEEKDAYS[d.getDay()]}</span>
                <span className="date__day">{d.getDate()}</span>
                <span className="date__month">{MONTHS[d.getMonth()]}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="card card--pad">
        <h3 className="section__title">2. Vaqtni tanlang</h3>
        {!slots && <div className="skeleton skeleton--slots" />}
        {slots && slots.length === 0 && <p className="muted">Bu kunda ish vaqti belgilanmagan.</p>}
        {slots && slots.length > 0 && (
          <>
            <div className="slots">
              {slots.map((slot, index) => (
                <button
                  key={slot.time}
                  className={`slot${selected === index ? ' slot--active' : ''}`}
                  disabled={!slot.available}
                  onClick={() => pickSlot(index)}
                >
                  {slot.time}
                </button>
              ))}
            </div>
            <p className="muted muted--tiny">Band vaqtlar ustiga bosib bo‘lmaydi.</p>
          </>
        )}
      </section>

      {chosenStart && (
        <section className="card card--pad">
          <h3 className="section__title">3. Davomiylik</h3>
          <div className="chips">
            {[1, 2, 3].map((h) => (
              <button
                key={h}
                className={`chip${hours === h ? ' chip--active' : ''}`}
                disabled={h > maxHours}
                onClick={() => setHours(h)}
              >
                {h} soat
              </button>
            ))}
          </div>

          <h3 className="section__title section__title--spaced">4. Aloqa ma’lumotlari</h3>
          <label className="label">
            Ismingiz
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ism Familiya" />
          </label>
          <label className="label">
            Telefon
            <input
              className="input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              placeholder="+998901234567"
            />
          </label>

          <h3 className="section__title section__title--spaced">5. To‘lov usuli</h3>
          <div className="payoptions">
            {PAYMENT_OPTIONS.map((option) => {
              const available =
                option.id === 'arrival' || (online ? online[option.id] : false);
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={!available}
                  className={`payoption${payment === option.id ? ' payoption--active' : ''}`}
                  onClick={() => setPayment(option.id)}
                >
                  <span className="payoption__logo">{option.icon}</span>
                  <span className="payoption__body">
                    <span className="payoption__title">{option.title}</span>
                    <span className="payoption__text">{option.text}</span>
                  </span>
                  {!available && <span className="payoption__soon">Tez orada</span>}
                  {available && payment === option.id && <span className="payoption__tick">✓</span>}
                </button>
              );
            })}
          </div>

          <div className="total">
            <div>
              <p className="total__label">{chosenStart.time} – {chosenStart.label.split('–')[1]} · {hours} soat</p>
              <p className="total__hint">{formatPrice(field.price_per_hour)} × {hours}</p>
            </div>
            <strong className="total__value">{formatPrice(total)}</strong>
          </div>

          {error && <div className="notice notice--error notice--inline">{error}</div>}

          <button className="btn btn--block btn--lg" disabled={busy} onClick={() => void submit()}>
            {busy ? 'Yuborilmoqda…' : payment === 'arrival' ? 'Bronni tasdiqlash' : 'Bron qilish va to‘lash'}
          </button>
        </section>
      )}

      {error && !chosenStart && <div className="notice notice--error">{error}</div>}
    </div>
  );
}
