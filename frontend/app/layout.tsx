import "./globals.css";
import Link from "next/link";

export const metadata = {
  title: "Seat Booking",
  description: "Event seat booking system",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link href="/" className="brand">
            SeatBooking
          </Link>
          <nav>
            <Link href="/">Events</Link>
            <Link href="/admin">Admin</Link>
          </nav>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
