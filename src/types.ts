export type Field = {
  id: number;
  name: string;
  address: string | null;
  price_per_hour: number;
  open_time: string;
  close_time: string;
  image_url: string | null;
  is_active?: number;
};

export type Slot = { time: string; label: string; available: boolean };

export type Booking = {
  id: number;
  field_id: number;
  field_name: string;
  address?: string | null;
  date: string;
  start_time: string;
  end_time: string;
  hours: number;
  total_price: number;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  created_at: string;
  phone?: string;
  user_name?: string;
  username?: string | null;
};

export type TgUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
};

export type Me = { user: TgUser | null; isAdmin: boolean; devMode: boolean };

export type Stats = {
  today: { bookings: number; revenue: number };
  week: { bookings: number };
  pending: number;
  fields: number;
  todayDate: string;
};
