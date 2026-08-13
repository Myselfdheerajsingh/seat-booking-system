"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, EventOut } from "@/lib/api";

export default function AdminPage() {
  const [events, setEvents] = useState<EventOut[]>([]);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [rows, setRows] = useState(8);
  const [cols, setCols] = useState(10);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    try {
      setEvents(await api.listEvents());
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async () => {
    setError(null);
    if (!name.trim() || !date || rows < 1 || cols < 1) {
      setError("Fill in name, date, rows, and columns.");
      return;
    }
    setSubmitting(true);
    try {
      await api.createEvent({ name: name.trim(), event_date: date, rows, cols });
      setName("");
      setDate("");
      setRows(8);
      setCols(10);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h1>Admin</h1>

      <div className="card">
        <h2>Create Event</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={(e) => e.preventDefault()}>
          <div>
            <label>Event name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Coldplay Live" />
          </div>
          <div>
            <label>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label>Rows</label>
            <input
              type="number"
              min={1}
              max={100}
              value={rows}
              onChange={(e) => setRows(Number(e.target.value))}
            />
          </div>
          <div>
            <label>Seats per row</label>
            <input
              type="number"
              min={1}
              max={100}
              value={cols}
              onChange={(e) => setCols(Number(e.target.value))}
            />
          </div>
          <button onClick={submit} disabled={submitting}>
            {submitting ? "Creating…" : "Create Event"}
          </button>
        </form>
      </div>

      <h2>Events</h2>
      {events.map((ev) => (
        <Link key={ev.id} href={`/admin/${ev.id}`} className="event-list-item">
          <div className="card">
            <h3>{ev.name}</h3>
            <p>
              {ev.event_date} &middot; {ev.rows} &times; {ev.cols} layout
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
