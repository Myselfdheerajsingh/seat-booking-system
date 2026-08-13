from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import models, schemas


def create_event(db: Session, event: schemas.EventCreate) -> models.Event:
    db_event = models.Event(
        name=event.name,
        event_date=event.event_date,
        rows=event.rows,
        cols=event.cols,
    )
    db.add(db_event)
    db.flush()  # get db_event.id before creating seats

    seats = []
    for r in range(1, event.rows + 1):
        row_letter = _row_label(r)
        for c in range(1, event.cols + 1):
            seats.append(
                models.Seat(
                    event_id=db_event.id,
                    row_num=r,
                    col_num=c,
                    label=f"{row_letter}{c}",
                    is_blocked=False,
                )
            )
    db.add_all(seats)
    db.commit()
    db.refresh(db_event)
    return db_event


def _row_label(row_num: int) -> str:
    """1 -> A, 2 -> B ... 27 -> AA, matching spreadsheet-style row naming."""
    label = ""
    n = row_num
    while n > 0:
        n, rem = divmod(n - 1, 26)
        label = chr(65 + rem) + label
    return label


def get_event(db: Session, event_id: int) -> models.Event | None:
    return db.get(models.Event, event_id)


def get_seat_map(db: Session, event_id: int) -> list[dict]:
    """Seat status is derived on read, never stored, so it can never drift
    out of sync with the bookings table."""
    seats = db.scalars(select(models.Seat).where(models.Seat.event_id == event_id)).all()
    booked_seat_ids = set(
        db.scalars(
            select(models.Booking.seat_id).where(models.Booking.event_id == event_id)
        ).all()
    )
    result = []
    for seat in seats:
        if seat.is_blocked:
            status = "blocked"
        elif seat.id in booked_seat_ids:
            status = "booked"
        else:
            status = "available"
        result.append(
            {
                "id": seat.id,
                "row_num": seat.row_num,
                "col_num": seat.col_num,
                "label": seat.label,
                "is_blocked": seat.is_blocked,
                "status": status,
            }
        )
    return result


def set_seats_blocked(db: Session, event_id: int, seat_ids: list[int], is_blocked: bool) -> None:
    db.query(models.Seat).filter(
        models.Seat.event_id == event_id, models.Seat.id.in_(seat_ids)
    ).update({"is_blocked": is_blocked}, synchronize_session=False)
    db.commit()


class SeatUnavailableError(Exception):
    """Raised when one or more requested seats can't be booked. Carries the
    offending seat labels so the API can return a clear error message."""

    def __init__(self, labels: list[str]):
        self.labels = labels
        super().__init__(f"Seats unavailable: {', '.join(labels)}")


def create_booking(db: Session, booking: schemas.BookingCreate) -> list[models.Booking]:
    """
    Concurrency-safe, all-or-nothing seat booking.

    Two layers of protection:
      1. Row-level locking: SELECT ... FOR UPDATE on the seat rows serializes
         concurrent booking attempts for the same seats — the second
         transaction blocks until the first commits or rolls back.
      2. Unique constraint (event_id, seat_id) on `bookings`: a hard backstop
         at the schema level. Even if the locking logic above had a bug or
         ran under a different isolation level, a duplicate INSERT is
         rejected by MySQL itself, not by application code.

    Seats are locked in a fixed order (ascending id) to avoid deadlocks
    between two transactions that request overlapping seats in different
    orders.
    """
    seat_ids_sorted = sorted(set(booking.seat_ids))

    try:
        # Lock the seat rows themselves first (also validates they exist
        # and belong to this event).
        locked_seats = db.scalars(
            select(models.Seat)
            .where(
                models.Seat.id.in_(seat_ids_sorted),
                models.Seat.event_id == booking.event_id,
            )
            .order_by(models.Seat.id)
            .with_for_update()
        ).all()

        found_ids = {s.id for s in locked_seats}
        missing = set(seat_ids_sorted) - found_ids
        if missing:
            db.rollback()
            raise SeatUnavailableError([f"seat id {mid}" for mid in missing])

        blocked = [s.label for s in locked_seats if s.is_blocked]
        if blocked:
            db.rollback()
            raise SeatUnavailableError(blocked)

        # Locking read: under InnoDB, SELECT ... FOR UPDATE always reads the
        # latest committed data regardless of isolation level, so this
        # correctly sees bookings committed by a transaction that just
        # released its lock on these same seats.
        already_booked = db.scalars(
            select(models.Booking)
            .where(
                models.Booking.event_id == booking.event_id,
                models.Booking.seat_id.in_(seat_ids_sorted),
            )
            .with_for_update()
        ).all()
        if already_booked:
            db.rollback()
            labels = {s.label for s in locked_seats if s.id in {b.seat_id for b in already_booked}}
            raise SeatUnavailableError(sorted(labels))

        new_bookings = [
            models.Booking(
                event_id=booking.event_id,
                seat_id=seat.id,
                booker_name=booking.booker_name,
                booker_email=booking.booker_email,
            )
            for seat in locked_seats
        ]
        db.add_all(new_bookings)
        db.commit()
        for b in new_bookings:
            db.refresh(b)
        return new_bookings

    except IntegrityError:
        # Backstop: the unique constraint fired, meaning a concurrent
        # transaction won the race between our locking read and our insert.
        db.rollback()
        raise SeatUnavailableError(["one or more selected seats"])


def get_event_summary(db: Session, event_id: int) -> dict:
    seats = db.scalars(select(models.Seat).where(models.Seat.event_id == event_id)).all()
    bookings = db.scalars(
        select(models.Booking).where(models.Booking.event_id == event_id)
    ).all()

    total_seats = len(seats)
    blocked_seats = sum(1 for s in seats if s.is_blocked)
    booked_seats = len(bookings)
    available_seats = total_seats - blocked_seats - booked_seats

    seat_labels = {s.id: s.label for s in seats}
    grouped: dict[str, dict] = {}
    for b in bookings:
        g = grouped.setdefault(
            b.group_id,
            {
                "group_id": b.group_id,
                "seats": [],
                "booker_name": b.booker_name,
                "booker_email": b.booker_email,
                "created_at": b.created_at,
            },
        )
        g["seats"].append(seat_labels.get(b.seat_id, f"#{b.seat_id}"))

    return {
        "total_seats": total_seats,
        "blocked_seats": blocked_seats,
        "booked_seats": booked_seats,
        "available_seats": available_seats,
        "bookings": list(grouped.values()),
    }
