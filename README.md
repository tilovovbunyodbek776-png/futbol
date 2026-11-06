# ⚽ Futbol Maydoni — Telegram Mini App

Futbol maydonini onlayn bron qilish ilovasi: **oddiy veb-sayt** (React + Vite) + **Cloudflare Worker API** (Hono) + **D1 (SQLite)** baza va **admin panel**.

Sayt brauzerda mustaqil ishlaydi (ism + telefon raqami bilan kirish), Telegram ichida esa **Mini App** sifatida ochilsa foydalanuvchi avtomatik aniqlanadi.

## Imkoniyatlar

**Foydalanuvchi (Telegram ichida)**
- Maydonlar ro'yxati: narx, manzil, ish vaqti, rasm
- 14 kunlik sana tanlash
- Ish jadvali asosida avtomatik hisoblangan bo'sh vaqt slotlari (band va o'tgan vaqtlar bloklanadi)
- 1–3 soatlik davomiylik, narx avtomatik hisoblanadi
- To‘lov usuli: **Payme**, **Click** (onlayn) yoki **joyida to‘lash**
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
SESSION_SECRET="..."       # sayt sessiyasini imzolash kaliti (uzun, tasodifiy)
TZ_OFFSET_MINUTES="300"    # UTC+5 (Toshkent)

PAYME_MERCHANT_ID=""       # Payme merchant ID (web-kassa)
PAYME_KEY=""               # Payme maxfiy kaliti
CLICK_SERVICE_ID=""        # Click service_id
CLICK_MERCHANT_ID=""       # Click merchant_id
CLICK_SECRET_KEY=""        # Click maxfiy kaliti
APP_URL=""                 # to‘lovdan keyin qaytadigan manzil
PAYMENTS_SIMULATE="1"      # lokal sinovda soxta to‘lov sahifasi
```

> `SESSION_SECRET` bo'sh bo'lsa `ADMIN_PASSWORD` ishlatiladi. Productionda alohida uzun tasodifiy qiymat qo'ying.

## 3. Ishga tushirish

Ikki terminal kerak:

```bash
npm run dev:api    # Worker + lokal D1 -> http://127.0.0.1:8787
npm run dev:web    # Vite frontend    -> http://127.0.0.1:5173
```

Brauzerda `http://127.0.0.1:5173` ni oching — ism va telefon raqami bilan kiring, Telegram shart emas. Admin: **Admin panel** → parol `admin123`.

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
| POST | `/api/auth/login` | Saytga kirish (ism + telefon) → sessiya tokeni |
| GET | `/api/fields` | Faol maydonlar |
| GET | `/api/fields/:id/slots?date=YYYY-MM-DD` | Kunlik bo'sh slotlar |
| POST | `/api/bookings` | Bron yaratish (to‘lov usuli bilan) |
| POST | `/api/bookings/:id/pay` | To‘lov havolasi (Payme/Click) |
| POST | `/api/payments/payme` | Payme Merchant API (Payme → server) |
| POST/GET | `/api/payments/click` | Click SHOP API: prepare/complete |
| GET | `/api/bookings/my` | Mening bronlarim |
| POST | `/api/bookings/:id/cancel` | Bronni bekor qilish |
| POST | `/api/admin/login` | Admin parol bilan kirish |
| GET | `/api/admin/stats` | Statistika |
| GET | `/api/admin/bookings?date=&status=` | Barcha bronlar |
| POST | `/api/admin/bookings/:id/status` | Holatni o'zgartirish |
| GET/POST/PUT/DELETE | `/api/admin/fields` | Maydonlarni boshqarish |

## 7. Baza

`bookings` jadvali: `(field_id, date, start_time)` bo'yicha unique index — bir vaqtga ikki bron tushmaydi. Bron bekor qilinsa (`status = 'cancelled'`) indexdan chiqadi va vaqt yana bo'shaydi.

## 8. To‘lovlarni ulash

1. **Payme:** merchant kabinetda web-kassa yaratib, `PAYME_MERCHANT_ID` va `PAYME_KEY` ni oling. Merchant API manzili sifatida `https://<sayt>/api/payments/payme` ni ko‘rsating, account maydoni `booking_id`.
2. **Click:** Shop API uchun `CLICK_SERVICE_ID`, `CLICK_MERCHANT_ID`, `CLICK_SECRET_KEY` ni oling. Prepare URL: `https://<sayt>/api/payments/click`, Complete URL: `https://<sayt>/api/payments/click`.
3. To‘lovdan keyin foydalanuvchi `APP_URL` ga qaytadi.

> `PAYMENTS_SIMULATE="1"` faqat lokal sinov uchun: Payme/Click o‘rniga soxta to‘lov sahifasi ochiladi. Productionda **albatta** `0` bo‘lsin.

To‘lov tasdiqlanganda bron `payment_status = 'paid'` bo‘ladi, bekor qilinsa yana `unpaid` ga qaytadi. Har bir tranzaksiya `payments` jadvalida saqlanadi.

## 9. Deploy

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
npx wrangler secret put SESSION_SECRET
npx wrangler secret put PAYME_MERCHANT_ID
npx wrangler secret put PAYME_KEY
npx wrangler secret put CLICK_SERVICE_ID
npx wrangler secret put CLICK_MERCHANT_ID
npx wrangler secret put CLICK_SECRET_KEY
```

`SESSION_SECRET` uzun va tasodifiy bo'lsin — u orqali sayt sessiyalari imzolanadi.
