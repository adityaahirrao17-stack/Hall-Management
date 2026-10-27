CREATE TABLE IF NOT EXISTS users (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  password    TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('student', 'incharge')),
  department  TEXT
);

CREATE TABLE IF NOT EXISTS halls (
  id        SERIAL PRIMARY KEY,
  name      TEXT NOT NULL UNIQUE,
  capacity  INT
);

CREATE TABLE IF NOT EXISTS hall_facilities (
  id        SERIAL PRIMARY KEY,
  hall_id   INT NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  quantity  INT NOT NULL DEFAULT 1,
  UNIQUE (hall_id, name)
);

CREATE TABLE IF NOT EXISTS hall_contacts (
  id       SERIAL PRIMARY KEY,
  hall_id  INT NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
  role     TEXT NOT NULL,
  name     TEXT NOT NULL,
  phone    TEXT NOT NULL,
  UNIQUE (hall_id, role)
);

CREATE TABLE IF NOT EXISTS bookings (
  id               SERIAL PRIMARY KEY,
  hall_id          INT NOT NULL REFERENCES halls(id),
  student_id       INT NOT NULL REFERENCES users(id),
  activity         TEXT NOT NULL,
  description      TEXT,
  faculty_incharge TEXT NOT NULL,
  event_date       DATE NOT NULL,
  start_time       TIME NOT NULL,
  end_time         TIME NOT NULL CHECK (end_time > start_time),
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  remarks          TEXT,
  decided_by       INT REFERENCES users(id),
  decided_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
