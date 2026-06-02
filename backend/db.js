const { Pool } = require("pg");

const pool = new Pool({
  user: "admin",
  host: process.env.DB_HOST || "10.207.64.123",
  database: "ziba",
  password: "admin",
  port: 5432
});

module.exports = pool;