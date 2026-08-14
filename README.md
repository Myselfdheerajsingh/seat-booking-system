# Event Seat Booking System

Full-stack seat booking app — admin configures events and seating layout,
users select and book seats, with database-level guarantees against
double-booking. Built for the NeuBitAt technical assignment.

**Stack:** Next.js (frontend) · FastAPI (backend) · MySQL (database)

---

## Live Demo

- **Frontend (app):** https://seatbooking-waze.onrender.com/
- **Backend API docs (Swagger):** https://seat-booking-system-7p0z.onrender.com/docs
- **GitHub repo:** https://github.com/Myselfdheerajsingh/seat-booking-system

> Note: both services run on Render's free tier and may take 30–60s to
> wake up if idle. The database (Aiven, free tier) also auto-pauses on
> inactivity — if the app shows a connection error on first load, wait
> a minute and refresh; it wakes automatically on the next request.

---

## 1. Setup

### Database

```sql
CREATE DATABASE seat_booking;
```

Tables are created automatically on backend startup (`Base.metadata.create_all`).

### Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate   # or venv\Scripts\activate on Windows
pip install -r requirements.txt
cp .env.example .env   # fill in DATABASE_URL with your MySQL credentials
uvicorn app.main:app --reload
```

API docs (Swagger/OpenAPI): http://localhost:8000/docs

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local   # points at the backend URL
npm run dev
```

App: http://localhost:3000 (seat booking) · http://localhost:3000/admin (admin)

---

## 2. Design decisions

### Layout model: rows × columns

Events are modeled as a `rows × cols` grid rather than named sections. This
was chosen because:
- It generalizes to any venue shape without needing a separate "sections"
  table, while still allowing per-seat overrides (blocking, and price tiers
  as a future extension) since every seat is a real row in the `seats`
  table, not just an implied number.
- Row labels are generated spreadsheet-style (1→A, 2→B, ..., 27→AA) so seat
  labels stay human-readable (`A1`, `B12`, ...) at any size.
- A named-sections model (Gold/Silver) would require an extra join table and
  mainly buys pricing/zone grouping — noted below as a natural extension via
  the existing per-seat rows.

### Schema

- **`events`** — id, name, event_date, rows, cols
- **`seats`** — id, event_id (FK), row_num, col_num, label, is_blocked
  - Unique constraint on `(event_id, row_num, col_num)` to prevent duplicate
    seat positions.
  - `is_blocked` is admin-controlled and independent of bookings (VIP
    holds, out-of-service seats).
- **`bookings`** — id, event_id (FK), seat_id (FK), booker_name,
  booker_email, group_id, created_at
  - **Unique constraint on `(event_id, seat_id)`** — this is the hard
    database-level guarantee against double-booking (see §3).
  - `group_id` (UUID) ties multiple seat rows together when one user books
    several seats in a single request, so a group can be displayed and
    (eventually) cancelled as a unit.

Seat **status** (`available` / `booked` / `blocked`) is never stored — it's
derived at read time from `is_blocked` plus the presence of a booking row.
This means status can never drift out of sync with the bookings table.

### API

REST endpoints (see `/docs` for full schemas):

| Method | Path                          | Purpose                          |
|--------|-------------------------------|-----------------------------------|
| POST   | `/events`                     | Create event (generates seat grid)|
| GET    | `/events`                     | List events                       |
| GET    | `/events/{id}/seats`          | Seat map with derived status      |
| POST   | `/events/{id}/seats/block`    | Block/unblock seats (admin)       |
| GET    | `/events/{id}/summary`        | Dashboard: counts + booking list  |
| POST   | `/bookings`                   | Book one or more seats            |

`POST /bookings` returns `201` with the created bookings, or `409 Conflict`
with a message naming the unavailable seats — never a generic `500` or a
silent `200` for a failed booking.

---

## 3. Concurrency & data integrity (core focus)

Two independent layers of protection, both at the database level — not just
in application code:

**Layer 1 — Row-level locking (`SELECT ... FOR UPDATE`).**
`create_booking` (in `backend/app/crud.py`) opens a transaction, locks the
requested seat rows in a fixed ascending-id order (to avoid deadlocks
between transactions requesting overlapping seats), then performs a
**locking read** on the `bookings` table for those seat ids. Under InnoDB, a
locking read (`FOR UPDATE`) always reads the latest *committed* data
regardless of transaction isolation level — so a second transaction that
was blocked waiting for the first to commit will correctly see the booking
the first transaction just created, and abort cleanly instead of racing
past it.

**Layer 2 — Unique constraint on `(event_id, seat_id)` in `bookings`.**
This is the backstop: even if the locking logic above had a bug, or ran
under different isolation settings, MySQL itself rejects a second `INSERT`
for an already-booked seat with an integrity error, which the API catches
and turns into a `409`.

**Atomicity for multi-seat bookings.** All seats in one booking request are
locked, checked, and inserted inside a single transaction. If *any* seat in
the request is unavailable, the entire transaction is rolled back — nothing
is partially booked. The API reports which seats were the problem.

**Demonstrating it:** `backend/test_concurrency.py` fires two booking
requests for the same seat from two threads at nearly the same instant and
asserts exactly one succeeds (`201`) and the other is rejected (`409`).
This has been run against the **live deployment**, not just locally — one
request returns `201`, the other `409 Conflict` naming the contested seat.

```bash
cd backend
python test_concurrency.py
```

(Edit `API_URL`, `EVENT_ID`, and `SEAT_ID` at the top of the script to
point at your own running instance and an available seat.)

---

## 4. Frontend behavior

- Seat map renders as a CSS grid; available / selected / booked / blocked
  states are color-coded (see legend on each page).
- Multi-seat selection before a single booking submission.
- The seat map **polls every 5s and refetches on window focus**, so seats
  booked by other users become unavailable without a manual page refresh.
- If a booking is rejected with `409` (someone else took a seat in the
  gap between viewing and submitting), the error is shown and the seat map
  is refreshed immediately so the user sees current availability.
- Admin dashboard shows total/booked/available/blocked counts and a table
  of individual bookings (seats, name, email, timestamp), plus seat
  blocking/unblocking.

---

## 5. Known limitations / trade-offs

- No authentication anywhere (per spec) — admin routes are unauthenticated
  and reachable by anyone who knows the URL.
- No booking cancellation, price tiers, or confirmation email (listed as
  optional bonus items in the spec; not implemented to keep focus on the
  concurrency requirement).
- Frontend polling (5s) rather than WebSockets — acceptable per spec, but
  means up to a 5s lag before a booking made by someone else visibly
  disables a seat (the 409-on-submit + refetch path is the real safety net,
  not the poll).
- No pagination on the events or bookings lists — fine at assignment scale,
  would need it for a large number of events/bookings in production.
- Frontend is deployed on Render rather than Vercel (the backend hosting
  choice explicitly allows "Render/Railway or similar"; Render was used for
  both services here for consistency). Functionally identical to a Vercel
  deployment for this app.
- Both hosting services (Render) and the database (Aiven) are on free
  tiers, which auto-sleep/auto-pause after a period of inactivity. The
  first request after idling may take 30–60s.
