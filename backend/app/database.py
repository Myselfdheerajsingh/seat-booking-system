import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

load_dotenv()

# Example: mysql+pymysql://user:password@host:3306/seat_booking
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "mysql+pymysql://root:password@localhost:3306/seat_booking",
)

# pool_pre_ping avoids stale-connection errors on cloud MySQL providers
# (Render/Railway/PlanetScale-style hosts recycle idle connections).
engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_recycle=280)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
