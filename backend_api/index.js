require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const fetch = require('node-fetch'); // For AuthKey API
const nodemailer = require('nodemailer');
const puppeteer = require('puppeteer');

const app = express();
const port = process.env.PORT || 5000;
const useLocal = process.env.USE_LOCAL === 'true'; // Set to false for production / cloud

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Email Transporter
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
    secure: process.env.SMTP_PORT == '465', // true for 465, false for 587
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
    tls: {
        rejectUnauthorized: false
    }
});

// In-memory OTP store (Use Redis for production)
const emailOtpStore = new Map();

// Middleware
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5000',
    'http://192.168.29.208:5000',
    'http://192.168.29.208:5173',
    process.env.ADMIN_URL,
    process.env.MOBILE_WEB_URL
].filter(Boolean);

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// R2 Storage Configuration
const S3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit for videos
});

// ==========================================
// HEALTH CHECK & ONE-TIME DB SETUP
// ==========================================
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', msg: 'Hetzner API Backend is running!' });
});

app.get('/api/init-db', async (req, res) => {
    try {
        const { initialize } = require('./init_render');
        await initialize();
        res.status(200).json({ status: 'ok', msg: 'Database initialized successfully!' });
    } catch (err) {
        console.error('Initialization Error:', err);
        res.status(500).json({ error: 'DB init failed' });
    }
});

// ==========================================
// AUTHENTICATION (AUTHKEY.IO OTP)
// ==========================================
const AUTHKEY_API = process.env.AUTHKEY_API_KEY || '';
const AUTHKEY_SID = process.env.AUTHKEY_SID || 'YOUR_SID_HERE';

app.post('/api/auth/send-otp', async (req, res) => {
    try {
        let { phone } = req.body;
        // Strip non-digits
        phone = phone.replace(/\D/g, '');
        // If it starts with 91 and is 12 digits, remove the 91
        if (phone.length === 12 && phone.startsWith('91')) {
            phone = phone.substring(2);
        }

        if (!phone || phone.length !== 10) {
            return res.status(400).json({ error: 'Valid 10-digit phone number is required' });
        }

        // Authkey API URL for sending SMS OTP
        const url = `https://api.authkey.io/request?authkey=${AUTHKEY_API}&mobile=${phone}&country_code=91&sid=${AUTHKEY_SID}&company=Samanyudu`;

        console.log(`Calling AuthKey: https://api.authkey.io/request?authkey=***&mobile=${phone}&country_code=91&sid=${AUTHKEY_SID}`);

        const response = await fetch(url);
        const data = await response.json();

        console.log("AuthKey Send Response:", data);

        if (data.Message && data.Message.toLowerCase().includes('success')) {
            return res.json({ success: true, message: 'OTP sent successfully' });
        } else {
            return res.status(400).json({ error: 'Failed to send OTP via provider' });
        }
    } catch (err) {
        console.error("Error sending OTP:", err);
        res.status(500).json({ error: 'Internal Server Error sending OTP' });
    }
});

app.post('/api/auth/register-mobile', async (req, res) => {
    try {
        let { firstName, lastName, phone, otp, password } = req.body;

        if (!firstName || !lastName || !phone || !otp || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        phone = phone.replace(/\D/g, '');
        if (phone.length === 12 && phone.startsWith('91')) {
            phone = phone.substring(2);
        }

        // Check if user already exists
        const { rows: existingUser } = await db.query('SELECT * FROM users WHERE phone = $1', [phone]);
        if (existingUser.length > 0) {
            return res.status(400).json({ error: 'Phone number already registered' });
        }

        // Authkey API URL for verifying OTP
        const url = `https://api.authkey.io/request?authkey=${AUTHKEY_API}&mobile=${phone}&country_code=91&sid=${AUTHKEY_SID}&company=Samanyudu&otp=${otp}`;

        const response = await fetch(url);
        const data = await response.json();

        console.log("AuthKey Verify Response:", data);

        if (data.Message && (data.Message.toLowerCase().includes('success') || data.Message.toLowerCase().includes('verified'))) {
            // Insert new user
            const query = 'INSERT INTO users (first_name, last_name, phone, password, name) VALUES ($1, $2, $3, $4, $5) RETURNING *';
            const result = await db.query(query, [firstName, lastName, phone, password, `${firstName} ${lastName}`.trim()]);
            const user = result.rows[0];

            return res.json({
                success: true,
                message: 'User registered successfully',
                user: { id: user.id, phone: user.phone, name: user.name || `${user.first_name} ${user.last_name}`.trim() }
            });
        } else {
            return res.status(400).json({ error: 'Invalid or expired OTP' });
        }
    } catch (err) {
        console.error("Error registering via mobile:", err);
        res.status(500).json({ error: 'Internal Server Error registering user' });
    }
});

// Login with Mobile and Password
app.post('/api/auth/login-mobile', async (req, res) => {
    try {
        let { phone, password } = req.body;
        if (!phone || !password) return res.status(400).json({ error: 'Phone number and password are required' });

        phone = phone.replace(/\D/g, '');
        if (phone.length === 12 && phone.startsWith('91')) {
            phone = phone.substring(2);
        }

        const { rows } = await db.query('SELECT * FROM users WHERE phone = $1 AND password = $2', [phone, password]);
        if (rows.length === 0) {
            return res.status(401).json({ error: 'Invalid phone number or password' });
        }

        const user = rows[0];
        res.json({
            success: true,
            user: { id: user.id, phone: user.phone, name: user.name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'User' }
        });
    } catch (err) {
        console.error("Error logging in mobile:", err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ==========================================
// EMAIL AUTHENTICATION
// ==========================================

// 1. Send OTP to Email
app.post('/api/auth/send-email-otp', async (req, res) => {
    try {
        const { email } = req.body;
        console.log(`[Email Auth] Request to send OTP to: ${email}`);
        if (!email) return res.status(400).json({ error: 'Email is required' });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        emailOtpStore.set(email, { otp, expires: Date.now() + 10 * 60 * 1000 }); // 10 mins

        const mailOptions = {
            from: process.env.SMTP_FROM,
            to: email,
            subject: 'Samanyudu TV - Verification Code',
            text: `Your verification code is: ${otp}. This code will expire in 10 minutes.`,
            html: `<h3>Samanyudu TV Verification</h3><p>Your verification code is: <b>${otp}</b></p><p>This code will expire in 10 minutes.</p>`,
        };

        console.log(`[Email Auth] Sending email using: ${process.env.SMTP_USER}`);
        await transporter.sendMail(mailOptions);
        console.log(`[Email Auth] OTP sent successfully to: ${email}`);
        res.json({ success: true, message: 'OTP sent to email successfully' });
    } catch (err) {
        console.error("[Email Auth] Error sending email OTP:", err);
        res.status(500).json({ error: 'Failed to send email OTP', details: err.message });
    }
});

// 2. Register User with Email and Password
app.post('/api/auth/register-email', async (req, res) => {
    try {
        const { firstName, lastName, email, otp, password } = req.body;

        if (!firstName || !lastName || !email || !otp || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const storedData = emailOtpStore.get(email);
        if (!storedData || storedData.otp !== otp || storedData.expires < Date.now()) {
            return res.status(400).json({ error: 'Invalid or expired OTP' });
        }

        // Check if user already exists
        const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        if (rows.length > 0) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        // Insert new user
        const query = 'INSERT INTO users (first_name, last_name, email, password) VALUES ($1, $2, $3, $4) RETURNING *';
        const result = await db.query(query, [firstName, lastName, email, password]);
        const user = result.rows[0];

        emailOtpStore.delete(email);

        res.json({
            success: true,
            message: 'User registered successfully',
            user: { id: user.id, email: user.email, name: `${user.first_name} ${user.last_name}` }
        });
    } catch (err) {
        console.error("Error registering user:", err);
        res.status(500).json({ error: 'Failed to register user' });
    }
});

// 3. Login with Email and Password
app.post('/api/auth/login-email', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

        const { rows } = await db.query('SELECT * FROM users WHERE email = $1 AND password = $2', [email, password]);
        if (rows.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const user = rows[0];
        res.json({
            success: true,
            user: { id: user.id, email: user.email, name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'User' }
        });
    } catch (err) {
        console.error("Error logging in:", err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Update Profile API
app.put('/api/user/:id/profile', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, phone, oldName } = req.body;

        // Split name fallback just in case we still rely on first/last
        const first_name = name.split(' ')[0] || '';
        const last_name = name.substring(first_name.length).trim() || '';

        // Update user
        const { rows } = await db.query(
            'UPDATE users SET name = $1, first_name = $2, last_name = $3, phone = $4 WHERE id = $5 RETURNING *',
            [name, first_name, last_name, phone, id]
        );

        if (rows.length === 0) return res.status(404).json({ error: 'User not found' });

        // Update comments by this user
        await db.query('UPDATE shorts_comments SET user_name = $1 WHERE user_id = $2', [name, id]);

        // Update news author
        if (oldName && oldName.trim() !== '') {
            await db.query('UPDATE news SET author = $1 WHERE author = $2', [name, oldName]);
        }

        res.json({ success: true, user: rows[0] });
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ error: 'Failed to update user profile' });
    }
});


// ==========================================
// ADMIN PORTAL ROUTES
// ==========================================

// Admin Login
app.post('/api/admin/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const { rows } = await db.query('SELECT id, email, name, role, state, district FROM admin_users WHERE email = $1 AND password = $2', [email, password]);

        if (rows.length === 0) {
            return res.status(401).json({ error: 'Invalid admin credentials' });
        }

        res.json({ success: true, user: rows[0] });
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Manage Reporters (Super Admin Only)
app.get('/api/admin/reporters', async (req, res) => {
    try {
        const { rows } = await db.query("SELECT id, email, password, name, role, state, district, created_at FROM admin_users WHERE role = 'sub_admin' ORDER BY created_at DESC");
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch reporters' });
    }
});

app.post('/api/admin/reporters', async (req, res) => {
    try {
        const { email, password, name, state, district } = req.body;
        const query = 'INSERT INTO admin_users (email, password, name, state, district, role) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, name, state, district';
        const { rows } = await db.query(query, [email, password, name, state, district, 'sub_admin']);
        res.status(201).json(rows[0]);
    } catch (error) {
        if (error.code === '23505') return res.status(400).json({ error: 'Email already exists' });
        res.status(500).json({ error: 'Failed to create reporter' });
    }
});

app.put('/api/admin/reporters/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const keys = Object.keys(updates);
        if (keys.length === 0) return res.status(400).json({ error: 'No fields to update' });

        const setClause = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
        const values = Object.values(updates);
        values.push(id);

        const query = `UPDATE admin_users SET ${setClause} WHERE id = $${values.length} RETURNING id, email, password, name, state, district, role;`;
        const { rows } = await db.query(query, values);

        if (rows.length === 0) return res.status(404).json({ error: 'Reporter not found' });
        res.json(rows[0]);
    } catch (error) {
        console.error('Error updating reporter:', error);
        res.status(500).json({ error: 'Failed to update reporter' });
    }
});

app.delete('/api/admin/reporters/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await db.query('DELETE FROM admin_users WHERE id = $1', [id]);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete reporter' });
    }
});

// ==========================================
// MIGRATED ROUTES: NEWS
// ==========================================

app.get('/api/admin/news/archive', async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM news ORDER BY timestamp DESC');

        let htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>SAMANYUDU TV - News Archive</title>
            <style>
                *, *::before, *::after { box-sizing: border-box; }
                body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; margin: 0; padding: 0; background: #fff; color: #333; width: 100%; }
                .header { text-align: center; background-color: #0f172a; color: #eab308; padding: 40px 20px; border-bottom: 5px solid #eab308; margin-bottom: 30px; }
                .header h1 { margin: 0; font-size: 36px; letter-spacing: 2px; text-transform: uppercase; }
                .header p { margin: 10px 0 0 0; color: #cbd5e1; font-size: 14px; }
                .container { width: 100%; padding: 0 50px; }
                .news-item { page-break-inside: avoid; border-bottom: 2px solid #e2e8f0; padding-bottom: 30px; margin-bottom: 30px; width: 100%; }
                .news-item img { display: block; max-width: 100%; max-height: 400px; object-fit: contain; margin: 20px auto 0 auto; border-radius: 8px; }
                h2 { color: #0f172a; margin: 0 0 15px 0; font-size: 26px; line-height: 1.3; }
                
                .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 13px; color: #64748b; }
                .meta-table td { padding: 15px; text-align: left; vertical-align: top; border-right: 1px solid #e2e8f0; width: 20%; }
                .meta-table td:last-child { border-right: none; }
                .meta-table strong { display: block; color: #334155; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; margin-bottom: 5px; }
                
                .description { white-space: pre-wrap; line-height: 1.7; color: #334155; font-size: 15px; }
                .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #94a3b8; padding: 30px 0; page-break-inside: avoid; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>SAMANYUDU TV</h1>
                <p>Official News Archive • Generated on ${new Date().toLocaleDateString()}</p>
                <p>Total Articles: ${rows.length}</p>
            </div>
            <div class="container">
        `;

        rows.forEach(item => {
            htmlContent += `
            <div class="news-item">
                <h2>${item.title || 'Untitled'}</h2>
                <table class="meta-table">
                    <tr>
                        <td><strong>Date</strong> ${new Date(item.timestamp).toLocaleString()}</td>
                        <td><strong>Area</strong> ${item.area || 'N/A'}</td>
                        <td><strong>Category</strong> ${item.type || 'N/A'}</td>
                        <td><strong>Reporter</strong> ${item.author || 'N/A'}</td>
                        <td><strong>Live Link</strong> ${item.live_link ? `<a href="${item.live_link}" target="_blank">Watch Live</a>` : 'N/A'}</td>
                    </tr>
                </table>
                <div class="description">${item.description || ''}</div>
                ${item.image_url ? `<img src="${item.image_url}" alt="News Image"/>` : ''}
            </div>
            `;
        });

        htmlContent += `
            </div>
            <div class="footer">
                &copy; ${new Date().getFullYear()} SAMANYUDU TV. All Rights Reserved.
            </div>
        </body>
        </html>
        `;

        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'] // allow images from cross-origin
        });
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: ['load', 'networkidle0'], timeout: 60000 });

        // Wait for all images to explicitly load
        await page.evaluate(async () => {
            const selectors = Array.from(document.querySelectorAll("img"));
            await Promise.all(selectors.map(img => {
                if (img.complete) return;
                return new Promise((resolve, reject) => {
                    img.addEventListener("load", resolve);
                    img.addEventListener("error", resolve); // resolve on error so we don't hang
                });
            }));
        });

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' }
        });
        await browser.close();

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Samanyudu_TV_News_Archive_${Date.now()}.pdf"`);
        res.send(pdfBuffer);

    } catch (error) {
        console.error('Archive failed:', error);
        res.status(500).json({ error: 'Failed to archive data' });
    }
});

app.delete('/api/admin/news/wipe', async (req, res) => {
    try {
        await db.query('DELETE FROM news');
        res.status(204).send();
    } catch (error) {
        console.error('Wipe failed:', error);
        res.status(500).json({ error: 'Failed to wipe data' });
    }
});

app.get('/api/news', async (req, res) => {
    try {
        const { district, role } = req.query;
        let query = 'SELECT * FROM news';
        let params = [];

        if (role === 'sub_admin' && district) {
            query += ' WHERE area = $1';
            params.push(district);
        }

        query += ' ORDER BY timestamp DESC';
        const { rows } = await db.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching news:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/news', async (req, res) => {
    try {
        const { title, description, category, img_url, image_url, video_url, location, is_breaking, live_link, status, author, area, type } = req.body;

        // Normalize fields
        const finalImageUrl = img_url || image_url;
        const finalArea = area || location;
        const finalType = type || category;
        const query = `
      INSERT INTO news(title, description, area, type, image_url, video_url, is_breaking, live_link, status, author)
      VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *;
        `;
        // We map category to type or area depending on the frontend payload, using area/type here as named in schema
        const values = [title, description, finalArea, finalType, finalImageUrl, video_url, is_breaking || false, live_link, status || 'published', author || 'Admin'];
        const { rows } = await db.query(query, values);
        res.status(201).json(rows[0]);
    } catch (error) {
        console.error('Error inserting news:', error);
        res.status(500).json({ error: 'Failed to create news' });
    }
});

app.put('/api/news/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const keys = Object.keys(updates);

        if (keys.length === 0) return res.status(400).json({ error: 'No fields to update' });

        const setClause = keys.map((k, i) => `"${k}" = $${i + 1} `).join(', ');
        const values = Object.values(updates);
        values.push(id);

        const query = `UPDATE news SET ${setClause} WHERE id = $${values.length} RETURNING *; `;
        const { rows } = await db.query(query, values);

        if (rows.length === 0) return res.status(404).json({ error: 'News not found' });
        res.json(rows[0]);
    } catch (error) {
        console.error('Error updating news:', error);
        res.status(500).json({ error: 'Failed to update news' });
    }
});

app.delete('/api/news/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await db.query('DELETE FROM news WHERE id = $1', [id]);
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting news:', error);
        res.status(500).json({ error: 'Failed to delete news' });
    }
});

// ==========================================
// MIGRATED ROUTES: SHORTS
// ==========================================
app.get('/api/shorts', async (req, res) => {
    try {
        const { district, role } = req.query;
        let query = 'SELECT * FROM shorts';
        let params = [];

        if (role === 'sub_admin' && district) {
            query += ' WHERE area = $1';
            params.push(district);
        }

        query += ' ORDER BY timestamp DESC';
        const { rows } = await db.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching shorts:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/shorts', async (req, res) => {
    try {
        const { title, video_url, videoUrl, duration, area, author } = req.body;
        const finalVideoUrl = video_url || videoUrl;
        const query = `
      INSERT INTO shorts(title, video_url, duration, area, author)
        VALUES($1, $2, $3, $4, $5)
        RETURNING *;
        `;
        const { rows } = await db.query(query, [title, finalVideoUrl, duration, area || 'General', author || 'Admin']);
        res.status(201).json(rows[0]);
    } catch (error) {
        console.error('Error inserting short:', error);
        res.status(500).json({ error: 'Failed to create short' });
    }
});

app.put('/api/shorts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const keys = Object.keys(updates);
        if (keys.length === 0) return res.status(400).json({ error: 'No fields to update' });

        const setClause = keys.map((k, i) => `"${k}" = $${i + 1} `).join(', ');
        const values = Object.values(updates);
        values.push(id);

        const query = `UPDATE shorts SET ${setClause} WHERE id = $${values.length} RETURNING *; `;
        const { rows } = await db.query(query, values);
        if (rows.length === 0) return res.status(404).json({ error: 'Short not found' });
        res.json(rows[0]);
    } catch (error) {
        console.error('Error updating short:', error);
        res.status(500).json({ error: 'Failed to update short' });
    }
});

app.delete('/api/shorts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await db.query('DELETE FROM shorts WHERE id = $1', [id]);
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting short:', error);
        res.status(500).json({ error: 'Failed to delete short' });
    }
});

// ==========================================
// MIGRATED ROUTES: ADVERTISEMENTS
// ==========================================
app.get('/api/advertisements', async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM advertisements ORDER BY timestamp DESC');
        res.json(rows);
    } catch (error) {
        console.error('Error fetching ads:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/advertisements', async (req, res) => {
    try {
        const { media_url, interval_minutes, display_interval, click_url, is_active } = req.body;
        const query = `
      INSERT INTO advertisements(media_url, interval_minutes, display_interval, click_url, is_active)
        VALUES($1, $2, $3, $4, $5)
        RETURNING *;
        `;
        const { rows } = await db.query(query, [media_url, interval_minutes, display_interval || 4, click_url, is_active]);
        res.status(201).json(rows[0]);
    } catch (error) {
        console.error('Error inserting ad:', error);
        res.status(500).json({ error: 'Failed to create ad' });
    }
});

app.put('/api/advertisements/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const keys = Object.keys(updates);
        if (keys.length === 0) return res.status(400).json({ error: 'No fields to update' });

        const setClause = keys.map((k, i) => `"${k}" = $${i + 1} `).join(', ');
        const values = Object.values(updates);
        values.push(id);

        const query = `UPDATE advertisements SET ${setClause} WHERE id = $${values.length} RETURNING *; `;
        const { rows } = await db.query(query, values);
        if (rows.length === 0) return res.status(404).json({ error: 'Ad not found' });
        res.json(rows[0]);
    } catch (error) {
        console.error('Error updating ad:', error);
        res.status(500).json({ error: 'Failed to update ad' });
    }
});

app.delete('/api/advertisements/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await db.query('DELETE FROM advertisements WHERE id = $1', [id]);
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting ad:', error);
        res.status(500).json({ error: 'Failed to delete ad' });
    }
});

// ==========================================
// MIGRATED ROUTES: COMMENTS & LIKES
// ==========================================
// --- Shorts Comments ---
app.get('/api/shorts/:id/comments', async (req, res) => {
    try {
        const { id } = req.params;
        const query = 'SELECT * FROM shorts_comments WHERE short_id = $1 ORDER BY created_at DESC';
        const { rows } = await db.query(query, [id]);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching short comments:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/shorts/comments', async (req, res) => {
    try {
        const { short_id, user_id, user_name, comment_text } = req.body;
        const query = `
      INSERT INTO shorts_comments(short_id, user_id, user_name, comment_text)
        VALUES($1, $2, $3, $4)
        RETURNING *;
        `;
        const { rows } = await db.query(query, [short_id, user_id, user_name, comment_text]);
        await db.query('UPDATE shorts SET comments_count = comments_count + 1 WHERE id = $1', [short_id]);
        res.status(201).json(rows[0]);
    } catch (error) {
        console.error('Error inserting short comment:', error);
        res.status(500).json({ error: 'Failed to add comment' });
    }
});

app.delete('/api/shorts/comments/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { rows } = await db.query('DELETE FROM shorts_comments WHERE id = $1 RETURNING short_id', [id]);
        if (rows.length > 0) {
            const shortId = rows[0].short_id;
            await db.query('UPDATE shorts SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = $1', [shortId]);
        }
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting short comment:', error);
        res.status(500).json({ error: 'Failed to delete comment' });
    }
});

// --- News Comments ---
app.get('/api/news/:id/comments', async (req, res) => {
    try {
        const { id } = req.params;
        const query = 'SELECT * FROM news_comments WHERE news_id = $1 ORDER BY created_at DESC';
        const { rows } = await db.query(query, [id]);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching news comments:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/news/comments', async (req, res) => {
    try {
        const { news_id, user_id, user_name, comment_text } = req.body;
        const query = `
      INSERT INTO news_comments(news_id, user_id, user_name, comment_text)
        VALUES($1, $2, $3, $4)
        RETURNING *;
        `;
        const { rows } = await db.query(query, [news_id, user_id, user_name, comment_text]);
        await db.query('UPDATE news SET comments_count = comments_count + 1 WHERE id = $1', [news_id]);
        res.status(201).json(rows[0]);
    } catch (error) {
        console.error('Error inserting news comment:', error);
        res.status(500).json({ error: 'Failed to add comment' });
    }
});

app.delete('/api/news/comments/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { rows } = await db.query('DELETE FROM news_comments WHERE id = $1 RETURNING news_id', [id]);
        if (rows.length > 0) {
            const newsId = rows[0].news_id;
            await db.query('UPDATE news SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = $1', [newsId]);
        }
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting news comment:', error);
        res.status(500).json({ error: 'Failed to delete comment' });
    }
});

// Likes logic
app.post('/api/news/:id/like', async (req, res) => {
    try {
        const { id } = req.params;
        const { user_id, action } = req.body; // action: 'like' or 'unlike'

        if (action === 'like') {
            await db.query('INSERT INTO news_likes (news_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, user_id]);
            await db.query('SELECT increment_news_likes($1)', [id]);
        } else {
            await db.query('DELETE FROM news_likes WHERE news_id = $1 AND user_id = $2', [id, user_id]);
            await db.query('SELECT decrement_news_likes($1)', [id]);
        }

        const { rows } = await db.query('SELECT likes FROM news WHERE id = $1', [id]);
        res.json({ likes: rows[0].likes });
    } catch (error) {
        console.error('Error modifying news likes:', error);
        res.status(500).json({ error: 'Failed to process like' });
    }
});

app.post('/api/shorts/:id/like', async (req, res) => {
    try {
        const { id } = req.params;
        const { user_id, action } = req.body;

        if (action === 'like') {
            await db.query('INSERT INTO shorts_likes (short_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, user_id]);
            await db.query('SELECT increment_shorts_likes($1)', [id]);
        } else {
            await db.query('DELETE FROM shorts_likes WHERE short_id = $1 AND user_id = $2', [id, user_id]);
            await db.query('SELECT decrement_shorts_likes($1)', [id]);
        }

        const { rows } = await db.query('SELECT likes FROM shorts WHERE id = $1', [id]);
        res.json({ likes: rows[0] ? rows[0].likes : 0 });
    } catch (error) {
        console.error('Error modifying short likes:', error);
        res.status(500).json({ error: 'Failed to process like' });
    }
});

// ==========================================
// MIGRATED ROUTES: STORAGE
// ==========================================
app.get('/api/user/:id/stats', async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Get comments count from shorts_comments
        const commentsResult = await db.query('SELECT COUNT(*) as count FROM shorts_comments WHERE user_id = $1', [id]);
        const commentsCount = parseInt(commentsResult.rows[0].count, 10) || 0;

        // 2. Notifications count: For now, return the number of news items added in the last 24 hours as available notifications.
        const newsResult = await db.query("SELECT COUNT(*) as count FROM news WHERE created_at >= NOW() - INTERVAL '24 HOURS'");
        const notificationsCount = parseInt(newsResult.rows[0].count, 10) || 0;

        res.json({ commentsCount, notificationsCount });
    } catch (error) {
        console.error('Error fetching user stats:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/api/user/:id/likes', async (req, res) => {
    try {
        const { id } = req.params;

        const newsLikes = await db.query('SELECT news_id FROM news_likes WHERE user_id = $1', [id]);
        const shortsLikes = await db.query('SELECT short_id FROM shorts_likes WHERE user_id = $1', [id]);

        res.json({
            news: newsLikes.rows.map(row => row.news_id),
            shorts: shortsLikes.rows.map(row => row.short_id)
        });
    } catch (error) {
        console.error('Error fetching user likes:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const fileExt = path.extname(req.file.originalname);
    const fileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${fileExt}`;

    try {
        // 1. Always save locally first for reliability
        const localPath = path.join(__dirname, 'uploads', fileName);
        fs.writeFileSync(localPath, req.file.buffer);
        console.log(`[Upload] Saved locally: ${fileName}`);

        // 2. Determine the public URL
        // Use the host from the request headers to ensure the client can reach it back
        // This solves the 'localhost' vs '172.16.x.x' issue automatically
        const protocol = req.protocol;
        const host = req.get('host'); // e.g. 'localhost:5000' or '172.16.25.5:5000'

        let publicUrl;
        if (useLocal) {
            publicUrl = `${protocol}://${host}/uploads/${fileName}`;

            // Try R2 upload as a backup (non-blocking in local mode)
            const uploadParams = {
                Bucket: process.env.R2_BUCKET_NAME,
                Key: fileName,
                Body: req.file.buffer,
                ContentType: req.file.mimetype,
            };
            S3.send(new PutObjectCommand(uploadParams))
                .then(() => console.log(`[R2] Backup upload successful: ${fileName}`))
                .catch(err => console.error(`[R2] Backup upload failed (ignoring in local mode):`, err.message));
        } else {
            // Production mode: R2 is mandatory
            const uploadParams = {
                Bucket: process.env.R2_BUCKET_NAME,
                Key: fileName,
                Body: req.file.buffer,
                ContentType: req.file.mimetype,
            };
            await S3.send(new PutObjectCommand(uploadParams));

            if (process.env.R2_PUBLIC_DOMAIN) {
                publicUrl = `https://${process.env.R2_PUBLIC_DOMAIN}/${fileName}`;
            } else {
                // Fallback to local if R2 domain is missing
                publicUrl = `${protocol}://${host}/uploads/${fileName}`;
            }
        }

        console.log(`[Upload] Completed. URL: ${publicUrl}`);
        res.json({ url: publicUrl });
    } catch (err) {
        console.error('Error in upload process:', err);
        res.status(500).json({ error: 'File processing failed', details: err.message });
    }
});

// ==========================================
// SAVED ITEMS
// ==========================================
app.get('/api/user/:id/saved', async (req, res) => {
    try {
        const { id } = req.params;
        const { rows } = await db.query('SELECT item_id, item_type FROM saved_items WHERE user_id = $1', [id]);

        const news = rows.filter(r => r.item_type === 'news').map(r => r.item_id);
        const shorts = rows.filter(r => r.item_type === 'shorts').map(r => r.item_id);

        res.json({ news, shorts });
    } catch (error) {
        console.error('Error fetching saved items:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/user/:id/save', async (req, res) => {
    try {
        const { id } = req.params;
        const { item_id, item_type, action } = req.body; // action: 'save' or 'unsave'

        if (action === 'save') {
            await db.query('INSERT INTO saved_items (user_id, item_id, item_type) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [id, item_id, item_type || 'news']);
        } else {
            await db.query('DELETE FROM saved_items WHERE user_id = $1 AND item_id = $2', [id, item_id]);
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Error modifying saved items:', error);
        res.status(500).json({ error: 'Failed to process save' });
    }
});

app.post('/api/user/:id/sync-saved', async (req, res) => {
    try {
        const { id } = req.params;
        const { news, shorts } = req.body; // Arrays of IDs

        if (news && Array.isArray(news)) {
            for (const itemId of news) {
                await db.query('INSERT INTO saved_items (user_id, item_id, item_type) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [id, itemId, 'news']);
            }
        }
        if (shorts && Array.isArray(shorts)) {
            for (const itemId of shorts) {
                await db.query('INSERT INTO saved_items (user_id, item_id, item_type) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [id, itemId, 'shorts']);
            }
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Error syncing saved items:', error);
        res.status(510).json({ error: 'Failed to sync saved items' });
    }
});

// Start server
app.listen(port, () => {
    console.log(`🚀 API Backend running on http://localhost:${port}`);
});
