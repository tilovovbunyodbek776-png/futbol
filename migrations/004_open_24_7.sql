-- Maydon kun bo'yi (24/7) ishlaydi: ochilish = yopilish = 00:00
-- npx wrangler d1 execute football-booking --local --file=./migrations/004_open_24_7.sql

UPDATE fields SET open_time = '00:00', close_time = '00:00' WHERE is_active = 1;
