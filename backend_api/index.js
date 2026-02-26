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
app.use(cors());
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

app.post('/api/auth/verify-otp', async (req, res) => {
    try {
        let { phone, otp } = req.body;
        phone = phone.replace(/\D/g, '');
        if (phone.length === 12 && phone.startsWith('91')) {
            phone = phone.substring(2);
        }

        if (!phone || !otp) {
            return res.status(400).json({ error: 'Phone and OTP are required' });
        }

        // Authkey API URL for verifying OTP
        const url = `https://api.authkey.io/request?authkey=${AUTHKEY_API}&mobile=${phone}&country_code=91&sid=${AUTHKEY_SID}&company=Samanyudu&otp=${otp}`;

        const response = await fetch(url);
        const data = await response.json();

        console.log("AuthKey Verify Response:", data);

        // NOTE: AuthKey often handles the OTP matching internally and returns success.
        // Assuming success structure based on typical Indian SMS providers:
        if (data.Message && (data.Message.toLowerCase().includes('success') || data.Message.toLowerCase().includes('verified'))) {
            // Check if user exists in our DB, if not, create them
            const { rows } = await db.query('SELECT * FROM users WHERE phone = $1', [phone]);
            let user;
            if (rows.length === 0) {
                const insertRes = await db.query('INSERT INTO users (phone, name) VALUES ($1, $2) RETURNING *', [phone, 'New User']);
                user = insertRes.rows[0];
            } else {
                user = rows[0];
            }

            return res.json({
                success: true,
                message: 'OTP verified successfully',
                user: { id: user.id, phone: user.phone, name: user.name }
            });
        } else {
            return res.status(400).json({ error: 'Invalid OTP' });
        }
    } catch (err) {
        console.error("Error verifying OTP:", err);
        res.status(500).json({ error: 'Internal Server Error verifying OTP' });
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
        const { title, description, category, img_url, video_url, location, is_breaking, live_link, status, author, area, type } = req.body;
        const query = `
      INSERT INTO news(title, description, area, type, image_url, video_url, is_breaking, live_link, status, author)
      VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *;
        `;
        // We map category to type or area depending on the frontend payload, using area/type here as named in schema
        const values = [title, description, area || location, type || category, img_url, video_url, is_breaking || false, live_link, status || 'published', author || 'Admin'];
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
        const { title, video_url, duration, area, author } = req.body;
        const query = `
      INSERT INTO shorts(title, video_url, duration, area, author)
        VALUES($1, $2, $3, $4, $5)
        RETURNING *;
        `;
        const { rows } = await db.query(query, [title, video_url, duration, area, author]);
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
        const { media_url, interval_minutes, click_url, is_active } = req.body;
        const query = `
      INSERT INTO advertisements(media_url, interval_minutes, click_url, is_active)
        VALUES($1, $2, $3, $4)
        RETURNING *;
        `;
        const { rows } = await db.query(query, [media_url, interval_minutes, click_url, is_active]);
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
app.get('/api/shorts/:id/comments', async (req, res) => {
    try {
        const { id } = req.params;
        const query = 'SELECT * FROM shorts_comments WHERE short_id = $1 ORDER BY created_at DESC';
        const { rows } = await db.query(query, [id]);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching comments:', error);
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

        // Update comment count
        await db.query('UPDATE shorts SET comments_count = comments_count + 1 WHERE id = $1', [short_id]);

        res.status(201).json(rows[0]);
    } catch (error) {
        console.error('Error inserting comment:', error);
        res.status(500).json({ error: 'Failed to add comment' });
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

        // Return updated like count
        const { rows } = await db.query('SELECT likes FROM news WHERE id = $1', [id]);
        res.json({ likes: rows[0].likes });
    } catch (error) {
        console.error('Error modifying likes:', error);
        res.status(500).json({ error: 'Failed to process like' });
    }
});

// ==========================================
// MIGRATED ROUTES: STORAGE
// ==========================================
app.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const fileExt = path.extname(req.file.originalname);
    const fileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${fileExt}`;

    try {
        const uploadParams = {
            Bucket: process.env.R2_BUCKET_NAME,
            Key: fileName,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
        };

        await S3.send(new PutObjectCommand(uploadParams));

        // Save locally as well for immediate access if DNS/R2 public access is not set up
        const localPath = path.join(__dirname, 'uploads', fileName);
        fs.writeFileSync(localPath, req.file.buffer);

        // Preference: Use localhost for development if R2_PUBLIC_DOMAIN is not working
        // For production, the user should ensure R2_PUBLIC_DOMAIN is correct.
        const host = process.env.LOCAL_IP || 'localhost';
        const publicUrl = useLocal
            ? `http://${host}:${port}/uploads/${fileName}`
            : `https://${process.env.R2_PUBLIC_DOMAIN}/${fileName}`;

        console.log(`[R2] Uploaded to R2. [Local] Saved as ${fileName}. URL: ${publicUrl}`);
        res.json({ url: publicUrl });
    } catch (err) {
        console.error('Error uploading to R2:', err);
        res.status(500).json({ error: 'File upload failed' });
    }
});

// Start server
app.listen(port, () => {
    console.log(`🚀 API Backend running on http://localhost:${port}`);
});
