const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const db = require('./db');

const app = express();
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: false }));
app.use(express.static(__dirname + '/public'));
app.use(session({ secret: process.env.SESSION_SECRET || 'dev-secret-change-me', resave: false, saveUninitialized: false }));
app.use((req, res, next) => { res.locals.user = req.session.user; res.locals.error = null; next(); });

const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);
const login = (req, res, next) => (req.session.user ? next() : res.redirect('/login'));
const only = role => (req, res, next) => (req.session.user?.role === role ? next() : res.status(403).send('Forbidden'));
const allHalls = async () => (await db.query('SELECT * FROM halls ORDER BY name')).rows;

app.get('/', wrap(async (req, res) => res.render('home', { halls: await allHalls() })));

// ---------- auth ----------
app.get('/login', (req, res) => res.render('login'));
app.post('/login', wrap(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [req.body.email.trim().toLowerCase()]);
  const u = rows[0];
  if (!u || !(await bcrypt.compare(req.body.password, u.password)))
    return res.render('login', { error: 'Invalid email or password' });
  req.session.user = { id: u.id, name: u.name, role: u.role, department: u.department };
  res.redirect('/dashboard');
}));
app.get('/register', (req, res) => res.render('register'));
app.post('/register', wrap(async (req, res) => {
  const { name, email, department, password } = req.body;
  try {
    await db.query(`INSERT INTO users (name, email, password, role, department) VALUES ($1,$2,$3,'student',$4)`,
      [name.trim(), email.trim().toLowerCase(), await bcrypt.hash(password, 10), department.trim()]);
  } catch (e) {
    if (e.code === '23505') return res.render('register', { error: 'Email already registered' });
    throw e;
  }
  res.redirect('/login');
}));
app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/login')));

// ---------- dashboard ----------
app.get('/dashboard', login, wrap(async (req, res) => {
  const u = req.session.user;
  const base = `SELECT b.*, h.name AS hall, s.name AS student, s.department
                FROM bookings b JOIN halls h ON h.id = b.hall_id JOIN users s ON s.id = b.student_id`;
  if (u.role === 'student') {
    const bookings = (await db.query(`${base} WHERE b.student_id = $1 ORDER BY b.created_at DESC`, [u.id])).rows;
    return res.render('student', { bookings });
  }
  const bookings = (await db.query(`${base} ORDER BY (b.status = 'pending') DESC, b.event_date`)).rows;
  res.render('incharge', { bookings, halls: await allHalls() });
}));

// ---------- student: apply ----------
app.get('/book', login, only('student'), wrap(async (req, res) => {
  res.render('book', { halls: await allHalls() });
}));
app.post('/book', login, only('student'), wrap(async (req, res) => {
  const b = req.body;
  const halls = await allHalls();
  if (b.end_time <= b.start_time) return res.render('book', { halls, error: 'End time must be after start time' });
  if (b.event_date < new Date().toISOString().slice(0, 10)) return res.render('book', { halls, error: 'Date cannot be in the past' });
  await db.query(
    `INSERT INTO bookings (hall_id, student_id, activity, description, faculty_incharge, event_date, start_time, end_time)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [b.hall_id, req.session.user.id, b.activity.trim(), b.description.trim(), b.faculty_incharge.trim(), b.event_date, b.start_time, b.end_time]);
  res.redirect('/dashboard');
}));

// ---------- incharge: verify ----------
app.post('/booking/:id/decide', login, only('incharge'), wrap(async (req, res) => {
  const approve = req.body.action === 'approve';
  const { rows } = await db.query('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
  const b = rows[0];
  if (!b) return res.sendStatus(404);
  if (approve) {
    const clash = await db.query(
      `SELECT 1 FROM bookings WHERE status = 'approved' AND hall_id = $1 AND event_date = $2
         AND start_time < $4 AND end_time > $3 AND id <> $5`,
      [b.hall_id, b.event_date, b.start_time, b.end_time, b.id]);
    if (clash.rowCount) return res.status(409).send('Clashes with an already approved booking for this hall and time. <a href="/dashboard">Back</a>');
  }
  await db.query(`UPDATE bookings SET status = $1, remarks = $2, decided_by = $3, decided_at = now() WHERE id = $4`,
    [approve ? 'approved' : 'rejected', req.body.remarks || null, req.session.user.id, b.id]);
  res.redirect('/dashboard');
}));

app.post('/halls', login, only('incharge'), wrap(async (req, res) => {
  await db.query('INSERT INTO halls (name, capacity) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING',
    [req.body.name.trim(), req.body.capacity || null]);
  res.redirect('/dashboard');
}));

// ---------- weekly schedule + facilities + contacts ----------
const HOURS = Array.from({ length: 10 }, (_, i) => 8 + i); // 8:00 - 18:00
const iso = d => d.toISOString().slice(0, 10);
const mins = s => +s.slice(0, 2) * 60 + +s.slice(3, 5);

app.get('/schedule', login, wrap(async (req, res) => {
  const halls = await allHalls();
  const hall = halls.find(h => String(h.id) === req.query.hall) || halls[0];
  if (!hall) return res.render('schedule', { halls, hall: null });

  let monday = new Date((req.query.week || iso(new Date())) + 'T00:00:00Z');
  if (isNaN(monday)) monday = new Date();
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setUTCDate(d.getUTCDate() + i); return d; });

  const { rows } = await db.query(
    `SELECT activity, status, to_char(event_date,'YYYY-MM-DD') AS d, start_time::text AS s, end_time::text AS e
     FROM bookings WHERE hall_id = $1 AND status <> 'rejected' AND event_date BETWEEN $2 AND $3`,
    [hall.id, iso(days[0]), iso(days[6])]);

  // grid[hour][dayIndex] = booking covering that hour (approved wins over pending), or null when free
  const cover = (d, h) => rows
    .filter(b => b.d === iso(d) && mins(b.s) < (h + 1) * 60 && mins(b.e) > h * 60)
    .sort((a, b) => (a.status === 'approved' ? 0 : 1) - (b.status === 'approved' ? 0 : 1))[0] || null;
  const grid = HOURS.map(h => days.map(d => cover(d, h)));
  const shift = n => { const d = new Date(monday); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
  const facilities = (await db.query('SELECT * FROM hall_facilities WHERE hall_id = $1 ORDER BY name', [hall.id])).rows;
  const contacts = (await db.query('SELECT * FROM hall_contacts WHERE hall_id = $1 ORDER BY id', [hall.id])).rows;
  res.render('schedule', { halls, hall, days: days.map(iso), HOURS, grid, prev: shift(-7), next: shift(7), facilities, contacts });
}));

// ---------- allotment letter (approved only; owner student or incharge) ----------
app.get('/booking/:id/letter', login, wrap(async (req, res) => {
  const { rows } = await db.query(
    `SELECT b.*, h.name AS hall, s.name AS student, s.department, d.name AS authority
     FROM bookings b JOIN halls h ON h.id = b.hall_id JOIN users s ON s.id = b.student_id
     LEFT JOIN users d ON d.id = b.decided_by WHERE b.id = $1`, [req.params.id]);
  const b = rows[0];
  const u = req.session.user;
  if (!b || b.status !== 'approved' || (u.role === 'student' && b.student_id !== u.id)) return res.sendStatus(404);
  const contacts = (await db.query('SELECT * FROM hall_contacts WHERE hall_id = $1 ORDER BY id', [b.hall_id])).rows;
  const facilities = (await db.query('SELECT * FROM hall_facilities WHERE hall_id = $1 ORDER BY name', [b.hall_id])).rows;
  res.render('letter', { b, contacts, facilities });
}));

app.use((err, req, res, next) => { console.error(err); res.status(500).send('Something went wrong.'); });
app.listen(process.env.PORT || 3000, () => console.log('Hall portal on http://localhost:3000'));
