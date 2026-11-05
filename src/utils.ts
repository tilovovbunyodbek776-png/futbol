import type { Booking } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export const WEEKDAYS = ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan'];
export const MONTHS = ['yanv', 'fev', 'mart', 'apr', 'may', 'iyun', 'iyul', 'avg', 'sen', 'okt', 'noy', 'dek'];

export const formatPrice = (value: number) =>
  `${new Intl.NumberFormat('ru-RU').format(Math.round(value))} so‘m`;

export const toISODate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const todayISO = () => toISODate(new Date());

export const addDaysISO = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toISODate(d);
};

export const parseISODate = (iso: string) => new Date(`${iso}T12:00:00`);

export const formatDateHuman = (iso: string) => {
  const d = parseISODate(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

export const formatDateFull = (iso: string) => {
  const d = parseISODate(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${WEEKDAYS[d.getDay()]}`;
};

export const STATUS_LABEL: Record<Booking['status'], string> = {
  pending: 'Kutilmoqda',
  confirmed: 'Tasdiqlangan',
  cancelled: 'Bekor qilingan',
  completed: 'Yakunlangan',
};

export const initials = (name?: string | null) =>
  (name ?? '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
