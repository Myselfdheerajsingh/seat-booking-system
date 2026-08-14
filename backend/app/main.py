import os

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from . import crud, models, schemas
from .database import engine, get_db


models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="NeuBitAt Seat Booking API")

origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


# ---------- Admin: events & seat setup ----------

@app.post("/events", response_model=schemas.EventOut, status_code=201)
def create_event(event: schemas.EventCreate, db: Session = Depends(get_db)):
    return crud.create_event(db, event)


@app.get("/events", response_model=list[schemas.EventOut])
def list_events(db: Session = Depends(get_db)):
    return db.query(models.Event).order_by(models.Event.event_date).all()


@app.get("/events/{event_id}/seats", response_model=schemas.SeatMapOut)
def get_seat_map(event_id: int, db: Session = Depends(get_db)):
    event = crud.get_event(db, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    seats = crud.get_seat_map(db, event_id)
    return {"event": event, "seats": seats}


@app.post("/events/{event_id}/seats/block", status_code=200)
def block_seats(event_id: int, req: schemas.SeatBlockRequest, db: Session = Depends(get_db)):
    event = crud.get_event(db, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    crud.set_seats_blocked(db, event_id, req.seat_ids, req.is_blocked)
    return {"updated": req.seat_ids, "is_blocked": req.is_blocked}


@app.get("/events/{event_id}/summary", response_model=schemas.EventSummaryOut)
def event_summary(event_id: int, db: Session = Depends(get_db)):
    event = crud.get_event(db, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    summary = crud.get_event_summary(db, event_id)
    return {"event": event, **summary}


# ---------- User: booking ----------

@app.post("/bookings", response_model=list[schemas.BookingOut], status_code=201)
def create_booking(booking: schemas.BookingCreate, db: Session = Depends(get_db)):
    event = crud.get_event(db, booking.event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    try:
        new_bookings = crud.create_booking(db, booking)
    except crud.SeatUnavailableError as e:
        raise HTTPException(
            status_code=409,
            detail=f"The following seats are no longer available: {', '.join(e.labels)}",
        )

    seat_labels = {
        s.id: s.label
        for s in db.query(models.Seat).filter(models.Seat.id.in_([b.seat_id for b in new_bookings]))
    }
    return [
        {
            "id": b.id,
            "seat_id": b.seat_id,
            "seat_label": seat_labels[b.seat_id],
            "booker_name": b.booker_name,
            "booker_email": b.booker_email,
            "group_id": b.group_id,
            "created_at": b.created_at,
        }
        for b in new_bookings
    ]
