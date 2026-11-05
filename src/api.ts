import type { Booking, Field, Me, Slot, Stats } from './types';

const TOKEN_KEY = 'fm_admin_token';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const getAdminToken = () => localStorage.getItem(TOKEN_KEY) ?? '';
export const setAdminToken = (token: string | null) => {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
};

const initData = () => window.Telegram?.WebApp?.initData ?? '';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');

  const tg = initData();
  if (tg) headers.set('X-Telegram-Init-Data', tg);

  const token = getAdminToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`/api${path}`, { ...options, headers });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      if (token && path !== '/admin/login') setAdminToken(null);
    }
    throw new ApiError((data.error as string) ?? 'Server xatosi. Qayta urinib ko‘ring.', res.status);
  }
  return data as T;
}

export const api = {
  me: () => request<Me>('/me'),

  fields: () => request<{ fields: Field[] }>('/fields'),

  slots: (fieldId: number, date: string) =>
    request<{ field: Field; date: string; slots: Slot[] }>(`/fields/${fieldId}/slots?date=${date}`),

  createBooking: (payload: {
    fieldId: number;
    date: string;
    startTime: string;
    hours: number;
    name: string;
    phone: string;
  }) =>
    request<{ booking: Booking }>('/bookings', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  myBookings: () => request<{ bookings: Booking[]; today: string }>('/bookings/my'),

  cancelBooking: (id: number) => request<{ ok: true }>(`/bookings/${id}/cancel`, { method: 'POST' }),

  adminLogin: (password: string) =>
    request<{ token: string }>('/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  adminStats: () => request<Stats>('/admin/stats'),

  adminBookings: (params: { date?: string; status?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.date) q.set('date', params.date);
    if (params.status) q.set('status', params.status);
    const qs = q.toString();
    return request<{ bookings: Booking[] }>(`/admin/bookings${qs ? `?${qs}` : ''}`);
  },

  adminSetStatus: (id: number, status: Booking['status']) =>
    request<{ ok: true }>(`/admin/bookings/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),

  adminFields: () => request<{ fields: Field[] }>('/admin/fields'),

  adminSaveField: (field: Partial<Field> & { name: string; price_per_hour: number }) => {
    if (field.id) {
      return request<{ ok: true }>(`/admin/fields/${field.id}`, {
        method: 'PUT',
        body: JSON.stringify(field),
      });
    }
    return request<{ id: number }>('/admin/fields', {
      method: 'POST',
      body: JSON.stringify(field),
    });
  },

  adminDeleteField: (id: number) =>
    request<{ ok: true }>(`/admin/fields/${id}`, { method: 'DELETE' }),
};
