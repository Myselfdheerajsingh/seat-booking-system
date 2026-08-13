from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field


# ---------- Events ----------

class EventCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    event_date: date
    rows: int = Field(..., gt=0, le=100)
    cols: int = Field(..., gt=0, le=100)


class EventOut(BaseModel):
    id: int
    name: str
    event_date: date
    rows: int
    cols: int

    class Config:
        from_attributes = True


# ---------- Seats ----------

class SeatOut(BaseModel):
    id: int
    row_num: int
    col_num: int
    label: str
    is_blocked: bool
    status: str  # "available" | "booked" | "blocked" (derived, not stored)

    class Config:
        from_attributes = True


class SeatMapOut(BaseModel):
    event: EventOut
    seats: List[SeatOut]


class SeatBlockRequest(BaseModel):
    seat_ids: List[int] = Field(..., min_length=1)
    is_blocked: bool = True


# ---------- Bookings ----------

class BookingCreate(BaseModel):
    event_id: int
    seat_ids: List[int] = Field(..., min_length=1, max_length=20)
    booker_name: str = Field(..., min_length=1, max_length=255)
    booker_email: EmailStr


class BookingOut(BaseModel):
    id: int
    seat_id: int
    seat_label: str
    booker_name: str
    booker_email: str
    group_id: str
    created_at: datetime

    class Config:
        from_attributes = True


class BookingGroupOut(BaseModel):
    group_id: str
    seats: List[str]
    booker_name: str
    booker_email: str
    created_at: datetime


# ---------- Admin dashboard ----------

class EventSummaryOut(BaseModel):
    event: EventOut
    total_seats: int
    blocked_seats: int
    booked_seats: int
    available_seats: int
    bookings: List[BookingGroupOut]
