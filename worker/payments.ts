/**
 * Payme va Click uchun yordamchi funksiyalar.
 * - md5: Click imzosini tekshirish uchun (WebCrypto'da MD5 yo'q)
 * - Payme/Click to'lov havolalari
 * - Basic auth tekshiruvi
 */

/* -------------------------------- MD5 (RFC 1321) -------------------------- */

const SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14,
  20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10,
  15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

const TABLE = new Uint32Array(64);
for (let i = 0; i < 64; i++) TABLE[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;

export function md5(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const length = bytes.length;
  const padded = new Uint8Array((((length + 8) >> 6) + 1) * 64);
  padded.set(bytes);
  padded[length] = 0x80;

  const view = new DataView(padded.buffer);
  const bits = length * 8;
  view.setUint32(padded.length - 8, bits >>> 0, true);
  view.setUint32(padded.length - 4, Math.floor(bits / 4294967296), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  const block = new Uint32Array(16);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) block[i] = view.getUint32(offset + i * 4, true);

    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }

      const sum = (a + f + TABLE[i] + block[g]) >>> 0;
      const rotated = ((sum << SHIFTS[i]) | (sum >>> (32 - SHIFTS[i]))) >>> 0;
      const next = (b + rotated) >>> 0;

      a = d;
      d = c;
      c = b;
      b = next;
    }

    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  return [a0, b0, c0, d0]
    .map((word) =>
      [0, 8, 16, 24].map((shift) => ((word >>> shift) & 0xff).toString(16).padStart(2, '0')).join(''),
    )
    .join('');
}

/* -------------------------------- auth helpers ---------------------------- */

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function checkBasicAuth(header: string, login: string, password: string): boolean {
  const raw = (header ?? '').replace(/^Basic\s+/i, '');
  if (!raw) return false;

  let decoded: string;
  try {
    decoded = atob(raw);
  } catch {
    return false;
  }
  return safeEqual(decoded, `${login}:${password}`);
}

/* ------------------------------- payme / click ---------------------------- */

/** Payme to'lov sahifasi: https://checkout.paycom.uz/base64(m;ac.booking_id;a;c;l) */
export function paymeCheckoutUrl(
  merchantId: string,
  bookingId: number,
  amountSom: number,
  returnUrl: string,
): string {
  const params = `m=${merchantId};ac.booking_id=${bookingId};a=${amountSom * 100};c=${returnUrl};l=uz`;
  return `https://checkout.paycom.uz/${btoa(params)}`;
}

/** Click to'lov sahifasi (my.click.uz/services/pay). */
export function clickPayUrl(
  serviceId: string,
  merchantId: string,
  bookingId: number,
  amountSom: number,
  returnUrl: string,
): string {
  const query = new URLSearchParams({
    service_id: serviceId,
    merchant_id: merchantId,
    amount: String(amountSom),
    transaction_param: String(bookingId),
    return_url: returnUrl,
  });
  return `https://my.click.uz/services/pay?${query.toString()}`;
}
