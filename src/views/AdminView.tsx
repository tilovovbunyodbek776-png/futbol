import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, setAdminToken } from '../api';
import type { Booking, Field, Me, Stats } from '../types';
import { confirmAction, haptic } from '../telegram';
import { formatDateHuman, formatPrice, STATUS_LABEL, todayISO } from '../utils';

const STATUS_OPTIONS: { value: Booking['status']; label: string }[] = [
  { value: 'pending', label: 'Kutilmoqda' },
  { value: 'confirmed', label: 'Tasdiqlangan' },
  { value: 'completed', label: 'Yakunlangan' },
  { value: 'cancelled', label: 'Bekor qilingan' },
];

export default function AdminView({ me, onAuthChanged }: { me: Me; onAuthChanged: () => void }) {
  if (!me.isAdmin) return <AdminLogin onAuthChanged={onAuthChanged} />;
  return <AdminPanel onAuthChanged={onAuthChanged} />;
}

function AdminLogin({ onAuthChanged }: { onAuthChanged: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.adminLogin(password);
      setAdminToken(res.token);
      haptic('success');
      onAuthChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="stack" onSubmit={submit}>
      <div className="card card--pad login">
        <div className="login__icon">🔐</div>
        <h2 className="login__title">Admin panel</h2>
        <p className="login__text">Bronlarni boshqarish uchun parolni kiriting.</p>
        <input
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Parol"
          autoComplete="current-password"
        />
        {error && <div className="notice notice--error notice--inline">{error}</div>}
        <button className="btn btn--block" type="submit" disabled={busy || !password}>
          {busy ? 'Kirish…' : 'Kirish'}
        </button>
        <p className="muted muted--tiny">
          Parol server sozlamalarida (ADMIN_PASSWORD). Telegram ID bo‘yicha adminlar parolsiz kiradi.
        </p>
      </div>
    </form>
  );
}

function AdminPanel({ onAuthChanged }: { onAuthChanged: () => void }) {
  const [tab, setTab] = useState<'bookings' | 'fields' | 'stats'>('bookings');

  return (
    <div className="stack">
      <div className="adminhead">
        <div>
          <h2 className="hello__title">Boshqaruv paneli</h2>
          <p className="hello__text">Bronlar, maydonlar va statistika</p>
        </div>
        <button
          className="btn btn--ghost btn--sm"
          onClick={() => {
            setAdminToken(null);
            onAuthChanged();
          }}
        >
          Chiqish
        </button>
      </div>

      <div className="segmented">
        {([
          ['bookings', 'Bronlar'],
          ['fields', 'Maydonlar'],
          ['stats', 'Statistika'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            className={`seg${tab === id ? ' seg--active' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'bookings' && <BookingsAdmin />}
      {tab === 'fields' && <FieldsAdmin />}
      {tab === 'stats' && <StatsAdmin />}
    </div>
  );
}

function BookingsAdmin() {
  const [date, setDate] = useState(todayISO());
  const [status, setStatus] = useState('');
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(() => {
    setBookings(null);
    api
      .adminBookings({ date: date || undefined, status: status || undefined })
      .then((r) => setBookings(r.bookings))
      .catch((e) => setError((e as Error).message));
  }, [date, status]);

  useEffect(load, [load]);

  const changeStatus = async (id: number, next: Booking['status']) => {
    if (next === 'cancelled') {
      const ok = await confirmAction('Bu bronni bekor qilasizmi? Vaqt yana bo‘sh holatga qaytadi.');
      if (!ok) return;
    }
    setBusyId(id);
    try {
      await api.adminSetStatus(id, next);
      haptic('success');
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="stack">
      <div className="filters">
        <label className="filters__item">
          Sana
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="filters__item">
          Holat
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Barchasi</option>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button className="btn btn--ghost btn--sm" onClick={() => setDate('')}>
        Barcha kunlarni ko‘rsatish
      </button>

      {error && <div className="notice notice--error">{error}</div>}
      {!bookings && !error && <div className="skeleton" />}

      {bookings?.length === 0 && (
        <div className="empty">
          <span className="empty__icon">📋</span>
          <h3>Bron topilmadi</h3>
          <p>Tanlangan sana yoki holat bo‘yicha yozuv yo‘q.</p>
        </div>
      )}

      {bookings?.map((b) => (
        <article key={b.id} className="card card--pad booking">
          <div className="booking__head">
            <div>
              <h4 className="booking__title">{b.field_name}</h4>
              <p className="booking__when">
                {formatDateHuman(b.date)} · {b.start_time} – {b.end_time}
              </p>
            </div>
            <span className={`badge badge--${b.status}`}>{STATUS_LABEL[b.status]}</span>
          </div>

          <div className="booking__person">
            <div>
              <p className="booking__name">{b.user_name}</p>
              {b.username && <p className="muted muted--tiny">@{b.username}</p>}
            </div>
            {b.phone && (
              <a className="phonelink" href={`tel:${b.phone}`}>
                📞 {b.phone}
              </a>
            )}
          </div>

          <div className="booking__foot">
            <span className="booking__price">{formatPrice(b.total_price)}</span>
            <div className="actions">
              {b.status === 'pending' && (
                <button
                  className="btn btn--sm"
                  disabled={busyId === b.id}
                  onClick={() => void changeStatus(b.id, 'confirmed')}
                >
                  Tasdiqlash
                </button>
              )}
              {b.status === 'confirmed' && (
                <button
                  className="btn btn--ghost btn--sm"
                  disabled={busyId === b.id}
                  onClick={() => void changeStatus(b.id, 'completed')}
                >
                  Yakunlash
                </button>
              )}
              {b.status !== 'cancelled' && (
                <button
                  className="btn btn--danger btn--sm"
                  disabled={busyId === b.id}
                  onClick={() => void changeStatus(b.id, 'cancelled')}
                >
                  Bekor qilish
                </button>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function FieldsAdmin() {
  const [fields, setFields] = useState<Field[] | null>(null);
  const [editing, setEditing] = useState<Partial<Field> | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api
      .adminFields()
      .then((r) => setFields(r.fields))
      .catch((e) => setError((e as Error).message));
  }, []);

  useEffect(load, [load]);

  const deactivate = async (field: Field) => {
    const ok = await confirmAction(`"${field.name}" maydonini o‘chirib qo‘yasizmi? Bronlar tarixi saqlanadi.`);
    if (!ok) return;
    try {
      await api.adminDeleteField(field.id);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (editing) {
    return (
      <FieldForm
        initial={editing}
        onCancel={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
    );
  }

  return (
    <div className="stack">
      <button className="btn btn--block" onClick={() => setEditing({})}>
        + Yangi maydon qo‘shish
      </button>

      {error && <div className="notice notice--error">{error}</div>}
      {!fields && <div className="skeleton" />}

      {fields?.map((field) => (
        <article key={field.id} className="card card--pad fieldrow">
          <div className="fieldrow__info">
            <h4 className="booking__title">{field.name}</h4>
            <p className="muted muted--tiny">
              {field.open_time} – {field.close_time} · {formatPrice(field.price_per_hour)}/soat
            </p>
            {field.address && <p className="muted muted--tiny">📍 {field.address}</p>}
          </div>
          <div className="actions">
            <span className={`badge ${field.is_active ? 'badge--confirmed' : 'badge--cancelled'}`}>
              {field.is_active ? 'Faol' : 'Nofaol'}
            </span>
            <button className="btn btn--ghost btn--sm" onClick={() => setEditing(field)}>
              Tahrirlash
            </button>
            {field.is_active === 1 && (
              <button className="btn btn--danger btn--sm" onClick={() => void deactivate(field)}>
                O‘chirish
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

function FieldForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial: Partial<Field>;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: initial.name ?? '',
    address: initial.address ?? '',
    price_per_hour: initial.price_per_hour ? String(initial.price_per_hour) : '',
    open_time: initial.open_time ?? '08:00',
    close_time: initial.close_time ?? '23:00',
    image_url: initial.image_url ?? '',
  });
  const [active, setActive] = useState(initial.is_active !== 0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.adminSaveField({
        id: initial.id,
        name: form.name,
        address: form.address,
        price_per_hour: Number(form.price_per_hour),
        open_time: form.open_time,
        close_time: form.close_time,
        image_url: form.image_url,
        is_active: active ? 1 : 0,
      });
      haptic('success');
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card card--pad stack" onSubmit={submit}>
      <h3 className="section__title">{initial.id ? 'Maydonni tahrirlash' : 'Yangi maydon'}</h3>

      <label className="label">
        Nomi
        <input className="input" value={form.name} onChange={set('name')} placeholder="Masalan: Markaziy maydon" />
      </label>
      <label className="label">
        Manzil
        <input className="input" value={form.address} onChange={set('address')} placeholder="Tuman, ko‘cha" />
      </label>
      <label className="label">
        Narx (so‘m / soat)
        <input
          className="input"
          value={form.price_per_hour}
          onChange={set('price_per_hour')}
          inputMode="numeric"
          placeholder="120000"
        />
      </label>
      <div className="row">
        <label className="label">
          Ochilish
          <input className="input" type="time" value={form.open_time} onChange={set('open_time')} />
        </label>
        <label className="label">
          Yopilish
          <input className="input" type="time" value={form.close_time} onChange={set('close_time')} />
        </label>
      </div>
      <label className="label">
        Rasm havolasi (ixtiyoriy)
        <input className="input" value={form.image_url} onChange={set('image_url')} placeholder="https://…" />
      </label>

      <label className="switch">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        <span>Maydon faol (bron qabul qiladi)</span>
      </label>

      {error && <div className="notice notice--error notice--inline">{error}</div>}

      <div className="row">
        <button className="btn btn--block" type="submit" disabled={busy}>
          {busy ? 'Saqlanmoqda…' : 'Saqlash'}
        </button>
        <button className="btn btn--ghost btn--block" type="button" onClick={onCancel}>
          Bekor qilish
        </button>
      </div>
    </form>
  );
}

function StatsAdmin() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .adminStats()
      .then(setStats)
      .catch((e) => setError((e as Error).message));
  }, []);

  if (error) return <div className="notice notice--error">{error}</div>;
  if (!stats) return <div className="skeleton skeleton--tall" />;

  const cards = [
    { label: 'Bugungi bronlar', value: String(stats.today.bookings), icon: '📅' },
    { label: 'Bugungi tushum', value: formatPrice(stats.today.revenue), icon: '💰' },
    { label: 'Tasdiq kutayotgan', value: String(stats.pending), icon: '⏳' },
    { label: '7 kunlik bronlar', value: String(stats.week.bookings), icon: '🗓' },
    { label: 'Faol maydonlar', value: String(stats.fields), icon: '⚽' },
  ];

  return (
    <div className="stats">
      {cards.map((card) => (
        <div key={card.label} className="stat">
          <span className="stat__icon">{card.icon}</span>
          <strong className="stat__value">{card.value}</strong>
          <span className="stat__label">{card.label}</span>
        </div>
      ))}
    </div>
  );
}
