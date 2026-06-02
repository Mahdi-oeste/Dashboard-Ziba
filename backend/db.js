const { Pool } = require("pg");

const pool = new Pool({
  user:     process.env.DB_USER     || "admin",
  host:     process.env.DB_HOST     || "10.207.64.123",
  database: process.env.DB_NAME     || "ziba",
  password: process.env.DB_PASSWORD || "admin",
  port:     parseInt(process.env.DB_PORT || "5432"),
});

module.exports = pool;