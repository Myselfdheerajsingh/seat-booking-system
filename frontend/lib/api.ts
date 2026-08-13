const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type EventOut = {
  id: number;
  name: string;
  event_date: string;
  rows: number;
  cols: number;
};

export type SeatOut = {
  id: number;
  row_num: number;
  col_num: number;
  label: string;
  is_blocked: boolean;
  status: "available" | "booked" | "blocked";
};

export type SeatMapOut = {
  event: EventOut;
  seats: SeatOut[];
};

export type BookingGroupOut = {
  group_id: string;
  seats: string[];
  booker_name: string;
  booker_email: string;
  created_at: string;
};

export type EventSummaryOut = {
  event: EventOut;
  total_seats: number;
  blocked_seats: number;
  booked_seats: number;
  available_seats: number;
  bookings: BookingGroupOut[];
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      // ignore
    }
    throw new ApiError(detail, res.status);
  }
  return res.json();
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const api = {
  listEvents: () => request<EventOut[]>("/events"),
  createEvent: (data: { name: string; event_date: string; rows: number; cols: number }) =>
    request<EventOut>("/events", { method: "POST", body: JSON.stringify(data) }),
  getSeatMap: (eventId: number) => request<SeatMapOut>(`/events/${eventId}/seats`),
  blockSeats: (eventId: number, seatIds: number[], isBlocked: boolean) =>
    request(`/events/${eventId}/seats/block`, {
      method: "POST",
      body: JSON.stringify({ seat_ids: seatIds, is_blocked: isBlocked }),
    }),
  getSummary: (eventId: number) => request<EventSummaryOut>(`/events/${eventId}/summary`),
  createBooking: (data: {
    event_id: number;
    seat_ids: number[];
    booker_name: string;
    booker_email: string;
  }) => request(`/bookings`, { method: "POST", body: JSON.stringify(data) }),
};
