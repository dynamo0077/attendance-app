const express = require('express');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const { Mutex } = require('async-mutex');

const app = express();
const PORT = process.env.PORT || 3000;
const EXCEL_FILE_PATH = path.join(__dirname, 'data.xlsx');
const mutex = new Mutex();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/submit', async (req, res) => {
    const { name, email, department, message } = req.body;

    if (!name || !email) {
        return res.status(400).json({ success: false, error: 'Name and Email are required.' });
    }

    const release = await mutex.acquire();
    try {
        const workbook = new ExcelJS.Workbook();
        let worksheet;

        if (fs.existsSync(EXCEL_FILE_PATH)) {
            // Read existing file
            await workbook.xlsx.readFile(EXCEL_FILE_PATH);
            worksheet = workbook.getWorksheet(1);
            if (!worksheet) {
                worksheet = workbook.addWorksheet('Submissions');
                worksheet.columns = [
                    { header: 'Date', key: 'date', width: 20 },
                    { header: 'Name', key: 'name', width: 25 },
                    { header: 'Email', key: 'email', width: 30 },
                    { header: 'Department', key: 'department', width: 20 },
                    { header: 'Message', key: 'message', width: 50 },
                ];
            }
        } else {
            // Create a new file if it doesn't exist
            worksheet = workbook.addWorksheet('Submissions');
            worksheet.columns = [
                { header: 'Date', key: 'date', width: 20 },
                { header: 'Name', key: 'name', width: 25 },
                { header: 'Email', key: 'email', width: 30 },
                { header: 'Department', key: 'department', width: 20 },
                { header: 'Message', key: 'message', width: 50 },
            ];
        }

        // Add the new row
        worksheet.addRow({
            date: new Date().toLocaleString(),
            name,
            email,
            department: department || '',
            message: message || ''
        });

        // Write directly to the same file path, updating it without creating copies
        await workbook.xlsx.writeFile(EXCEL_FILE_PATH);
        
        res.status(200).json({ success: true, message: 'Data successfully added to Excel file!' });
    } catch (error) {
        console.error('Error updating Excel file:', error);
        res.status(500).json({ success: false, error: 'Internal server error while updating the Excel file.' });
    } finally {
        release();
    }
});

app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
    console.log(`Data will be written directly to: ${EXCEL_FILE_PATH}`);
});
