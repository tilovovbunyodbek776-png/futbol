-- Futbol maydoni bronlash tizimi sxemasi (Cloudflare D1 / SQLite)

CREATE TABLE IF NOT EXISTS fields (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT,
  price_per_hour INTEGER NOT NULL,
  open_time TEXT NOT NULL DEFAULT '08:00',
  close_time TEXT NOT NULL DEFAULT '23:00',
  image_url TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  field_id INTEGER NOT NULL REFERENCES fields(id),
  user_id INTEGER NOT NULL,
  user_name TEXT NOT NULL,
  username TEXT,
  phone TEXT NOT NULL,
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  hours INTEGER NOT NULL,
  total_price INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_method TEXT NOT NULL DEFAULT 'arrival',
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Payme / Click tranzaksiyalari
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id),
  provider TEXT NOT NULL,
  provider_trans_id TEXT,
  amount INTEGER NOT NULL,
  state INTEGER NOT NULL DEFAULT 0,
  create_time INTEGER NOT NULL,
  perform_time INTEGER,
  cancel_time INTEGER,
  reason INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_trans ON payments(provider, provider_trans_id);
CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_id);

CREATE INDEX IF NOT EXISTS idx_bookings_field_date ON bookings(field_id, date);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_unique_slot
  ON bookings(field_id, date, start_time) WHERE status != 'cancelled';

-- Boshlang'ich maydonlar (faqat bo'sh baza uchun)
INSERT INTO fields (name, address, price_per_hour, open_time, close_time, image_url)
SELECT 'Futbol maydoni — svet bilan', 'Nurobod tumani, Ibrohim Ota qishlog‘i', 100000, '00:00', '00:00',
       '/field-7x7.svg'
WHERE NOT EXISTS (SELECT 1 FROM fields WHERE name LIKE 'Futbol maydoni%');

-- Saytga telefon raqami bilan kirgan foydalanuvchilar
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
