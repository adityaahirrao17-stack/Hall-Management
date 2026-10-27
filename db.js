const { Pool } = require('pg');

module.exports = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/hall_portal',
});
