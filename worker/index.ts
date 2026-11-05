import { Hono } from 'hono';
import {
  verifyInitData,
  signAdminToken,
  verifyAdminToken,
  checkPassword,
  type TgUser,
} from './telegram';

type Env = {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN?: string;
  ADMIN_PASSWORD?: string;
  ADMIN_IDS?: string;
  DEV_MODE?: string;
  TZ_OFFSET_MINUTES?: string;
};

type Identity = { user: TgUser | null; isAdmin: boolean; devMode: boolean };

const app = new Hono<{ Bindings: Env; Variables: { identity: Identity } }>();

/* ---------------------------------- utils --------------------------------- */

const toMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

const fromMinutes = (m: number) => {
  const total = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

const offset = (env: Env) => Number(env.TZ_OFFSET_MINUTES ?? 300);

const todayStr = (env: Env) => new Date(Date.now() + offset(env) * 60000).toISOString().slice(0, 10);

const nowMinutes = (env: Env) => {
  const d = new Date(Date.now() + offset(env) * 60000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const isDate = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

const isTime = (value: unknown): value is string =>
  typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

const cleanText = (value: unknown, max = 80) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';

const cleanPhone = (value: unknown) => {
  const raw = typeof value === 'string' ? value.replace(/[\s\-()]/g, '') : '';
  return /^\+?\d{9,15}$/.test(raw) ? raw : '';
};

/* --------------------------------- auth ----------------------------------- */

app.use('*', async (c, next) => {
  const token = (c.req.header('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const initData = c.req.header('X-Telegram-Init-Data') ?? '';

  let user: TgUser | null = null;
  if (initData) {
    user = await verifyInitData(initData, c.env.TELEGRAM_BOT_TOKEN ?? '');
  } else if (c.env.DEV_MODE === '1') {
    // Telegram tashqarisida (masalan brauzerda) sinash uchun
    user = { id: 100000001, first_name: 'Mehmon', username: 'dev' };
  }

  const adminIds = (c.env.ADMIN_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const isAdmin =
    (token ? await verifyAdminToken(token, c.env.ADMIN_PASSWORD) : false) ||
    (user ? adminIds.includes(String(user.id)) : false);

  c.set('identity', { user, isAdmin, devMode: !initData && c.env.DEV_MODE === '1' });
  await next();
});

const currentUser = (c: { get: (k: 'identity') => Identity }) => c.get('identity').user;

/* --------------------------------- routes --------------------------------- */

app.get('/api/health', (c) => c.json({ ok: true }));

app.get('/api/me', (c) => {
  const identity = c.get('identity');
  return c.json({ user: identity.user, isAdmin: identity.isAdmin, devMode: identity.devMode });
});

// Maydonlar ro'yxati
app.get('/api/fields', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, name, address, price_per_hour, open_time, close_time, image_url FROM fields WHERE is_active = 1 ORDER BY id',
  ).all();
  return c.json({ fields: results });
});

// Bitta maydonning kunlik bo'sh vaqtlari
app.get('/api/fields/:id/slots', async (c) => {
  const id = Number(c.req.param('id'));
  const date = c.req.query('date') ?? todayStr(c.env);
  if (!Number.isInteger(id) || !isDate(date)) return c.json({ error: 'Noto‘g‘ri so‘rov' }, 400);

  const field = await c.env.DB.prepare('SELECT * FROM fields WHERE id = ? AND is_active = 1')
    .bind(id)
    .first<any>();
  if (!field) return c.json({ error: 'Maydon topilmadi' }, 404);

  const { results: booked } = await c.env.DB.prepare(
    "SELECT start_time, end_time FROM bookings WHERE field_id = ? AND date = ? AND status != 'cancelled'",
  )
    .bind(id, date)
    .all<any>();

  const openMin = toMinutes(field.open_time);
  let closeMin = toMinutes(field.close_time);
  if (closeMin <= openMin) closeMin += 1440;

  const isToday = date === todayStr(c.env);
  const now = nowMinutes(c.env);

  const slots: { time: string; label: string; available: boolean }[] = [];
  for (let m = openMin; m < closeMin; m += 60) {
    const start = fromMinutes(m);
    const end = fromMinutes(m + 60);
    const busy = booked.some((b: any) => toMinutes(b.start_time) < m + 60 && toMinutes(b.end_time) > m);
    const passed = isToday && now >= m;
    slots.push({ time: start, label: `${start}–${end}`, available: !busy && !passed });
  }

  return c.json({
    field: {
      id: field.id,
      name: field.name,
      address: field.address,
      price_per_hour: field.price_per_hour,
      open_time: field.open_time,
      close_time: field.close_time,
      image_url: field.image_url,
    },
    date,
    slots,
  });
});

// Bron qilish
app.post('/api/bookings', async (c) => {
  const user = currentUser(c);
  if (!user) return c.json({ error: 'Avtorizatsiya talab qilinadi' }, 401);

  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const fieldId = Number(body.fieldId);
  const date = body.date;
  const startTime = body.startTime;
  const hours = Number(body.hours ?? 1);
  const customerName = cleanText(body.name, 60);
  const phone = cleanPhone(body.phone);

  if (!Number.isInteger(fieldId)) return c.json({ error: 'Maydon tanlanmadi' }, 400);
  if (!isDate(date)) return c.json({ error: 'Sanani tanlang' }, 400);
  if (!isTime(startTime)) return c.json({ error: 'Vaqtni tanlang' }, 400);
  if (!Number.isInteger(hours) || hours < 1 || hours > 3) return c.json({ error: 'Davomiylik 1–3 soat' }, 400);
  if (customerName.length < 2) return c.json({ error: 'Ismingizni kiriting' }, 400);
  if (!phone) return c.json({ error: 'Telefon raqamini to‘g‘ri kiriting' }, 400);

  const env = c.env;
  const today = todayStr(env);
  if (date < today) return c.json({ error: 'O‘tgan sanaga bron qilib bo‘lmaydi' }, 400);
  if (date > addDays(today, 60)) return c.json({ error: '60 kundan keyingi sanaga bron qilib bo‘lmaydi' }, 400);

  const field = await env.DB.prepare('SELECT * FROM fields WHERE id = ? AND is_active = 1')
    .bind(fieldId)
    .first<any>();
  if (!field) return c.json({ error: 'Maydon topilmadi' }, 404);

  const openMin = toMinutes(field.open_time);
  let closeMin = toMinutes(field.close_time);
  if (closeMin <= openMin) closeMin += 1440;

  const startMin = toMinutes(startTime);
  const endMin = startMin + hours * 60;

  if (startMin < openMin || endMin > closeMin || startMin % 60 !== 0) {
    return c.json({ error: 'Tanlangan vaqt ish jadvaliga mos kelmaydi' }, 400);
  }
  if (date === today && nowMinutes(env) >= startMin) {
    return c.json({ error: 'Bu vaqt allaqachon o‘tib ketgan' }, 400);
  }

  const endTime = fromMinutes(endMin);
  const clash = await env.DB.prepare(
    "SELECT id FROM bookings WHERE field_id = ? AND date = ? AND status != 'cancelled' AND start_time < ? AND end_time > ?",
  )
    .bind(fieldId, date, endTime, startTime)
    .first();

  if (clash) return c.json({ error: 'Bu vaqt band qilingan. Boshqa vaqt tanlang' }, 409);

  const total = field.price_per_hour * hours;

  try {
    const result = await env.DB.prepare(
      `INSERT INTO bookings (field_id, user_id, user_name, username, phone, date, start_time, end_time, hours, total_price, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    )
      .bind(
        fieldId,
        user.id,
        `${user.first_name}${user.last_name ? ' ' + user.last_name : ''}`.trim(),
        user.username ?? null,
        phone,
        date,
        startTime,
        endTime,
        hours,
        total,
      )
      .run();

    return c.json(
      {
        booking: {
          id: result.meta.last_row_id,
          field_id: fieldId,
          field_name: field.name,
          date,
          start_time: startTime,
          end_time: endTime,
          hours,
          total_price: total,
          status: 'pending',
        },
      },
      201,
    );
  } catch {
    return c.json({ error: 'Bu vaqt hozir band qilindi. Boshqa vaqt tanlang' }, 409);
  }
});

// Mening bronlarim
app.get('/api/bookings/my', async (c) => {
  const user = currentUser(c);
  if (!user) return c.json({ error: 'Avtorizatsiya talab qilinadi' }, 401);

  const { results } = await c.env.DB.prepare(
    `SELECT b.id, b.field_id, f.name AS field_name, f.address, b.date, b.start_time, b.end_time,
            b.hours, b.total_price, b.status, b.created_at
     FROM bookings b JOIN fields f ON f.id = b.field_id
     WHERE b.user_id = ? ORDER BY b.date DESC, b.start_time DESC LIMIT 100`,
  )
    .bind(user.id)
    .all();

  return c.json({ bookings: results, today: todayStr(c.env) });
});

// Bronni bekor qilish (foydalanuvchi)
app.post('/api/bookings/:id/cancel', async (c) => {
  const user = currentUser(c);
  if (!user) return c.json({ error: 'Avtorizatsiya talab qilinadi' }, 401);

  const id = Number(c.req.param('id'));
  const booking = await c.env.DB.prepare('SELECT * FROM bookings WHERE id = ?').bind(id).first<any>();
  if (!booking) return c.json({ error: 'Bron topilmadi' }, 404);
  if (booking.user_id !== user.id && !c.get('identity').isAdmin) {
    return c.json({ error: 'Ruxsat yo‘q' }, 403);
  }
  if (booking.status === 'cancelled') return c.json({ ok: true });

  await c.env.DB.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

/* --------------------------------- admin ---------------------------------- */

app.post('/api/admin/login', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const password = typeof body.password === 'string' ? body.password : '';
  if (!c.env.ADMIN_PASSWORD) {
    return c.json({ error: 'ADMIN_PASSWORD sozlanmagan (.dev.vars faylini tekshiring)' }, 500);
  }
  if (!checkPassword(password, c.env.ADMIN_PASSWORD)) {
    return c.json({ error: 'Parol noto‘g‘ri' }, 401);
  }
  return c.json({ token: await signAdminToken(c.env.ADMIN_PASSWORD) });
});

app.use('/api/admin/*', async (c, next) => {
  if (!c.get('identity').isAdmin) return c.json({ error: 'Admin ruxsati talab qilinadi' }, 403);
  await next();
});

app.get('/api/admin/stats', async (c) => {
  const today = todayStr(c.env);
  const day = await c.env.DB.prepare(
    `SELECT COUNT(*) AS total, COALESCE(SUM(total_price), 0) AS revenue
     FROM bookings WHERE date = ? AND status IN ('pending','confirmed','completed')`,
  )
    .bind(today)
    .first<any>();
  const week = await c.env.DB.prepare(
    `SELECT COUNT(*) AS total FROM bookings WHERE date > ? AND date <= ? AND status IN ('pending','confirmed')`,
  )
    .bind(today, addDays(today, 7))
    .first<any>();
  const pending = await c.env.DB.prepare(
    "SELECT COUNT(*) AS total FROM bookings WHERE status = 'pending'",
  ).first<any>();
  const fields = await c.env.DB.prepare('SELECT COUNT(*) AS total FROM fields WHERE is_active = 1').first<any>();

  return c.json({
    today: { bookings: day?.total ?? 0, revenue: day?.revenue ?? 0 },
    week: { bookings: week?.total ?? 0 },
    pending: pending?.total ?? 0,
    fields: fields?.total ?? 0,
    todayDate: today,
  });
});

app.get('/api/admin/bookings', async (c) => {
  const date = c.req.query('date');
  const status = c.req.query('status');
  const filters: string[] = [];
  const params: unknown[] = [];

  if (isDate(date)) {
    filters.push('b.date = ?');
    params.push(date);
  }
  if (status && ['pending', 'confirmed', 'cancelled', 'completed'].includes(status)) {
    filters.push('b.status = ?');
    params.push(status);
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const { results } = await c.env.DB.prepare(
    `SELECT b.*, f.name AS field_name
     FROM bookings b JOIN fields f ON f.id = b.field_id
     ${where}
     ORDER BY b.date DESC, b.start_time ASC LIMIT 200`,
  )
    .bind(...params)
    .all();

  return c.json({ bookings: results });
});

app.post('/api/admin/bookings/:id/status', async (c) => {
  const id = Number(c.req.param('id'));
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const status = body.status;
  if (!['pending', 'confirmed', 'cancelled', 'completed'].includes(String(status))) {
    return c.json({ error: 'Noto‘g‘ri holat' }, 400);
  }
  await c.env.DB.prepare('UPDATE bookings SET status = ? WHERE id = ?').bind(status, id).run();
  return c.json({ ok: true });
});

app.get('/api/admin/fields', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM fields ORDER BY is_active DESC, id').all();
  return c.json({ fields: results });
});

const readField = (body: Record<string, unknown>) => {
  const name = cleanText(body.name, 80);
  const address = cleanText(body.address, 120);
  const price = Number(body.price_per_hour);
  const openTime = body.open_time;
  const closeTime = body.close_time;
  const imageUrl = cleanText(body.image_url, 300);
  const isActive = body.is_active === false || body.is_active === 0 ? 0 : 1;

  if (name.length < 2) return { error: 'Maydon nomini kiriting' } as const;
  if (!Number.isInteger(price) || price <= 0) return { error: 'Narx musbat son bo‘lishi kerak' } as const;
  if (!isTime(openTime) || !isTime(closeTime)) return { error: 'Vaqt formati HH:MM bo‘lishi kerak' } as const;
  if (openTime === closeTime) return { error: 'Ochilish va yopilish vaqti bir xil bo‘lmasin' } as const;
  if (imageUrl && !/^https?:\/\//.test(imageUrl)) return { error: 'Rasm havolasi http(s) bilan boshlanishi kerak' } as const;

  return {
    value: {
      name,
      address: address || null,
      price_per_hour: price,
      open_time: openTime,
      close_time: closeTime,
      image_url: imageUrl || null,
      is_active: isActive,
    },
  } as const;
};

app.post('/api/admin/fields', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = readField(body);
  if ('error' in parsed) return c.json({ error: parsed.error }, 400);
  const f = parsed.value;

  const result = await c.env.DB.prepare(
    `INSERT INTO fields (name, address, price_per_hour, open_time, close_time, image_url, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(f.name, f.address, f.price_per_hour, f.open_time, f.close_time, f.image_url, f.is_active)
    .run();

  return c.json({ id: result.meta.last_row_id }, 201);
});

app.put('/api/admin/fields/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = readField(body);
  if ('error' in parsed) return c.json({ error: parsed.error }, 400);
  const f = parsed.value;

  await c.env.DB.prepare(
    `UPDATE fields SET name = ?, address = ?, price_per_hour = ?, open_time = ?, close_time = ?,
            image_url = ?, is_active = ? WHERE id = ?`,
  )
    .bind(f.name, f.address, f.price_per_hour, f.open_time, f.close_time, f.image_url, f.is_active, id)
    .run();

  return c.json({ ok: true });
});

app.delete('/api/admin/fields/:id', async (c) => {
  const id = Number(c.req.param('id'));
  await c.env.DB.prepare('UPDATE fields SET is_active = 0 WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

export default app;
