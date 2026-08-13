import uuid
from datetime import datetime

from sqlalchemy import (
    Column,
    Integer,
    String,
    Date,
    DateTime,
    Boolean,
    ForeignKey,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from .database import Base


class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    event_date = Column(Date, nullable=False)
    # Layout is modeled as rows x columns. Every seat is a real row in the
    # `seats` table (not just implied by numbers) so individual seats can be
    # blocked, labeled, or priced independently. See README for rationale.
    rows = Column(Integer, nullable=False)
    cols = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    seats = relationship("Seat", back_populates="event", cascade="all, delete-orphan")


class Seat(Base):
    __tablename__ = "seats"
    __table_args__ = (
        UniqueConstraint("event_id", "row_num", "col_num", name="uq_event_seat_position"),
    )

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    row_num = Column(Integer, nullable=False)
    col_num = Column(Integer, nullable=False)
    label = Column(String(20), nullable=False)  # e.g. "A1"
    is_blocked = Column(Boolean, default=False, nullable=False)  # admin block, independent of bookings

    event = relationship("Event", back_populates="seats")
    booking = relationship("Booking", back_populates="seat", uselist=False, cascade="all, delete-orphan")


class Booking(Base):
    __tablename__ = "bookings"
    __table_args__ = (
        # DB-level guarantee: a seat can only ever appear once across all
        # bookings for its event. This is the backstop that makes
        # double-booking impossible even if the locking logic above it
        # had a bug — the INSERT itself will fail.
        UniqueConstraint("event_id", "seat_id", name="uq_event_seat_booking"),
    )

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    seat_id = Column(Integer, ForeignKey("seats.id", ondelete="CASCADE"), nullable=False)
    booker_name = Column(String(255), nullable=False)
    booker_email = Column(String(255), nullable=False)
    # Ties multiple seat rows together when one user books several seats
    # in a single request, so the group succeeds or fails as a unit and
    # can be displayed/cancelled together.
    group_id = Column(String(36), default=lambda: str(uuid.uuid4()), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    seat = relationship("Seat", back_populates="booking")
