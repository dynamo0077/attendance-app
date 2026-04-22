require('dotenv').config();
const express    = require('express');
const path       = require('path');
const jwt        = require('jsonwebtoken');
const bcrypt     = require('bcryptjs');
const ExcelJS    = require('exceljs');
const { createClient } = require('@supabase/supabase-js');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Supabase client (service_role bypasses RLS — admin only) ────────────────
const supabase = createClient(
    process.env.SUPABASE_URL      || 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_KEY || 'placeholder-key'
);

// ─── Global State ─────────────────────────────────────────────────────────────
let lastSync = { success: true, time: null, error: null };

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Do not serve static files immediately for `/`, we want to handle `/` explicitly
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// ─── Auth Middleware ──────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
    const auth = req.headers['authorization'] || '';
    // Also accept token via query string (needed for browser-triggered downloads)
    const token = (auth.startsWith('Bearer ') ? auth.slice(7) : null) || req.query.token || null;
    if (!token) return res.status(401).json({ success: false, error: 'No token provided.' });
    try {
        req.admin = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-change-me');
        next();
    } catch {
        res.status(401).json({ success: false, error: 'Invalid or expired token.' });
    }
}

// ─── UTILITY: Sync to Master Excel ────────────────────────────────────────────
async function syncToMasterExcel() {
    try {
        const { data, error } = await supabase
            .from('attendance')
            .select('*')
            .order('name', { ascending: true });

        if (error) throw error;

        const wb = new ExcelJS.Workbook();
        wb.creator = 'Attendance Web App';
        const ws = wb.addWorksheet('Master Attendance', { views: [{ state: 'frozen', ySplit: 1 }] });

        ws.columns = [
            { header: 'ID',         key: 'id',         width: 8  },
            { header: 'Name',       key: 'name',       width: 25 },
            { header: 'Email',      key: 'email',      width: 32 },
            { header: 'Department', key: 'department', width: 20 },
            { header: 'Role',       key: 'role',       width: 20 },
            { header: 'Phone',      key: 'phone',      width: 18 },
            { header: 'Notes',      key: 'notes',      width: 40 },
            { header: 'Created At', key: 'created_at', width: 24 },
            { header: 'Updated At', key: 'updated_at', width: 24 },
        ];

        // Style header
        ws.getRow(1).eachCell(cell => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } }; // Blue header
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });

        data.forEach(row => ws.addRow(row));

        const filePath = path.join(__dirname, 'master_attendance.xlsx');
        await wb.xlsx.writeFile(filePath);
        lastSync = { success: true, time: new Date().toISOString(), error: null };
        console.log(`✅ Master Excel synced: ${filePath}`);
    } catch (err) {
        lastSync = { 
            success: false, 
            time: new Date().toISOString(), 
            error: err.code === 'EBUSY' ? 'File is locked (close Excel!)' : err.message 
        };
        console.error('❌ Sync failed:', err.message);
    }
}

// ─── PUBLIC: Submit attendance ────────────────────────────────────────────────
// POST /api/submit
// Anyone with the link can submit. They receive only their own confirmation.
app.post('/api/submit', async (req, res) => {
    const { name, email, department, role, phone, notes } = req.body;
    if (!name || !email) {
        return res.status(400).json({ success: false, error: 'Name and Email are required.' });
    }
    const { data, error } = await supabase
        .from('attendance')
        .insert([{ name, email, department: department || '', role: role || '', phone: phone || '', notes: notes || '' }])
        .select('id, name, email')
        .single();

    if (error) {
        console.error('Supabase insert error:', error.message);
        return res.status(500).json({ success: false, error: 'Could not save your submission. Please try again.' });
    }
    await syncToMasterExcel(); // Sync Excel after new submission
    res.status(201).json({ success: true, message: `Thank you, ${name}! Your profile has been recorded.`, id: data.id });
});

// ─── PUBLIC: Get all employees ────────────────────────────────────────────────
app.get('/api/employees', async (req, res) => {
    const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .order('name', { ascending: true });

    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, data });
});

// ─── PUBLIC: Get daily attendance ─────────────────────────────────────────────
// GET /api/daily?month=2026-04
app.get('/api/daily', async (req, res) => {
    const { month } = req.query; // e.g., '2026-04'
    if (!month) return res.status(400).json({ success: false, error: 'Month parameter is required' });

    const startDate = `${month}-01`;
    // Approximate end of month
    const endDate = `${month}-31`; 

    const { data, error } = await supabase
        .from('daily_attendance')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate);

    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, data });
});

// ─── PUBLIC: Upsert daily attendance (Toggle) ─────────────────────────────────
app.post('/api/daily/toggle', async (req, res) => {
    const { employee_id, date, present } = req.body;
    if (!employee_id || !date) return res.status(400).json({ success: false, error: 'Employee ID and Date required.' });

    // First check if it exists
    const { data: existing } = await supabase
        .from('daily_attendance')
        .select('id')
        .eq('employee_id', employee_id)
        .eq('date', date)
        .single();

    let error;
    if (existing) {
        ({ error } = await supabase
            .from('daily_attendance')
            .update({ present })
            .eq('id', existing.id));
    } else {
        ({ error } = await supabase
            .from('daily_attendance')
            .insert([{ employee_id, date, present }]));
    }

    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, message: 'Updated successfully' });
});

// ─── PUBLIC: Update remark ────────────────────────────────────────────────────
app.put('/api/daily/remark', async (req, res) => {
    const { employee_id, date, remark } = req.body;
    if (!employee_id || !date) return res.status(400).json({ success: false, error: 'Employee ID and Date required.' });

    // First check if it exists
    const { data: existing } = await supabase
        .from('daily_attendance')
        .select('id')
        .eq('employee_id', employee_id)
        .eq('date', date)
        .single();

    let error;
    if (existing) {
        ({ error } = await supabase
            .from('daily_attendance')
            .update({ remark })
            .eq('id', existing.id));
    } else {
        ({ error } = await supabase
            .from('daily_attendance')
            .insert([{ employee_id, date, remark, present: false }])); // defaults to false if only remark added
    }

    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, message: 'Remark updated' });
});

// ─── ADMIN: Login ─────────────────────────────────────────────────────────────
// POST /api/admin/login
app.post('/api/admin/login', async (req, res) => {
    const { password } = req.body;
    if (!password) return res.status(400).json({ success: false, error: 'Password required.' });

    const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
    // Support both plain-text env var and bcrypt hash
    const valid = adminPass.startsWith('$2')
        ? await bcrypt.compare(password, adminPass)
        : password === adminPass;

    if (!valid) {
        return res.status(401).json({ success: false, error: 'Incorrect password.' });
    }
    const token = jwt.sign(
        { role: 'admin', ts: Date.now() },
        process.env.JWT_SECRET || 'dev-secret-change-me',
        { expiresIn: '8h' }
    );
    res.json({ success: true, token, expiresIn: '8h' });
});

// ─── ADMIN: Read all entries ──────────────────────────────────────────────────
// GET /api/admin/entries
app.get('/api/admin/entries', requireAdmin, async (req, res) => {
    const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, data });
});

// ─── ADMIN: Read one entry ────────────────────────────────────────────────────
// GET /api/admin/entries/:id
app.get('/api/admin/entries/:id', requireAdmin, async (req, res) => {
    const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .eq('id', req.params.id)
        .single();

    if (error || !data) return res.status(404).json({ success: false, error: 'Entry not found.' });
    res.json({ success: true, data });
});

// ─── ADMIN: Update entry ──────────────────────────────────────────────────────
// PUT /api/admin/entries/:id
app.put('/api/admin/entries/:id', requireAdmin, async (req, res) => {
    const { name, email, department, role, phone, notes } = req.body;
    if (!name || !email) return res.status(400).json({ success: false, error: 'Name and Email are required.' });

    const { error } = await supabase
        .from('attendance')
        .update({ name, email, department: department || '', role: role || '', phone: phone || '', notes: notes || '', updated_at: new Date().toISOString() })
        .eq('id', req.params.id);

    if (error) return res.status(500).json({ success: false, error: error.message });
    await syncToMasterExcel(); // Sync Excel after update
    res.json({ success: true, message: `Entry #${req.params.id} updated.` });
});

// ─── ADMIN: Delete entry ──────────────────────────────────────────────────────
// DELETE /api/admin/entries/:id
app.delete('/api/admin/entries/:id', requireAdmin, async (req, res) => {
    const { error } = await supabase
        .from('attendance')
        .delete()
        .eq('id', req.params.id);

    if (error) return res.status(500).json({ success: false, error: error.message });
    await syncToMasterExcel(); // Sync Excel after deletion
    res.json({ success: true, message: `Entry #${req.params.id} deleted.` });
});

// ─── ADMIN: Export as Excel ───────────────────────────────────────────────────
// GET /api/admin/export
app.get('/api/admin/export', requireAdmin, async (req, res) => {
    const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .order('created_at', { ascending: true });

    if (error) return res.status(500).json({ success: false, error: error.message });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Attendance Web App';
    const ws = wb.addWorksheet('Attendance', { views: [{ state: 'frozen', ySplit: 1 }] });

    ws.columns = [
        { header: 'ID',         key: 'id',         width: 8  },
        { header: 'Name',       key: 'name',       width: 25 },
        { header: 'Email',      key: 'email',      width: 32 },
        { header: 'Department', key: 'department', width: 20 },
        { header: 'Role',       key: 'role',       width: 20 },
        { header: 'Phone',      key: 'phone',      width: 18 },
        { header: 'Notes',      key: 'notes',      width: 40 },
        { header: 'Submitted',  key: 'created_at', width: 24 },
        { header: 'Updated',    key: 'updated_at', width: 24 },
    ];

    // Style header
    ws.getRow(1).eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D9E75' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    ws.getRow(1).height = 26;

    data.forEach(row => ws.addRow(row));

    const filename = `attendance_${new Date().toISOString().slice(0,10)}.xlsx`;
    
    // Final Fix for ISO bug: Use official MIME type, nosniff, and strict quoting
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Transfer-Encoding', 'binary');
    
    await wb.xlsx.write(res);
    res.end();
});

// ─── ADMIN: Download the MASTER file ──────────────────────────────────────────
// GET /api/admin/download-master
app.get('/api/admin/download-master', requireAdmin, (req, res) => {
    const filePath = path.join(__dirname, 'master_attendance.xlsx');
    
    // Final Fix for ISO bug for master file
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="master_attendance.xlsx"');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    res.sendFile(filePath);
});

// ─── ADMIN: Get Sync Status ───────────────────────────────────────────────────
// GET /api/admin/sync-status
app.get('/api/admin/sync-status', requireAdmin, (req, res) => {
    res.json(lastSync);
});

// ─── Dashboard app & Admin page routes ────────────────────────────────────────
app.get('/', (req, res) => {
    // We combine index and dashboard logic. The main UI is now dashboard.html.
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/dashboard', (req, res) => {
    res.redirect('/');
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
    console.log(`\n✅  Server running at http://localhost:${PORT}`);
    console.log(`🔒  Admin dashboard: http://localhost:${PORT}/admin`);
    console.log(`📊  Database: Supabase (${process.env.SUPABASE_URL || 'not configured — set .env'})\n`);
    
    // Initial sync
    await syncToMasterExcel();
});
