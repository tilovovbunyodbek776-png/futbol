# ⚽ Futbol Maydoni — Telegram Mini App

Futbol maydonini onlayn bron qilish ilovasi: **Telegram Mini App** (React + Vite) + **Cloudflare Worker API** (Hono) + **D1 (SQLite)** baza va **admin panel**.

## Imkoniyatlar

**Foydalanuvchi (Telegram ichida)**
- Maydonlar ro'yxati: narx, manzil, ish vaqti, rasm
- 14 kunlik sana tanlash
- Ish jadvali asosida avtomatik hisoblangan bo'sh vaqt slotlari (band va o'tgan vaqtlar bloklanadi)
- 1–3 soatlik davomiylik, narx avtomatik hisoblanadi
- Ism va telefon raqami bilan bron yuborish
- "Bronlarim" — faol bronlar, tarix va bekor qilish

**Admin panel** (`Admin` tab)
- Parol bilan kirish (`ADMIN_PASSWORD`) yoki Telegram ID bo'yicha avtomatik admin
- Bronlar: sana/holat bo'yicha filtr, tasdiqlash, yakunlash, bekor qilish, telefonga qo'ng'iroq
- Maydonlar: qo'shish, tahrirlash, faolsizlantirish (narx, ish vaqti, rasm)
- Statistika: bugungi bronlar va tushum, tasdiq kutayotganlar, 7 kunlik bronlar

**Xavfsizlik**
- Telegram `initData` imzosi bot tokeni bilan HMAC-SHA256 orqali serverda tekshiriladi
- Admin sessiyasi imzolangan token bilan (12 soat)
- Har bir so'rovda vaqt to'qnashuvi SQL darajasida tekshiriladi (unique index + overlap check)

## 1. O'rnatish

```bash
npm install
npm run db:init      # lokal D1 bazani yaratadi va 3 ta namunaviy maydon qo'shadi
```

## 2. Sozlamalar

`.dev.vars` faylini oching:

```ini
TELEGRAM_BOT_TOKEN=""      # @BotFather'dan olinadigan token
ADMIN_PASSWORD="admin123"  # admin panel paroli
ADMIN_IDS=""               # admin Telegram ID'lari, vergul bilan: "123456789,987654321"
DEV_MODE="1"               # brauzerda sinash uchun (Telegramsiz "Mehmon" foydalanuvchisi)
TZ_OFFSET_MINUTES="300"    # UTC+5 (Toshkent)
```

> `DEV_MODE="1"` faqat lokal sinov uchun. Ishga tushirishda `DEV_MODE="0"` qiling, aks holda Telegram imzosi bo'lmagan har qanday so'rov "Mehmon" sifatida qabul qilinadi.

## 3. Ishga tushirish

Ikki terminal kerak:

```bash
npm run dev:api    # Worker + lokal D1 -> http://127.0.0.1:8787
npm run dev:web    # Vite frontend    -> http://127.0.0.1:5173
```

Brauzerda `http://127.0.0.1:5173` ni oching. Admin: pastdagi **Admin** tab → parol `admin123`.

## 4. Telegram botga ulash

1. [@BotFather](https://t.me/BotFather) → `/newbot` → bot yaratib, **token**ni oling va `.dev.vars` ga yozing.
2. `/newapp` → botni tanlang → Mini App nomi, rasm va **URL** kiriting.
   - Lokal sinov uchun HTTPS tunnel kerak (masalan `cloudflared tunnel --url http://localhost:5173`) va shu tunnel URL'ini bering.
3. Mini App'ni oching — ilova ism va telefonni Telegram'dan oladi.

`initData` faqat HTTPS orqali va Telegram ichida keladi, shuning uchun bot tokenini faqat haqiqiy domenda ulaganingizdan keyin to'ldiring.

## 5. Admin qilish

Ikki yo'l:

- **Telegram ID:** o'z ID'ingizni [@userinfobot](https://t.me/userinfobot) dan bilib, `ADMIN_IDS="123456789"` ga yozing. Bu foydalanuvchi admin panelga parolsiz kiradi.
- **Parol:** istalgan qurilmada **Admin** tab → `ADMIN_PASSWORD`.

## 6. API

| Metod | Yo'l | Tavsif |
|---|---|---|
| GET | `/api/me` | Joriy foydalanuvchi va admin holati |
| GET | `/api/fields` | Faol maydonlar |
| GET | `/api/fields/:id/slots?date=YYYY-MM-DD` | Kunlik bo'sh slotlar |
| POST | `/api/bookings` | Bron yaratish |
| GET | `/api/bookings/my` | Mening bronlarim |
| POST | `/api/bookings/:id/cancel` | Bronni bekor qilish |
| POST | `/api/admin/login` | Admin parol bilan kirish |
| GET | `/api/admin/stats` | Statistika |
| GET | `/api/admin/bookings?date=&status=` | Barcha bronlar |
| POST | `/api/admin/bookings/:id/status` | Holatni o'zgartirish |
| GET/POST/PUT/DELETE | `/api/admin/fields` | Maydonlarni boshqarish |

## 7. Baza

`bookings` jadvali: `(field_id, date, start_time)` bo'yicha unique index — bir vaqtga ikki bron tushmaydi. Bron bekor qilinsa (`status = 'cancelled'`) indexdan chiqadi va vaqt yana bo'shaydi.

## 8. Deploy

Ishga tushirish uchun:

```bash
npm run build          # dist/ ichida statik fayllar
```

Worker'ni Cloudflare'ga joylashda D1 bazani yaratib, `wrangler.jsonc` dagi `database_id` ni almashtiring va quyidagi maxfiy sozlamalarni bering:

```bash
npx wrangler d1 create football-booking
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put ADMIN_IDS
```

`DEV_MODE` ni productionda **hech qachon** `1` qilmang.
