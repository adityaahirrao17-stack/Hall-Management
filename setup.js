// Creates the database (if missing), tables, the hall incharge login, halls, and mock facilities/contacts.
const fs = require('fs');
const { Client } = require('pg');
const bcrypt = require('bcryptjs');

const url = new URL(process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/hall_portal');
const dbName = url.pathname.slice(1);

// Mock data (capacity, facilities, contacts). Replace with real data.
const halls = {
  'JVN Hall':        { cap: 300, extra: [['Wireless Mic', 4], ['Projector', 2], ['Stage Lights', 6], ['Air Conditioning', 1], ['Sound System', 1]] },
  'PC Ray Hall':     { cap: 150, extra: [['Wireless Mic', 2], ['Projector', 1], ['Air Conditioning', 1], ['Sound System', 1]] },
  'MBA Hall':        { cap: 100, extra: [['Wireless Mic', 2], ['Projector', 1], ['Whiteboard', 1]] },
  'MCA Hall':        { cap: 80,  extra: [['Wireless Mic', 1], ['Projector', 1], ['Whiteboard', 1]] },
  'AV Hall':         { cap: 120, extra: [['Wireless Mic', 3], ['Projector', 1], ['Sound System', 1], ['Air Conditioning', 1]] },
  'Idea Lab':        { cap: 40,  extra: [['Projector', 1], ['Whiteboard', 2], ['Wi-Fi Router', 1]] },
  'IT Seminar Hall': { cap: 100, extra: [['Wireless Mic', 2], ['Projector', 1], ['Podium Lamp', 1], ['Air Conditioning', 1]] },
  'T & P DD Room':   { cap: 60,  extra: [['Projector', 1], ['Whiteboard', 1], ['Air Conditioning', 1]] },
};
const staff = [
  ['Hall Cleaner', ['Ramesh Pawar', 'Sunita Shinde', 'Dattu Gaikwad', 'Meena Salunke']],
  ['Sound System Operator', ['Sanjay Kale', 'Rahul Gaikwad', 'Nitin Bhosale', 'Prakash Thorat']],
  ['Projector Operator', ['Amit Jadhav', 'Kiran Deore', 'Suresh Nikam', 'Vishal Patil']],
];

(async () => {
  const adminUrl = new URL(url.href);
  adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.href });
  await admin.connect();
  const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (!exists.rowCount) await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  const db = new Client({ connectionString: url.href });
  await db.connect();
  await db.query(fs.readFileSync(__dirname + '/schema.sql', 'utf8'));

  const hash = await bcrypt.hash('incharge123', 10);
  await db.query(
    `INSERT INTO users (name, email, password, role, department)
     VALUES ('Hall Incharge', 'incharge@kkwieer.edu', $1, 'incharge', 'Administration')
     ON CONFLICT (email) DO NOTHING`, [hash]);

  let n = 0;
  for (const [name, h] of Object.entries(halls)) {
    n++;
    const { rows } = await db.query(
      `INSERT INTO halls (name, capacity) VALUES ($1, $2)
       ON CONFLICT (name) DO UPDATE SET capacity = EXCLUDED.capacity RETURNING id`, [name, h.cap]);
    const id = rows[0].id;
    for (const [f, q] of [...h.extra, ['Chairs', h.cap]])
      await db.query('INSERT INTO hall_facilities (hall_id, name, quantity) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [id, f, q]);
    for (const [i, [role, names]] of staff.entries())
      await db.query('INSERT INTO hall_contacts (hall_id, role, name, phone) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
        [id, role, names[n % names.length], `98230 ${10 + n}0${i + 1}${i + 2}`]);
  }
  await db.end();
  console.log('Setup done. Incharge login: incharge@kkwieer.edu / incharge123');
})().catch(e => { console.error(e.message); process.exit(1); });
