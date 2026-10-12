const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Initialize Supabase Client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Use service role for backend logic validation
);

// Middleware to verify Supabase User Token
async function verifyAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid token' });
  
  req.user = user;
  next();
}

// 1. Get Monthly Attendance Logs for Logged-in User
app.get('/api/attendance', verifyAuth, async (req, res) => {
  const { year, month } = req.query; // e.g. year=2026, month=10
  const startDate = `${year}-${month.padStart(2, '0')}-01`;
  // Calculate end date of month
  const endDate = new Date(year, month, 0).toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('attendance_logs')
    .select('*')
    .eq('user_id', req.user.id)
    .gte('log_date', startDate)
    .lte('log_date', endDate);

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// 2. Submit / Lock a Day's Attendance
app.post('/api/attendance', verifyAuth, async (req, res) => {
  const { log_date, start_time, end_time } = req.body;

  // Calculate total hours between 8am and 5pm or custom range
  const start = new Date(`1970-01-01T${start_time}Z`);
  const end = new Date(`1970-01-01T${end_time}Z`);
  const total_hours = Math.max(0, (end - start) / (1000 * 60 * 60));

  // Upsert record and lock it (`is_locked: true`)
  const { data, error } = await supabase
    .from('attendance_logs')
    .upsert({
      user_id: req.user.id,
      log_date,
      start_time,
      end_time,
      total_hours,
      is_locked: true // Mark as done and lock slider
    }, { onConflict: 'user_id,log_date' })
    .select();

  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Attendance marked and locked successfully', data });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));