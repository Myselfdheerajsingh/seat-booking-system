import Link from "next/link";
import { api, EventOut } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let events: EventOut[];
  let loadError: string | null = null;
  try {
    events = await api.listEvents();
  } catch (e: any) {
    loadError = e.message || "Could not load events";
    events = [];
  }

  return (
    <div>
      <h1>Upcoming Events</h1>
      {loadError && (
        <div className="error-banner">
          Couldn&apos;t reach the API ({loadError}). Is the backend running?
        </div>
      )}
      {events.length === 0 && !loadError && (
        <p>No events yet. Create one from the Admin page.</p>
      )}
      {events.map((ev) => (
        <Link key={ev.id} href={`/events/${ev.id}`} className="event-list-item">
          <div className="card">
            <h3>{ev.name}</h3>
            <p>
              {ev.event_date} &middot; {ev.rows * ev.cols} seats ({ev.rows} rows &times;{" "}
              {ev.cols} cols)
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
