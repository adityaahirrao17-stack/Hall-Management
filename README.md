# Hall Booking Portal

Node + Express + EJS + PostgreSQL. Roles: `student` (apply, view schedule, download letter) and `incharge` (approve/reject, add halls).

1. Install PostgreSQL. Default connection: `postgres://postgres:postgres@localhost:5432/hall_portal`
   (override with `DATABASE_URL`).
2. `npm install`
3. `npm run setup`  (creates DB, tables, incharge login, halls, mock facilities and contacts)
4. `npm start` then open http://localhost:3000

Incharge login: `incharge@kkwieer.edu` / `incharge123`. Students register themselves.

Hall names are seeded in `setup.js` (JVN Hall, Seminar Hall) - edit them or add halls from the incharge dashboard.
The allotment letter (`/booking/:id/letter`) follows the PDF format; use "Print / Save as PDF".
