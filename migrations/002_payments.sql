-- Mavjud bazani to'lov tizimlariga moslashtirish (bir marta ishga tushiriladi)
-- npx wrangler d1 execute football-booking --local --file=./migrations/002_payments.sql

ALTER TABLE bookings ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'arrival';
ALTER TABLE bookings ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'unpaid';
ALTER TABLE bookings ADD COLUMN paid_at TEXT;

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

-- Bitta maydon: soatiga svet bilan 100 000 so'm
UPDATE fields
SET name = 'Futbol maydoni — svet bilan',
    price_per_hour = 100000,
    open_time = '07:00',
    close_time = '23:00',
    image_url = 'https://images.unsplash.com/photo-1522778119026-d647f0596c20?w=800&q=60',
    is_active = 1
WHERE id = (SELECT MIN(id) FROM fields);

UPDATE fields SET is_active = 0 WHERE id != (SELECT MIN(id) FROM fields);
