"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { api, SeatMapOut, ApiError } from "@/lib/api";

const POLL_INTERVAL_MS = 5000;

export default function EventSeatMapPage() {
  const params = useParams();
  const eventId = Number(params.id);

  const [data, setData] = useState<SeatMapOut | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const seatMap = await api.getSeatMap(eventId);
      setData(seatMap);
      // Drop any selected seats that were just taken by someone else.
      setSelected((prev) =>
        prev.filter((id) => {
          const seat = seatMap.seats.find((s) => s.id === id);
          return seat && seat.status === "available";
        })
      );
    } catch (e: any) {
      setError(e.message || "Failed to load seat map");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    load();
    // Refetch on an interval and whenever the tab regains focus, so seats
    // booked by other users show up without a manual refresh.
    const interval = setInterval(load, POLL_INTERVAL_MS);
    window.addEventListener("focus", load);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", load);
    };
  }, [load]);

  if (loading) return <p>Loading seat map…</p>;
  if (!data) return <p className="error-banner">{error || "Event not found"}</p>;

  const { event, seats } = data;

  const toggleSeat = (seatId: number, status: string) => {
    if (status !== "available") return;
    setSuccess(null);
    setSelected((prev) =>
      prev.includes(seatId) ? prev.filter((id) => id !== seatId) : [...prev, seatId]
    );
  };

  const submitBooking = async () => {
    setError(null);
    setSuccess(null);
    if (selected.length === 0) {
      setError("Select at least one seat.");
      return;
    }
    if (!name.trim() || !email.trim()) {
      setError("Enter your name and email.");
      return;
    }
    setSubmitting(true);
    try {
      await api.createBooking({
        event_id: eventId,
        seat_ids: selected,
        booker_name: name.trim(),
        booker_email: email.trim(),
      });
      setSuccess(`Booked ${selected.length} seat(s) successfully!`);
      setSelected([]);
      setName("");
      setEmail("");
      await load();
    } catch (e: any) {
      // 409: someone else grabbed a seat in between — reload the map so
      // the user sees current availability instead of a stale view.
      if (e instanceof ApiError && e.status === 409) {
        setError(e.message);
        await load();
      } else {
        setError(e.message || "Booking failed. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const seatByPosition = new Map(seats.map((s) => [`${s.row_num}-${s.col_num}`, s]));

  return (
    <div>
      <h1>{event.name}</h1>
      <p>{event.event_date}</p>

      <div className="legend">
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: "#e8eaf0" }} /> Available
        </span>
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: "#2563eb" }} /> Selected
        </span>
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: "#d1d5db" }} /> Booked
        </span>
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: "#fca5a5" }} /> Blocked
        </span>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner">{success}</div>}

      <div className="seat-map-scroll">
        <div
          className="seat-grid"
          style={{ gridTemplateColumns: `repeat(${event.cols}, 34px)` }}
        >
          {Array.from({ length: event.rows }).map((_, rIdx) =>
            Array.from({ length: event.cols }).map((_, cIdx) => {
              const seat = seatByPosition.get(`${rIdx + 1}-${cIdx + 1}`);
              if (!seat) return <div key={`${rIdx}-${cIdx}`} />;
              const isSelected = selected.includes(seat.id);
              const cls = isSelected ? "selected" : seat.status;
              return (
                <button
                  key={seat.id}
                  type="button"
                  className={`seat ${cls}`}
                  title={seat.label}
                  onClick={() => toggleSeat(seat.id, seat.status)}
                  disabled={seat.status !== "available" && !isSelected}
                >
                  {seat.label}
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="booking-panel">
        <h3>
          {selected.length > 0
            ? `${selected.length} seat(s) selected`
            : "Select seats to book"}
        </h3>
        <form onSubmit={(e) => e.preventDefault()}>
          <div>
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
          </div>
          <div>
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com"
            />
          </div>
          <button onClick={submitBooking} disabled={submitting || selected.length === 0}>
            {submitting ? "Booking…" : "Confirm Booking"}
          </button>
        </form>
      </div>
    </div>
  );
}
