import { Hono } from 'hono';
import {
  verifyInitData,
  signAdminToken,
  verifyAdminToken,
  signWebToken,
  verifyWebToken,
  checkPassword,
  type TgUser,
} from './telegram';
import { md5, checkBasicAuth, paymeCheckoutUrl, clickPayUrl } from './payments';

type Env = {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN?: string;
  ADMIN_PASSWORD?: string;
  ADMIN_IDS?: string;
  SESSION_SECRET?: string;
  TZ_OFFSET_MINUTES?: string;
  PAYME_MERCHANT_ID?: string;
  PAYME_KEY?: string;
  CLICK_SERVICE_ID?: string;
  CLICK_MERCHANT_ID?: string;
  CLICK_SECRET_KEY?: string;
  APP_URL?: string;
  PAYMENTS_SIMULATE?: string;
};

type Identity = { user: TgUser | null; isAdmin: boolean; phone: string | null };

/** Sayt foydalanuvchilari ID'lari Telegram ID'lari bilan to'qnashmasligi uchun siljitiladi. */
const WEB_USER_OFFSET = 10_000_000_000;

const sessionSecret = (env: Env) => (env.SESSION_SECRET ?? env.ADMIN_PASSWORD ?? '').trim();

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
  let phone: string | null = null;

  if (initData) {
    user = await verifyInitData(initData, c.env.TELEGRAM_BOT_TOKEN ?? '');
  } else {
    // Brauzerda ochilgan sayt: ism + telefon bilan olingan imzolangan sessiya
    const accountId = await verifyWebToken(c.req.header('X-User-Token') ?? '', sessionSecret(c.env));
    if (accountId) {
      const account = await c.env.DB.prepare('SELECT id, name, phone FROM users WHERE id = ?')
        .bind(accountId)
        .first<{ id: number; name: string; phone: string }>();
      if (account) {
        user = { id: WEB_USER_OFFSET + account.id, first_name: account.name };
        phone = account.phone;
      }
    }
  }

  const adminIds = (c.env.ADMIN_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const isAdmin =
    (token ? await verifyAdminToken(token, c.env.ADMIN_PASSWORD) : false) ||
    (user ? adminIds.includes(String(user.id)) : false);

  c.set('identity', { user, isAdmin, phone });
  await next();
});

const currentUser = (c: { get: (k: 'identity') => Identity }) => c.get('identity').user;

/* --------------------------------- routes --------------------------------- */

app.get('/api/health', (c) => c.json({ ok: true }));

app.get('/api/me', (c) => {
  const identity = c.get('identity');
  return c.json({ user: identity.user, isAdmin: identity.isAdmin, phone: identity.phone });
});

// Saytga kirish (Telegram tashqarisida): telefon raqami bo'yicha hisob
app.post('/api/auth/login', async (c) => {
  const secret = sessionSecret(c.env);
  if (!secret) {
    return c.json({ error: 'SESSION_SECRET sozlanmagan (.dev.vars faylini tekshiring)' }, 500);
  }

  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = cleanText(body.name, 60);
  const phone = cleanPhone(body.phone);

  if (name.length < 2) return c.json({ error: 'Ismingizni kiriting' }, 400);
  if (!phone) return c.json({ error: 'Telefon raqamini to‘g‘ri kiriting' }, 400);

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE phone = ?')
    .bind(phone)
    .first<{ id: number }>();

  let accountId: number;
  if (existing) {
    accountId = existing.id;
    await c.env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name, accountId).run();
  } else {
    const result = await c.env.DB.prepare('INSERT INTO users (name, phone) VALUES (?, ?)')
      .bind(name, phone)
      .run();
    accountId = Number(result.meta.last_row_id);
  }

  return c.json({
    token: await signWebToken(accountId, secret),
    user: { id: WEB_USER_OFFSET + accountId, first_name: name },
  });
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
  if (!isPaymentMethod(body.payment)) return c.json({ error: 'To‘lov usulini tanlang' }, 400);
  const payment = body.payment;
  if (payment !== 'arrival' && !providerEnabled(c.env, payment)) {
    return c.json({ error: 'Onlayn to‘lov hozircha ulanmagan. Iltimos, joyida to‘lashni tanlang.' }, 503);
  }

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
      `INSERT INTO bookings (field_id, user_id, user_name, username, phone, date, start_time, end_time, hours, total_price, status, payment_method, payment_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 'unpaid')`,
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
        payment,
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
          payment_method: payment,
          payment_status: 'unpaid',
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
            b.hours, b.total_price, b.status, b.payment_method, b.payment_status, b.created_at
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

/* --------------------------------- to‘lov ---------------------------------- */

type PaymentMethodId = 'payme' | 'click' | 'arrival';

const isPaymentMethod = (value: unknown): value is PaymentMethodId =>
  value === 'payme' || value === 'click' || value === 'arrival';

/** Provayder kalitlari kiritilganmi (yoki lokal sinov rejimimi). */
const providerEnabled = (env: Env, method: 'payme' | 'click') =>
  env.PAYMENTS_SIMULATE === '1' ||
  (method === 'payme'
    ? Boolean(env.PAYME_MERCHANT_ID)
    : Boolean(env.CLICK_SERVICE_ID && env.CLICK_MERCHANT_ID));

// Qaysi onlayn to‘lov usullari faol
app.get('/api/payment-methods', (c) =>
  c.json({
    payme: providerEnabled(c.env, 'payme'),
    click: providerEnabled(c.env, 'click'),
  }),
);

const publicOrigin = (url: string) => new URL(url).origin;

// Bron yaratilgandan keyin to'lov havolasini beradi
app.post('/api/bookings/:id/pay', async (c) => {
  const identity = c.get('identity');
  if (!identity.user) return c.json({ error: 'Avtorizatsiya talab qilinadi' }, 401);

  const id = Number(c.req.param('id'));
  const booking = await c.env.DB.prepare('SELECT * FROM bookings WHERE id = ?').bind(id).first<any>();
  if (!booking) return c.json({ error: 'Bron topilmadi' }, 404);
  if (booking.user_id !== identity.user.id && !identity.isAdmin) {
    return c.json({ error: 'Ruxsat yo‘q' }, 403);
  }
  if (booking.status === 'cancelled') return c.json({ error: 'Bu bron bekor qilingan' }, 400);
  if (booking.payment_status === 'paid') return c.json({ error: 'Bu bron allaqachon to‘langan' }, 400);
  if (!isPaymentMethod(booking.payment_method) || booking.payment_method === 'arrival') {
    return c.json({ error: 'Bu bron uchun joyida to‘lov tanlangan' }, 400);
  }

  const origin = publicOrigin(c.req.url);
  const returnUrl = c.env.APP_URL ?? origin;
  const amount = Number(booking.total_price);
  const method: PaymentMethodId = booking.payment_method;

  let url: string;
  if (c.env.PAYMENTS_SIMULATE === '1') {
    url = `${origin}/api/payments/simulate/${id}?provider=${method}`;
  } else if (method === 'payme') {
    if (!providerEnabled(c.env, 'payme') || !c.env.PAYME_MERCHANT_ID) {
      return c.json({ error: 'Payme hozircha ulanmagan. Iltimos, joyida to‘lashni tanlang.' }, 503);
    }
    url = paymeCheckoutUrl(c.env.PAYME_MERCHANT_ID, id, amount, returnUrl);
  } else {
    if (!providerEnabled(c.env, 'click') || !c.env.CLICK_SERVICE_ID || !c.env.CLICK_MERCHANT_ID) {
      return c.json({ error: 'Click hozircha ulanmagan. Iltimos, joyida to‘lashni tanlang.' }, 503);
    }
    url = clickPayUrl(c.env.CLICK_SERVICE_ID, c.env.CLICK_MERCHANT_ID, id, amount, returnUrl);
  }

  await c.env.DB.prepare("UPDATE bookings SET payment_status = 'pending' WHERE id = ?").bind(id).run();
  return c.json({ url, provider: method });
});

// Payme Merchant API: Payme bizning serverga JSON-RPC 2.0 so'rov yuboradi
app.post('/api/payments/payme', async (c) => {
  const body = (await c.req.json().catch(() => null)) as any;
  const rpcId = body?.id ?? null;
  const respond = (result: unknown) => c.json({ jsonrpc: '2.0', id: rpcId, result });
  const fail = (code: number, message: string, data?: string) =>
    c.json({ jsonrpc: '2.0', id: rpcId, error: data ? { code, message, data } : { code, message } });

  const key = c.env.PAYME_KEY;
  if (!key) return fail(-32504, 'PAYME_KEY sozlanmagan');
  if (!checkBasicAuth(c.req.header('Authorization') ?? '', 'Paycom', key)) {
    return fail(-32504, 'Avtorizatsiya xatosi');
  }

  const params = (body?.params ?? {}) as Record<string, any>;
  const account = (params.account ?? {}) as Record<string, unknown>;
  const bookingId = Number(account.booking_id ?? account.order_id ?? 0);
  const method = String(body?.method ?? '');

  const loadBooking = async () =>
    Number.isInteger(bookingId) && bookingId > 0
      ? await c.env.DB.prepare('SELECT * FROM bookings WHERE id = ?').bind(bookingId).first<any>()
      : null;

  const bookingError = (booking: any) => {
    if (!booking) return [-31050, 'Bron topilmadi'] as const;
    if (booking.status === 'cancelled') return [-31051, 'Bron bekor qilingan'] as const;
    return null;
  };

  const loadPayment = async () =>
    await c.env.DB.prepare("SELECT * FROM payments WHERE provider = 'payme' AND provider_trans_id = ?")
      .bind(String(params.id))
      .first<any>();

  switch (method) {
    case 'CheckPerformTransaction': {
      const booking = await loadBooking();
      const error = bookingError(booking);
      if (error) return fail(error[0], error[1], 'booking_id');
      if (Number(params.amount) !== Number(booking.total_price) * 100) {
        return fail(-31001, 'Summa noto‘g‘ri');
      }
      return respond({ allow: true });
    }

    case 'CreateTransaction': {
      const booking = await loadBooking();
      const error = bookingError(booking);
      if (error) return fail(error[0], error[1], 'booking_id');
      if (Number(params.amount) !== Number(booking.total_price) * 100) {
        return fail(-31001, 'Summa noto‘g‘ri');
      }

      const existing = await loadPayment();
      if (existing) {
        if (existing.state !== 0) return fail(-31008, 'Tranzaksiyani davom ettirib bo‘lmaydi');
        return respond({ create_time: existing.create_time, transaction: String(existing.id), state: 0 });
      }

      const createTime = Number(params.time ?? Date.now());
      const result = await c.env.DB.prepare(
        "INSERT INTO payments (booking_id, provider, provider_trans_id, amount, state, create_time) VALUES (?, 'payme', ?, ?, 0, ?)",
      )
        .bind(booking.id, String(params.id), Number(params.amount), createTime)
        .run();

      await c.env.DB.prepare("UPDATE bookings SET payment_method = 'payme', payment_status = 'pending' WHERE id = ?")
        .bind(booking.id)
        .run();

      return respond({ create_time: createTime, transaction: String(result.meta.last_row_id), state: 0 });
    }

    case 'PerformTransaction': {
      const payment = await loadPayment();
      if (!payment) return fail(-31003, 'Tranzaksiya topilmadi');
      if (payment.state === 1) {
        return respond({ transaction: String(payment.id), perform_time: payment.perform_time, state: 1 });
      }
      if (payment.state !== 0) return fail(-31008, 'Tranzaksiyani yakunlab bo‘lmaydi');

      const performTime = Date.now();
      await c.env.DB.prepare('UPDATE payments SET state = 1, perform_time = ? WHERE id = ?')
        .bind(performTime, payment.id)
        .run();
      await c.env.DB.prepare("UPDATE bookings SET payment_status = 'paid', paid_at = datetime('now') WHERE id = ?")
        .bind(payment.booking_id)
        .run();

      return respond({ transaction: String(payment.id), perform_time: performTime, state: 1 });
    }

    case 'CancelTransaction': {
      const payment = await loadPayment();
      if (!payment) return fail(-31003, 'Tranzaksiya topilmadi');
      if (payment.state < 0) {
        return respond({ transaction: String(payment.id), cancel_time: payment.cancel_time, state: payment.state });
      }

      const cancelTime = Date.now();
      const state = payment.state === 1 ? -2 : -1;
      await c.env.DB.prepare('UPDATE payments SET state = ?, cancel_time = ?, reason = ? WHERE id = ?')
        .bind(state, cancelTime, Number(params.reason ?? 0), payment.id)
        .run();
      await c.env.DB.prepare("UPDATE bookings SET payment_status = 'unpaid', paid_at = NULL WHERE id = ?")
        .bind(payment.booking_id)
        .run();

      return respond({ transaction: String(payment.id), cancel_time: cancelTime, state });
    }

    case 'CheckTransaction': {
      const payment = await loadPayment();
      if (!payment) return fail(-31003, 'Tranzaksiya topilmadi');
      return respond({
        create_time: payment.create_time,
        perform_time: payment.perform_time ?? 0,
        cancel_time: payment.cancel_time ?? 0,
        transaction: String(payment.id),
        state: payment.state,
        reason: payment.reason ?? null,
      });
    }

    case 'GetStatement': {
      const { results } = await c.env.DB.prepare(
        "SELECT * FROM payments WHERE provider = 'payme' AND create_time >= ? AND create_time <= ? ORDER BY create_time",
      )
        .bind(Number(params.from ?? 0), Number(params.to ?? Date.now()))
        .all<any>();

      return respond({
        transactions: results.map((p: any) => ({
          id: p.provider_trans_id,
          time: p.create_time,
          amount: p.amount,
          account: { booking_id: p.booking_id },
          create_time: p.create_time,
          perform_time: p.perform_time ?? 0,
          cancel_time: p.cancel_time ?? 0,
          transaction: String(p.id),
          state: p.state,
          reason: p.reason ?? null,
        })),
      });
    }

    default:
      return fail(-32601, 'Metod topilmadi');
  }
});

// Click SHOP API: Prepare (action=0) va Complete (action=1)
app.all('/api/payments/click', async (c) => {
  const raw =
    c.req.method === 'GET'
      ? Object.fromEntries(new URL(c.req.url).searchParams)
      : ((await c.req.parseBody()) as Record<string, string | File>);
  const p = raw as Record<string, string>;
  const fail = (code: number, note: string) => c.json({ error: code, error_note: note });

  const secret = c.env.CLICK_SECRET_KEY;
  if (!secret) return fail(-9, 'CLICK_SECRET_KEY sozlanmagan');

  const action = String(p.action ?? '');
  const serviceId = String(p.service_id ?? '');
  if (!serviceId || !p.click_trans_id || !p.merchant_trans_id || !p.amount) {
    return fail(-8, 'Error in request from click');
  }
  if (c.env.CLICK_SERVICE_ID && serviceId !== c.env.CLICK_SERVICE_ID) {
    return fail(-2, 'Incorrect service_id');
  }

  const prepareIdPart = action === '1' ? String(p.merchant_prepare_id ?? '') : '';
  const signBase = `${p.click_trans_id}${serviceId}${secret}${p.merchant_trans_id}${prepareIdPart}${p.amount}${action}${p.sign_time}`;
  if (md5(signBase) !== String(p.sign_string ?? '').toLowerCase()) {
    return fail(-1, 'SIGN CHECK FAILED!');
  }

  const bookingId = Number(p.merchant_trans_id);
  const booking = Number.isInteger(bookingId)
    ? await c.env.DB.prepare('SELECT * FROM bookings WHERE id = ?').bind(bookingId).first<any>()
    : null;
  if (!booking) return fail(-5, 'User does not exist');
  if (Number(p.amount) !== Number(booking.total_price)) return fail(-2, 'Incorrect parameter amount');

  const transId = String(p.click_trans_id);
  const existing = await c.env.DB.prepare(
    "SELECT * FROM payments WHERE provider = 'click' AND provider_trans_id = ?",
  )
    .bind(transId)
    .first<any>();

  if (action === '0') {
    if (booking.status === 'cancelled') return fail(-9, 'Order cancelled');
    if (existing) {
      if (existing.state >= 1) return fail(-4, 'Already paid');
      return c.json({
        click_trans_id: p.click_trans_id,
        merchant_trans_id: p.merchant_trans_id,
        merchant_prepare_id: existing.id,
        error: 0,
        error_note: 'Success',
      });
    }

    const result = await c.env.DB.prepare(
      "INSERT INTO payments (booking_id, provider, provider_trans_id, amount, state, create_time) VALUES (?, 'click', ?, ?, 0, ?)",
    )
      .bind(booking.id, transId, Number(p.amount), Date.now())
      .run();

    await c.env.DB.prepare("UPDATE bookings SET payment_method = 'click', payment_status = 'pending' WHERE id = ?")
      .bind(booking.id)
      .run();

    return c.json({
      click_trans_id: p.click_trans_id,
      merchant_trans_id: p.merchant_trans_id,
      merchant_prepare_id: result.meta.last_row_id,
      error: 0,
      error_note: 'Success',
    });
  }

  if (action === '1') {
    if (!existing) return fail(-6, 'Transaction does not exist');
    if (existing.state === 1) return fail(-4, 'Already paid');

    if (Number(p.error ?? 0) < 0) {
      await c.env.DB.prepare('UPDATE payments SET state = -1, cancel_time = ? WHERE id = ?')
        .bind(Date.now(), existing.id)
        .run();
      await c.env.DB.prepare("UPDATE bookings SET payment_status = 'unpaid' WHERE id = ?")
        .bind(existing.booking_id)
        .run();
      return fail(-9, 'Payment cancelled');
    }

    await c.env.DB.prepare('UPDATE payments SET state = 1, perform_time = ? WHERE id = ?')
      .bind(Date.now(), existing.id)
      .run();
    await c.env.DB.prepare("UPDATE bookings SET payment_status = 'paid', paid_at = datetime('now') WHERE id = ?")
      .bind(existing.booking_id)
      .run();

    return c.json({
      click_trans_id: p.click_trans_id,
      merchant_trans_id: p.merchant_trans_id,
      merchant_confirm_id: existing.id,
      error: 0,
      error_note: 'Success',
    });
  }

  return fail(-3, 'Action not found');
});

// Lokal sinov uchun soxta to'lov sahifasi (faqat PAYMENTS_SIMULATE=1 bo'lganda)
app.get('/api/payments/simulate/:id', async (c) => {
  if (c.env.PAYMENTS_SIMULATE !== '1') return c.text('Not found', 404);

  const id = Number(c.req.param('id'));
  const booking = await c.env.DB.prepare('SELECT * FROM bookings WHERE id = ?').bind(id).first<any>();
  if (!booking) return c.text('Bron topilmadi', 404);

  const provider = c.req.query('provider') === 'click' ? 'Click' : 'Payme';
  const amount = new Intl.NumberFormat('ru-RU').format(Number(booking.total_price));

  return c.html(`<!doctype html>
<html lang="uz"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${provider} — sinov to‘lovi</title></head>
<body style="margin:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#eef1f6;color:#0d1b2a">
  <div style="max-width:420px;margin:40px auto;padding:24px;background:#fff;border-radius:18px;box-shadow:0 12px 30px rgba(15,40,70,.08);text-align:center">
    <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6b7c8f;font-weight:700">${provider}</div>
    <h1 style="font-size:20px;margin:8px 0 4px">Sinov to‘lovi</h1>
    <p style="color:#6b7c8f;font-size:13px;margin:0 0 18px">Bu sahifa faqat lokal sinov uchun. Haqiqiy pul yechilmaydi.</p>
    <div style="font-size:26px;font-weight:800;margin-bottom:18px">${amount} so‘m</div>
    <form method="post" action="/api/payments/simulate/${id}/confirm">
      <button type="submit" style="width:100%;padding:14px;border:0;border-radius:14px;background:#16a34a;color:#fff;font-size:16px;font-weight:700;cursor:pointer">To‘lovni tasdiqlash</button>
    </form>
    <a href="/" style="display:block;margin-top:14px;color:#6b7c8f;font-size:13px;text-decoration:none">Bekor qilish</a>
  </div>
</body></html>`);
});

app.post('/api/payments/simulate/:id/confirm', async (c) => {
  if (c.env.PAYMENTS_SIMULATE !== '1') return c.text('Not found', 404);

  const id = Number(c.req.param('id'));
  const booking = await c.env.DB.prepare('SELECT * FROM bookings WHERE id = ?').bind(id).first<any>();
  if (!booking) return c.text('Bron topilmadi', 404);

  await c.env.DB.prepare("UPDATE bookings SET payment_status = 'paid', paid_at = datetime('now') WHERE id = ?")
    .bind(id)
    .run();

  return c.redirect(c.env.APP_URL ?? publicOrigin(c.req.url));
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
  if (openTime === closeTime && openTime !== '00:00') {
    return { error: 'Ochilish va yopilish vaqti bir xil bo‘lmasin' } as const;
  }
  if (imageUrl && !/^(https?:\/\/|\/)/.test(imageUrl)) {
    return { error: 'Rasm havolasi http(s):// yoki / bilan boshlanishi kerak' } as const;
  }

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
