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
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bookings_field_date ON bookings(field_id, date);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_unique_slot
  ON bookings(field_id, date, start_time) WHERE status != 'cancelled';

-- Boshlang'ich maydonlar (faqat bo'sh baza uchun)
INSERT INTO fields (name, address, price_per_hour, open_time, close_time, image_url)
SELECT 'Markaziy maydon', 'Chilonzor, Bunyodkor 12', 120000, '07:00', '23:00',
       'https://images.unsplash.com/photo-1522778119026-d647f0596c20?w=800&q=60'
WHERE NOT EXISTS (SELECT 1 FROM fields WHERE name = 'Markaziy maydon');

INSERT INTO fields (name, address, price_per_hour, open_time, close_time, image_url)
SELECT 'Yoshlar sport majmuasi', 'Yunusobod, Amir Temur 108', 95000, '08:00', '22:00',
       'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&q=60'
WHERE NOT EXISTS (SELECT 1 FROM fields WHERE name = 'Yoshlar sport majmuasi');

INSERT INTO fields (name, address, price_per_hour, open_time, close_time, image_url)
SELECT 'Mini-futbol arena', 'Mirzo Ulug''bek, Mustaqillik 5', 150000, '09:00', '00:00',
       'https://images.unsplash.com/photo-1518604666860-9ed391f76460?w=800&q=60'
WHERE NOT EXISTS (SELECT 1 FROM fields WHERE name = 'Mini-futbol arena');
