"""
Fires two booking requests for the SAME seat at nearly the same time to
demonstrate that exactly one succeeds and the other is cleanly rejected
with 409 Conflict — not silently overwritten, not both accepted.

Usage:
    1. Start the API: uvicorn app.main:app --reload
    2. Create an event and note its id (or use the API docs at /docs)
    3. Edit EVENT_ID / SEAT_ID below to a seat that exists and isn't booked
    4. python test_concurrency.py
"""
import threading
import requests

API_URL = "http://localhost:8000"
EVENT_ID = 1
SEAT_ID = 1  # pick a seat id from GET /events/{EVENT_ID}/seats

results = []


def attempt_booking(name: str):
    resp = requests.post(
        f"{API_URL}/bookings",
        json={
            "event_id": EVENT_ID,
            "seat_ids": [SEAT_ID],
            "booker_name": name,
            "booker_email": f"{name.lower()}@example.com",
        },
    )
    results.append((name, resp.status_code, resp.json()))


if __name__ == "__main__":
    t1 = threading.Thread(target=attempt_booking, args=("Alice",))
    t2 = threading.Thread(target=attempt_booking, args=("Bob",))

    t1.start()
    t2.start()
    t1.join()
    t2.join()

    print("\n--- Results ---")
    for name, status, body in results:
        print(f"{name}: HTTP {status} -> {body}")

    successes = [r for r in results if r[1] == 201]
    failures = [r for r in results if r[1] == 409]
    print(f"\nSuccesses: {len(successes)} (expected 1)")
    print(f"Conflicts (409): {len(failures)} (expected 1)")
    assert len(successes) == 1 and len(failures) == 1, "Double-booking guard failed!"
    print("PASS: no double-booking.")
