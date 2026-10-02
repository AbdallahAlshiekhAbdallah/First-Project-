require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const port = Number(process.env.PORT) || 3000;
const categories = ['Food', 'Transport', 'Bills', 'Entertainment', 'Other'];

// Every response uses a numeric amount and a date formatted as YYYY-MM-DD.
// PostgreSQL otherwise returns NUMERIC as text and DATE as a Date object.
const expenseColumns = "id, title, amount::float8 AS amount, category, to_char(date, 'YYYY-MM-DD') AS date";

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

app.use(cors());
app.use(express.json());

// Check an ID from the URL. Return its number, or null if it is invalid.
function parseExpenseId(value) {
  const id = Number(value);
  if (!/^[1-9]\d*$/.test(value) || id > 2147483647) {
    return null;
  }
  return id;
}

// Return true only when the value is a real date written as YYYY-MM-DD.
function isRealDate(value) {
  if (typeof value !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  if (value.startsWith('0000')) return false;

  // The pattern above also matches impossible dates such as 2026-02-30.
  // Convert the date back to text to make sure it is a real calendar date.
  const date = new Date(value + 'T00:00:00Z');
  if (Number.isNaN(date.getTime())) return false;
  return date.toISOString().slice(0, 10) === value;
}

// Check expense fields. Return an error message, or null when they are valid.
function getExpenseValidationError(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'Send an expense as a JSON object.';
  }

  if (typeof body.title !== 'string' || !body.title.trim()) {
    return 'Title is required.';
  }
  if (body.title.trim().length > 100) {
    return 'Title must be 100 characters or fewer.';
  }
  if (typeof body.amount !== 'number' || !Number.isFinite(body.amount) || body.amount <= 0) {
    return 'Amount must be a number greater than 0.';
  }
  // The database allows up to 8 digits before and 2 digits after the decimal.
  const amountText = String(body.amount);
  if (body.amount > 99999999.99 || !/^\d+(\.\d{1,2})?$/.test(amountText)) {
    return 'Amount must fit within 8 digits and have at most 2 decimal places.';
  }
  if (!categories.includes(body.category)) {
    return 'Category must be one of: ' + categories.join(', ') + '.';
  }
  if (!isRealDate(body.date)) {
    return 'Date must be a valid date in YYYY-MM-DD format.';
  }

  return null;
}

// Log a database problem and send a 500 response to the client.
function sendDatabaseError(res, error) {
  console.error('Expense database error:', error);
  return res.status(500).json({ message: 'Could not access expenses.' });
}

// GET all expenses and send them as a list.
app.get('/api/expenses', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ${expenseColumns} FROM expenses ORDER BY id`
    );
    return res.status(200).json(result.rows);
  } catch (error) {
    return sendDatabaseError(res, error);
  }
});

// GET one expense by ID, or send 404 when it does not exist.
app.get('/api/expenses/:id', async (req, res) => {
  const id = parseExpenseId(req.params.id);
  if (id === null) return res.status(404).json({ message: 'Expense not found.' });

  try {
    const result = await pool.query(
      `SELECT ${expenseColumns} FROM expenses WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Expense not found.' });
    return res.status(200).json(result.rows[0]);
  } catch (error) {
    return sendDatabaseError(res, error);
  }
});

// Check and save a new expense, then return it with status 201.
app.post('/api/expenses', async (req, res) => {
  const errorMessage = getExpenseValidationError(req.body);
  if (errorMessage) return res.status(400).json({ message: errorMessage });

  const { title, amount, category, date } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO expenses (title, amount, category, date) VALUES ($1, $2, $3, $4) RETURNING ${expenseColumns}`,
      [title.trim(), amount, category, date]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    return sendDatabaseError(res, error);
  }
});

// Check and update an existing expense, then return the updated expense.
app.put('/api/expenses/:id', async (req, res) => {
  const id = parseExpenseId(req.params.id);
  if (id === null) return res.status(404).json({ message: 'Expense not found.' });

  const errorMessage = getExpenseValidationError(req.body);
  if (errorMessage) return res.status(400).json({ message: errorMessage });

  const { title, amount, category, date } = req.body;
  try {
    const result = await pool.query(
      `UPDATE expenses SET title = $1, amount = $2, category = $3, date = $4 WHERE id = $5 RETURNING ${expenseColumns}`,
      [title.trim(), amount, category, date, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Expense not found.' });
    return res.status(200).json(result.rows[0]);
  } catch (error) {
    return sendDatabaseError(res, error);
  }
});

// Delete an expense by ID, or send 404 when it does not exist.
app.delete('/api/expenses/:id', async (req, res) => {
  const id = parseExpenseId(req.params.id);
  if (id === null) return res.status(404).json({ message: 'Expense not found.' });

  try {
    const result = await pool.query('DELETE FROM expenses WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Expense not found.' });
    return res.status(200).json({ message: 'Expense deleted.' });
  } catch (error) {
    return sendDatabaseError(res, error);
  }
});

// Handle invalid JSON and other unexpected request errors.
app.use((error, req, res, next) => {
  // Express sends invalid JSON here before it reaches POST or PUT.
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Request body must be valid JSON.' });
  }

  console.error('Unexpected server error:', error);
  return res.status(500).json({ message: 'Unexpected server error.' });
});

// Start the server and print its URL when it is ready.
app.listen(port, () => {
  console.info('Expense Tracker API listening at http://localhost:' + port);
});
