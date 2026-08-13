"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { api, SeatMapOut, EventSummaryOut } from "@/lib/api";

export default function AdminEventPage() {
  const params = useParams();
  const eventId = Number(params.id);

  const [seatMap, setSeatMap] = useState<SeatMapOut | null>(null);
  const [summary, setSummary] = useState<EventSummaryOut | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [sm, sum] = await Promise.all([
        api.getSeatMap(eventId),
        api.getSummary(eventId),
      ]);
      setSeatMap(sm);
      setSummary(sum);
    } catch (e: any) {
      setError(e.message);
    }
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!seatMap || !summary) {
    return <div>{error ? <p className="error-banner">{error}</p> : <p>Loading…</p>}</div>;
  }

  const { event, seats } = seatMap;
  const seatByPosition = new Map(seats.map((s) => [`${s.row_num}-${s.col_num}`, s]));

  const toggleSelect = (seatId: number, status: string) => {
    if (status === "booked") return; // can't block a booked seat here
    setSelected((prev) =>
      prev.includes(seatId) ? prev.filter((id) => id !== seatId) : [...prev, seatId]
    );
  };

  const applyBlock = async (isBlocked: boolean) => {
    if (selected.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await api.blockSeats(eventId, selected, isBlocked);
      setSelected([]);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1>{event.name} — Admin</h1>
      <p>{event.event_date}</p>

      <div className="summary-grid">
        <div className="stat">
          <span className="num">{summary.total_seats}</span>
          <span className="label">Total seats</span>
        </div>
        <div className="stat">
          <span className="num">{summary.booked_seats}</span>
          <span className="label">Booked</span>
        </div>
        <div className="stat">
          <span className="num">{summary.available_seats}</span>
          <span className="label">Available</span>
        </div>
        <div className="stat">
          <span className="num">{summary.blocked_seats}</span>
          <span className="label">Blocked</span>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <h2>Seat Layout</h2>
      <p>Click seats to select, then block or unblock them (e.g. VIP holds, out of service).</p>
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
      <div className="seat-map-scroll">
        <div className="seat-grid" style={{ gridTemplateColumns: `repeat(${event.cols}, 34px)` }}>
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
                  onClick={() => toggleSelect(seat.id, seat.status)}
                  disabled={seat.status === "booked"}
                >
                  {seat.label}
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="booking-panel">
        <p>{selected.length} seat(s) selected</p>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button onClick={() => applyBlock(true)} disabled={busy || selected.length === 0}>
            Block selected
          </button>
          <button
            className="secondary"
            onClick={() => applyBlock(false)}
            disabled={busy || selected.length === 0}
          >
            Unblock selected
          </button>
        </div>
      </div>

      <h2 style={{ marginTop: "2rem" }}>Bookings</h2>
      {summary.bookings.length === 0 ? (
        <p>No bookings yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Seats</th>
              <th>Name</th>
              <th>Email</th>
              <th>Booked at</th>
            </tr>
          </thead>
          <tbody>
            {summary.bookings.map((b) => (
              <tr key={b.group_id}>
                <td>{b.seats.join(", ")}</td>
                <td>{b.booker_name}</td>
                <td>{b.booker_email}</td>
                <td>{new Date(b.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
