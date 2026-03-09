const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const db = require('./db');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const archiver = require('archiver');
const fetch = require('node-fetch'); // For AuthKey API
const axios = require('axios');
const nodemailer = require('nodemailer');
const { Resend } = require('resend');
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const puppeteer = require('puppeteer');

const app = express();

// Auto-fix database schema
(async () => {
    try {
        await db.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='firebase_uid') THEN
                    ALTER TABLE users ADD COLUMN firebase_uid VARCHAR;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='name') THEN
                    ALTER TABLE users ADD COLUMN name VARCHAR;
                END IF;
            END $$;`);
        console.log('Database schema checked and updated.');
    } catch (err) {
        console.error('Error auto-fixing schema:', err);
    }
})();

const port = process.env.PORT || 5000;
const useLocal = process.env.USE_LOCAL === 'true'; // Set to false for production / cloud

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}
const uploadStaticOptions = {
    setHeaders: (res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    }
};
app.use('/api/uploads', express.static(uploadsDir, uploadStaticOptions));
app.use('/uploads', express.static(uploadsDir, uploadStaticOptions));

// Email Transporter
const transporter = (process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS)
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT, 10),
        secure: process.env.SMTP_PORT === '465',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
        tls: {
            rejectUnauthorized: false
        }
    })
    : null;

// In-memory OTP store (Use Redis for production)
const mobileOtpStore = new Map();
const emailOtpStore = new Map();

// Middleware
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:8099',
    'http://localhost:8080',
    'http://localhost:5000',
    'http://localhost:3001',
    'http://localhost:3000',
    'http://127.0.0.1:8099',
    'http://127.0.0.1:8080',
    'http://192.168.29.208:5000',
    'http://192.168.29.208:5173',
    'https://samanyudutv.in',
    'https://www.samanyudutv.in',
    'https://admin.samanyudutv.in',
    'https://api.samanyudutv.in',
    process.env.ADMIN_URL,
    process.env.MOBILE_WEB_URL
].filter(Boolean);

const localhostOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin) || localhostOriginPattern.test(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    exposedHeaders: ['Content-Disposition', 'Content-Type']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        console.error('Invalid JSON payload:', err.message);
        return res.status(400).json({ error: 'Invalid JSON payload' });
    }
    return next(err);
});

// R2 Storage Configuration
function hasR2Config() {
    return Boolean(
        process.env.R2_BUCKET_NAME &&
        process.env.R2_ACCESS_KEY_ID &&
        process.env.R2_SECRET_ACCESS_KEY &&
        process.env.CLOUDFLARE_ACCOUNT_ID
    );
}

function getS3Client() {
    if (!hasR2Config()) {
        return null;
    }

    return new S3Client({
        region: 'auto',
        endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        },
    });
}

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit for videos
});

// ==========================================
// HEALTH CHECK & ONE-TIME DB SETUP
// ==========================================
app.get('/api/health', async (req, res) => {
    try {
        await db.query('SELECT 1');
        res.status(200).json({ status: 'ok', db: 'ok', msg: 'DigitalOcean API backend is running!' });
    } catch (error) {
        console.error('Health check DB error:', error.message);
        res.status(500).json({ status: 'error', db: 'down', error: 'Database connection failed' });
    }
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
// AUTHENTICATION (FAST2SMS OTP)
// ==========================================
const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY || '';
const MESSAGE_CENTRAL_CUSTOMER_ID = process.env.MESSAGE_CENTRAL_CUSTOMER_ID || '';
const MESSAGE_CENTRAL_API_KEY = process.env.MESSAGE_CENTRAL_API_KEY || '';
const TWO_FACTOR_API_KEY = process.env.TWO_FACTOR_API_KEY || '';

// Helper to get Message Central Auth Token
async function getMessageCentralToken() {
    try {
        const url = `https://cpaas.messagecentral.com/auth/v1/authentication/token?customerId=${MESSAGE_CENTRAL_CUSTOMER_ID}&key=${MESSAGE_CENTRAL_API_KEY}&scope=NEW`;
        const response = await axios.post(url); // Often works as POST or GET
        return response.data.token;
    } catch (err) {
        console.error('Error generating Message Central token:', err.message);
        return null;
    }
}


function normalizeIndianPhone(phone = '') {
    let normalizedPhone = String(phone).replace(/\D/g, '');
    if (normalizedPhone.length === 12 && normalizedPhone.startsWith('91')) {
        normalizedPhone = normalizedPhone.substring(2);
    }
    return normalizedPhone;
}

function isValidIndianMobile(phone = '') {
    return /^\d{10}$/.test(phone);
}

app.post('/api/auth/send-otp', async (req, res) => {
    try {
        let { phone } = req.body;
        phone = phone.replace(/\D/g, '');
        if (phone.length === 10) phone = '91' + phone;

        // Check for existing user before sending OTP
        const { rows: userCheck } = await db.query('SELECT 1 FROM users WHERE phone = $1', [phone.substring(phone.length - 10)]);
        if (userCheck.length > 0) {
            return res.status(400).json({ error: 'మొబైల్ నంబర్ ఇప్పటికే నమోదు చేయబడింది. దయచేసి లాగిన్ చేయండి.' }); // Translated: Mobile number already registered. Please login.
        }

        // 1. Try Message Central (Primary)
        if (MESSAGE_CENTRAL_CUSTOMER_ID && MESSAGE_CENTRAL_API_KEY) {
            try {
                // If key is a JWT, use it directly as the token
                let token = MESSAGE_CENTRAL_API_KEY.startsWith('eyJ')
                    ? MESSAGE_CENTRAL_API_KEY
                    : await getMessageCentralToken();

                if (token) {
                    const sendUrl = 'https://cpaas.messagecentral.com/verification/v3/send';
                    const payload = {
                        customerId: MESSAGE_CENTRAL_CUSTOMER_ID,
                        countryCode: '91',
                        mobileNumber: phone.substring(phone.length - 10),
                        flowId: 'default', // Using your default flow
                        flowType: 'SMS',   // Force SMS flow
                        type: 'OTP',       // Verication type
                        isFallbackEnable: false // DISABLE VOICE FALLBACK
                    };

                    console.log(`[OTP] Requesting SMS from MC for ${phone}...`);
                    const response = await axios.post(sendUrl, payload, {
                        headers: { 'authToken': token }
                    });
                    console.log(`[OTP] MC Response:`, JSON.stringify(response.data));

                    if (response.data.responseCode === 200) {
                        mobileOtpStore.set(phone.substring(phone.length - 10), {
                            use_mc: true,
                            expires: Date.now() + 10 * 60 * 1000
                        });
                        return res.json({ success: true, message: 'OTP sent successfully via Message Central' });
                    }
                }
            } catch (err) {
                console.error('Message Central failed:', err.response?.data || err.message);
            }
        }

        // 2. Fallbacks (2Factor & Fast2SMS)
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        mobileOtpStore.set(phone.substring(phone.length - 10), { otp, expires: Date.now() + 10 * 60 * 1000 });

        if (TWO_FACTOR_API_KEY) {
            try {
                const url = `https://2factor.in/API/V1/${TWO_FACTOR_API_KEY}/SMS/${phone}/${otp}/OTP1`;
                const response = await axios.get(url);
                if (response.data.Status === 'Success') {
                    console.log(`[OTP] Sent via 2Factor (SMS) to ${phone}`);
                    return res.json({ success: true, message: 'OTP sent successfully via 2Factor' });
                }
            } catch (err) {
                console.error('2Factor fallback failed:', err.message);
            }
        }

        if (FAST2SMS_API_KEY) {
            try {
                const phone10 = phone.substring(phone.length - 10);
                const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${FAST2SMS_API_KEY}&route=otp&variables_values=${otp}&numbers=${phone10}`;
                const response = await axios.get(url);
                if (response.data.return) {
                    console.log(`[OTP] Sent via Fast2SMS to ${phone10}`);
                    return res.json({ success: true, message: 'OTP sent successfully via Fast2SMS' });
                }
            } catch (err) {
                console.error('Fast2SMS fallback failed:', err.message);
            }
        }
        return res.status(400).json({ error: 'Failed to send OTP. Service issue.' });
    } catch (err) {
        console.error('Error sending OTP:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/auth/verify-otp', async (req, res) => {
    try {
        let { phone, otp } = req.body;
        phone = phone.replace(/\D/g, '');
        phone = phone.substring(phone.length - 10);
        otp = String(otp || '').trim();

        const storedData = mobileOtpStore.get(phone);
        if (!storedData || storedData.expires < Date.now()) {
            return res.status(400).json({ error: 'Invalid or expired OTP' });
        }

        if (storedData.use_mc) {
            try {
                const token = await getMessageCentralToken();
                if (!token) throw new Error('Failed to get MC token');

                const validateUrl = `https://api.messagecentral.com/verification/v3/validate?mobileNumber=${phone}&verificationCode=${otp}`;
                const response = await axios.get(validateUrl, {
                    headers: { 'authToken': token }
                });

                if (response.data.responseCode === 200 && response.data.data.verificationStatus === 'VERIFIED') {
                    // Mark as verified in our store so register/reset routes can trust it
                    mobileOtpStore.set(phone, { ...storedData, verified: true });
                    return res.json({ success: true, message: 'OTP verified successfully' });
                }
                return res.status(400).json({ error: 'Invalid or expired OTP from Message Central' });
            } catch (err) {
                console.error('Message Central Validation Error:', err.response?.data || err.message);
                return res.status(500).json({ error: 'Verification service error' });
            }
        }

        if (storedData.otp !== otp) {
            return res.status(400).json({ error: 'Invalid OTP' });
        }

        return res.json({ success: true, message: 'OTP verified successfully' });
    } catch (err) {
        console.error('Error verifying OTP:', err.message);
        return res.status(500).json({ error: 'Internal Server Error verifying OTP' });
    }
});

app.post('/api/auth/register-mobile', async (req, res) => {
    try {
        let { firstName, lastName, phone, otp, password } = req.body;
        if (!firstName || !lastName || !phone || !otp || !password) return res.status(400).json({ error: 'All fields are required' });
        phone = phone.replace(/\D/g, '');
        phone = phone.substring(phone.length - 10);

        const storedData = mobileOtpStore.get(phone);
        if (!storedData || storedData.expires < Date.now()) {
            return res.status(400).json({ error: 'Invalid or expired OTP' });
        }

        // If using MC, it must have been marked as verified by the verify-otp route
        if (storedData.use_mc) {
            if (!storedData.verified) {
                try {
                    const token = await getMessageCentralToken();
                    const validateUrl = `https://api.messagecentral.com/verification/v3/validate?mobileNumber=${phone}&verificationCode=${otp}`;
                    const response = await axios.get(validateUrl, { headers: { 'authToken': token } });
                    if (response.data.responseCode !== 200 || response.data.data.verificationStatus !== 'VERIFIED') {
                        return res.status(400).json({ error: 'Invalid OTP' });
                    }
                } catch (err) {
                    console.error('MC Validation failed in register-mobile:', err.message);
                    return res.status(500).json({ error: 'OTP validation failed' });
                }
            }
        } else if (storedData.otp !== otp) {
            return res.status(400).json({ error: 'Invalid OTP' });
        }

        const { rows: existing } = await db.query('SELECT * FROM users WHERE phone = $1', [phone]);
        if (existing.length > 0) return res.status(400).json({ error: 'Phone already registered' });

        const passTrimmed = String(password).trim();
        const query = 'INSERT INTO users (first_name, last_name, phone, password, name) VALUES ($1, $2, $3, $4, $5) RETURNING *';
        const result = await db.query(query, [firstName, lastName, phone, passTrimmed, `${firstName} ${lastName}`.trim()]);
        mobileOtpStore.delete(phone);
        res.json({ success: true, user: { id: result.rows[0].id, phone: result.rows[0].phone, name: result.rows[0].name } });
    } catch (err) {
        console.error("Error registering via mobile:", err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// 2b. Register/Sync Firebase User
app.post('/api/auth/register-firebase', async (req, res) => {
    try {
        const { uid, email, firstName, lastName } = req.body;
        if (!uid || !email) return res.status(400).json({ error: 'UID and Email are required' });

        const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        let user;

        if (rows.length > 0) {
            // Update existing user - only update names if provided
            let query = 'UPDATE users SET firebase_uid = $1';
            let params = [uid];

            if (firstName && lastName) {
                query += ', first_name = $2, last_name = $3, name = $4';
                params.push(firstName, lastName, `${firstName} ${lastName}`.trim());
            }

            query += ' WHERE email = $' + (params.length + 1) + ' RETURNING *';
            params.push(email);

            const updateResult = await db.query(query, params);
            user = updateResult.rows[0];
        } else {
            // New user - use provided names or default to "User"
            const fName = firstName || 'User';
            const lName = lastName || '';
            const fullName = `${fName} ${lName}`.trim();

            const insertResult = await db.query(
                'INSERT INTO users (email, first_name, last_name, name, firebase_uid) VALUES ($1, $2, $3, $4, $5) RETURNING *',
                [email, fName, lName, fullName, uid]
            );
            user = insertResult.rows[0];
        }
        res.json({ success: true, user: { id: user.id, email: user.email, name: user.name || `${user.first_name} ${user.last_name}`.trim() } });
    } catch (err) {
        console.error("Error syncing Firebase user:", err);
        res.status(500).json({ error: 'Failed to sync user' });
    }
});

// 2c. Register/Sync Firebase Phone User
app.post('/api/auth/register-firebase-phone', async (req, res) => {
    try {
        let { uid, phone, firstName, lastName } = req.body;
        if (!uid || !phone) return res.status(400).json({ error: 'UID and Phone are required' });

        phone = phone.replace(/\D/g, '');
        phone = phone.substring(phone.length - 10);

        // Check if user exists by phone
        const { rows } = await db.query('SELECT * FROM users WHERE phone = $1', [phone]);
        let user;

        if (rows.length > 0) {
            // Update existing user with UID
            const updateResult = await db.query(
                'UPDATE users SET firebase_uid = $1 WHERE phone = $2 RETURNING *',
                [uid, phone]
            );
            user = updateResult.rows[0];
        } else {
            // Create new user
            const fName = firstName || 'User';
            const lName = lastName || '';
            const fullName = `${fName} ${lName}`.trim();

            const insertResult = await db.query(
                'INSERT INTO users (phone, first_name, last_name, name, firebase_uid) VALUES ($1, $2, $3, $4, $5) RETURNING *',
                [phone, fName, lName, fullName, uid]
            );
            user = insertResult.rows[0];
        }

        res.json({
            success: true,
            user: {
                id: user.id,
                phone: user.phone,
                name: user.name || `${user.first_name} ${user.last_name}`.trim()
            }
        });
    } catch (err) {
        console.error("Error syncing Firebase phone user:", err);
        res.status(500).json({ error: 'Failed to sync user' });
    }
});


// Reset Password with Mobile OTP
app.post('/api/auth/reset-password-mobile', async (req, res) => {
    try {
        let { phone, otp, newPassword } = req.body;
        if (!phone || !otp || !newPassword) return res.status(400).json({ error: 'Phone, OTP and new password are required' });

        phone = phone.replace(/\D/g, '');
        phone = phone.substring(phone.length - 10);

        const storedData = mobileOtpStore.get(phone);
        if (!storedData || storedData.expires < Date.now()) {
            return res.status(400).json({ error: 'Invalid or expired OTP' });
        }

        if (storedData.use_mc) {
            if (!storedData.verified) {
                try {
                    const token = await getMessageCentralToken();
                    const validateUrl = `https://api.messagecentral.com/verification/v3/validate?mobileNumber=${phone}&verificationCode=${otp}`;
                    const response = await axios.get(validateUrl, { headers: { 'authToken': token } });
                    if (response.data.responseCode !== 200 || response.data.data.verificationStatus !== 'VERIFIED') {
                        return res.status(400).json({ error: 'Invalid OTP' });
                    }
                } catch (err) {
                    return res.status(500).json({ error: 'OTP validation failed' });
                }
            }
        } else if (storedData.otp !== String(otp).trim()) {
            console.log(`[Reset] OTP mismatch for ${phone}. Input: ${otp}, Stored: ${storedData?.otp}`);
            return res.status(400).json({ error: 'Invalid or expired OTP' });
        }

        console.log(`[Reset] Updating password for ${phone}. New length: ${newPassword.length}`);
        const { rowCount } = await db.query('UPDATE users SET password = $1 WHERE phone = $2', [newPassword.trim(), phone]);

        if (rowCount === 0) {
            console.warn(`[Reset] Found no user with phone ${phone}`);
            return res.status(404).json({ error: 'Account not found for this phone number' });
        }

        mobileOtpStore.delete(phone);
        res.json({ success: true, message: 'Password reset successfully' });
    } catch (err) {
        console.error("Error resetting password:", err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


// 3b. Login with Mobile and Password
app.post('/api/auth/login-mobile', async (req, res) => {
    try {
        let { phone, password } = req.body;
        if (!phone || !password) return res.status(400).json({ error: 'Phone and password are required' });

        phone = phone.replace(/\D/g, '');
        phone = phone.substring(phone.length - 10);
        const passTrimmed = String(password).trim();

        console.log(`[Login] Attempt for ${phone}`);
        const { rows } = await db.query('SELECT * FROM users WHERE phone = $1 AND password = $2', [phone, passTrimmed]);

        if (rows.length === 0) {
            // Optional: try to find user by phone only to give better error
            const { rows: checkUser } = await db.query('SELECT password FROM users WHERE phone = $1', [phone]);
            if (checkUser.length > 0) {
                console.warn(`[Login] Wrong password for ${phone}`);
                return res.status(401).json({ error: 'Incorrect password' });
            } else {
                console.warn(`[Login] Phone not found ${phone}`);
                return res.status(401).json({ error: 'No account found with this phone number' });
            }
        }

        const user = rows[0];
        console.log(`[Login] Success for ${user.id} (${phone})`);
        res.json({
            success: true,
            user: { id: user.id, phone: user.phone, name: user.name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'User' }
        });
    } catch (err) {
        console.error("Error logging in via mobile:", err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/auth/login-otp', async (req, res) => {
    try {
        let { phone, otp } = req.body;
        if (!phone || !otp) return res.status(400).json({ error: 'Phone and OTP are required' });

        phone = phone.replace(/\D/g, '');
        phone = phone.substring(phone.length - 10);

        const storedData = mobileOtpStore.get(phone);
        if (!storedData || storedData.expires < Date.now()) {
            return res.status(400).json({ error: 'Invalid or expired OTP' });
        }

        if (storedData.use_mc) {
            try {
                const token = await getMessageCentralToken();
                const validateUrl = `https://api.messagecentral.com/verification/v3/validate?mobileNumber=${phone}&verificationCode=${otp}`;
                const response = await axios.get(validateUrl, { headers: { 'authToken': token } });
                if (response.data.responseCode !== 200 || response.data.data.verificationStatus !== 'VERIFIED') {
                    return res.status(400).json({ error: 'Invalid OTP' });
                }
            } catch (err) {
                return res.status(500).json({ error: 'OTP validation service error' });
            }
        } else if (storedData.otp !== String(otp).trim()) {
            return res.status(400).json({ error: 'Invalid OTP' });
        }

        const { rows } = await db.query('SELECT * FROM users WHERE phone = $1', [phone]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'No account found for this phone. Please sign up first.' });
        }

        const user = rows[0];
        mobileOtpStore.delete(phone);
        res.json({
            success: true,
            user: { id: user.id, phone: user.phone, name: user.name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'User' }
        });
    } catch (err) {
        console.error("Error logging in via OTP:", err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// 3. Login with Email and Password
app.post('/api/auth/login-email', async (req, res) => {
    try {
        const passTrimmed = String(password).trim();

        const { rows } = await db.query('SELECT * FROM users WHERE email = $1 AND password = $2', [email, passTrimmed]);
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

// Maintenance Mode
app.get('/api/admin/settings/maintenance', async (req, res) => {
    try {
        const { rows } = await db.query("SELECT value FROM app_settings WHERE key = 'maintenance_mode'");
        const enabled = rows.length > 0 ? rows[0].value : false;
        res.json({ enabled });
    } catch (error) {
        console.error('Fetch maintenance error:', error);
        res.status(500).json({ error: 'Failed to fetch maintenance status' });
    }
});

app.post('/api/admin/settings/maintenance', async (req, res) => {
    try {
        const { enabled } = req.body;
        await db.query("INSERT INTO app_settings (key, value) VALUES ('maintenance_mode', $1) ON CONFLICT (key) DO UPDATE SET value = $1", [JSON.stringify(enabled)]);
        res.json({ success: true, enabled });
    } catch (error) {
        console.error('Update maintenance error:', error);
        res.status(500).json({ error: 'Failed to update maintenance status' });
    }
});

// ==========================================
// MIGRATED ROUTES: NEWS
// ==========================================

app.get('/api/admin/news/archive', async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM news ORDER BY timestamp DESC');
        const requestedFormat = String(req.query.format || '').toLowerCase();
        const forceJson = requestedFormat === 'json';
        const forceDoc = requestedFormat === 'doc' || requestedFormat === 'word' || requestedFormat === 'docx';

        const downloadJsonBackup = () => {
            const fileName = `Samanyudu_TV_News_Archive_${Date.now()}.json`;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            res.send(JSON.stringify(rows, null, 2));
        };

        const escapeHtml = (value) =>
            String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');

        if (forceJson) {
            return downloadJsonBackup();
        }

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
                <p>Official News Archive | Generated on ${new Date().toLocaleDateString()}</p>
                <p>Total Articles: ${rows.length}</p>
            </div>
            <div class="container">
        `;

        const formatDescription = (desc) => {
            if (!desc) return '';
            return escapeHtml(desc).replace(/\n/g, '<br/>');
        };

        rows.forEach(item => {
            htmlContent += `
            <div class="news-item">
                <h2>${escapeHtml(item.title || 'Untitled')}</h2>
                <table class="meta-table">
                    <tr>
                        <td><strong>Date</strong> ${escapeHtml(item.timestamp ? new Date(item.timestamp).toLocaleString() : 'N/A')}</td>
                        <td><strong>Area</strong> ${escapeHtml(item.area || 'N/A')}</td>
                        <td><strong>Category</strong> ${escapeHtml(item.type || 'N/A')}</td>
                        <td><strong>Reporter</strong> ${escapeHtml(item.author || 'N/A')}</td>
                        <td><strong>Live Link</strong> ${item.live_link ? `<a href="${escapeHtml(item.live_link)}" target="_blank" rel="noopener noreferrer">Watch Live</a>` : 'N/A'}</td>
                    </tr>
                </table>
                <div class="description">${formatDescription(item.description)}</div>
                ${item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="News Image"/>` : ''}
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

        if (forceDoc) {
            const fileName = `Samanyudu_TV_News_Archive_${Date.now()}.doc`;
            // Set headers specifically for MS Word
            res.setHeader('Content-Type', 'application/msword; charset=UTF-8');
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

            // Embed images as base64 for Word compatibility
            const processedRows = await Promise.all(rows.map(async (item) => {
                let base64Image = null;
                if (item.image_url) {
                    try {
                        const response = await axios.get(item.image_url, { responseType: 'arraybuffer' });
                        const buffer = Buffer.from(response.data, 'binary').toString('base64');
                        const contentType = response.headers['content-type'];
                        base64Image = `data:${contentType};base64,${buffer}`;
                    } catch (err) {
                        console.error('Image fetch error for Word:', err.message);
                    }
                }
                return { ...item, embedded_image: base64Image };
            }));

            // Simpler HTML for Word compatibility and better Telugu support
            const wordHtml = `
            <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
            <head>
                <meta charset="utf-8">
                <style>
                    body { font-family: 'Arial Unicode MS', 'Segoe UI', serif; }
                    h1 { color: #0f172a; text-align: center; border-bottom: 2px solid #eab308; }
                    .news-item { margin-bottom: 40px; border-bottom: 1px solid #ccc; padding-bottom: 20px; }
                    .meta { color: #555; font-size: 10pt; margin-bottom: 10px; }
                    .description { font-size: 11pt; line-height: 1.5; }
                </style>
            </head>
            <body>
                <h1>SAMANYUDU TV - News Archive</h1>
                <p style="text-align:center">Generated on ${new Date().toLocaleString()}</p>
                <hr>
                ${processedRows.map(item => `
                    <div class="news-item">
                        <h2 style="color:#1e293b">${escapeHtml(item.title)}</h2>
                        <div class="meta">
                            <b>Date:</b> ${new Date(item.timestamp).toLocaleString()} | 
                            <b>Area:</b> ${escapeHtml(item.area)} | 
                            <b>Category:</b> ${escapeHtml(item.type)} | 
                            <b>Reporter:</b> ${escapeHtml(item.author)}
                        </div>
                        <div class="description">${formatDescription(item.description)}</div>
                        ${item.embedded_image ? `<br><img src="${item.embedded_image}" width="600" style="max-width:100%">` : ''}
                    </div>
                `).join('')}
            </body>
            </html>`;

            return res.send(`\uFEFF${wordHtml}`);
        }

        const launchOptions = {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
        };
        if (process.env.PUPPETEER_EXECUTABLE_PATH) {
            launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
        }

        let browser = null;
        try {
            browser = await puppeteer.launch(launchOptions);
            const page = await browser.newPage();
            await page.setContent(htmlContent, { waitUntil: 'domcontentloaded', timeout: 120000 });

            // Wait for image load with per-image timeout so backup can't hang forever.
            await page.evaluate(async () => {
                const images = Array.from(document.querySelectorAll('img'));
                await Promise.all(images.map((img) => {
                    if (img.complete) return Promise.resolve();
                    return new Promise((resolve) => {
                        const timeout = setTimeout(resolve, 8000);
                        img.addEventListener('load', () => {
                            clearTimeout(timeout);
                            resolve();
                        }, { once: true });
                        img.addEventListener('error', () => {
                            clearTimeout(timeout);
                            resolve();
                        }, { once: true });
                    });
                }));
            });

            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' }
            });

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="Samanyudu_TV_News_Archive_${Date.now()}.pdf"`);
            res.send(pdfBuffer);
        } catch (pdfError) {
            console.error('PDF archive failed, sending JSON fallback:', pdfError.message);
            downloadJsonBackup();
        } finally {
            if (browser) {
                await browser.close().catch(() => null);
            }
        }
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
        if (!title || !description || !finalArea) {
            return res.status(400).json({ error: 'title, description, and area/location are required' });
        }
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
        res.status(500).json({ error: 'Failed to create news', details: error.message });
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

        const localPublicUrl = `${protocol}://${host}/api/uploads/${fileName}`;
        let publicUrl = localPublicUrl;
        if (useLocal) {
            // Try R2 upload as a backup (non-blocking in local mode)
            const uploadParams = {
                Bucket: process.env.R2_BUCKET_NAME,
                Key: fileName,
                Body: req.file.buffer,
                ContentType: req.file.mimetype,
            };
            const s3 = getS3Client();
            if (!s3) {
                console.warn('[R2] Backup upload skipped because configuration is incomplete');
            } else {
                s3.send(new PutObjectCommand(uploadParams))
                    .then(() => console.log(`[R2] Backup upload successful: ${fileName}`))
                    .catch(err => console.error(`[R2] Backup upload failed (ignoring in local mode):`, err.message));
            }
        } else {
            const canUseR2 = hasR2Config();

            if (canUseR2) {
                const s3 = getS3Client();
                const uploadParams = {
                    Bucket: process.env.R2_BUCKET_NAME,
                    Key: fileName,
                    Body: req.file.buffer,
                    ContentType: req.file.mimetype,
                };

                try {
                    await s3.send(new PutObjectCommand(uploadParams));
                    if (process.env.R2_PUBLIC_DOMAIN) {
                        publicUrl = `https://${process.env.R2_PUBLIC_DOMAIN}/${fileName}`;
                    }
                } catch (r2Error) {
                    console.error('[R2] Upload failed, falling back to local file serving:', r2Error.message);
                    publicUrl = localPublicUrl;
                }
            } else {
                console.warn('[R2] Missing configuration, falling back to local file serving');
                publicUrl = localPublicUrl;
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
            await db.query('DELETE FROM saved_items WHERE user_id = $1 AND item_id = $2 AND item_type = $3', [id, item_id, item_type || 'news']);
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

app.post('/api/auth/send-email-otp', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required' });

        // Check for existing user before sending OTP
        const { rows: userCheck } = await db.query('SELECT 1 FROM users WHERE email = $1', [email]);
        if (userCheck.length > 0) {
            return res.status(400).json({ error: 'ఇమెయిల్ ఇప్పటికే నమోదు చేయబడింది. దయచేసి లాగిన్ చేయండి.' }); // Translated: Email already registered. Please login.
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        emailOtpStore.set(email, { otp, expires: Date.now() + 10 * 60 * 1000 });

        if (resend) {
            try {
                await resend.emails.send({
                    from: 'Samanyudu TV <noreply@samanyudutv.in>',
                    to: email,
                    subject: 'Your Signup Verification Code',
                    html: `<h3>Your Verification Code is: <b>${otp}</b></h3><p>This code will expire in 10 minutes.</p>`
                });
                return res.json({ success: true, message: 'OTP sent to email' });
            } catch (err) {
                console.error('Resend email failed:', err.message);
            }
        }

        if (transporter) {
            try {
                await transporter.sendMail({
                    from: process.env.SMTP_USER,
                    to: email,
                    subject: 'Your Signup Verification Code',
                    html: `<h3>Your Verification Code is: <b>${otp}</b></h3><p>This code will expire in 10 minutes.</p>`
                });
                return res.json({ success: true, message: 'OTP sent to email via SMTP' });
            } catch (err) {
                console.error('SMTP email failed:', err.message);
                throw err;
            }
        }

        return res.status(400).json({ error: 'Email service not configured' });
    } catch (err) {
        console.error('Error sending email OTP:', err);
        res.status(500).json({ error: 'Failed to send verification email' });
    }
});

app.post('/api/auth/register-email', async (req, res) => {
    try {
        const { firstName, lastName, email, otp, password } = req.body;
        if (!firstName || !lastName || !email || !otp || !password) return res.status(400).json({ error: 'All fields are required' });

        const storedData = emailOtpStore.get(email);
        if (!storedData || storedData.expires < Date.now()) {
            return res.status(400).json({ error: 'Invalid or expired OTP' });
        }

        if (storedData.otp !== String(otp).trim()) {
            return res.status(400).json({ error: 'Invalid OTP' });
        }

        const { rows: existing } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        if (existing.length > 0) return res.status(400).json({ error: 'Email already registered' });

        const passTrimmed = String(password).trim();
        const fullName = `${firstName} ${lastName}`.trim();
        const query = 'INSERT INTO users (first_name, last_name, email, password, name) VALUES ($1, $2, $3, $4, $5) RETURNING *';
        const result = await db.query(query, [firstName, lastName, email, passTrimmed, fullName]);

        emailOtpStore.delete(email);
        res.json({ success: true, user: { id: result.rows[0].id, email: result.rows[0].email, name: result.rows[0].name } });
    } catch (err) {
        console.error("Error registering via email:", err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Start server
app.listen(port, () => {
    console.log(`🚀 API Backend running on http://localhost:${port}`);
});


// Auto-initialize settings table
(async () => {
    try {
        const db = require('./db');
        await db.query('CREATE TABLE IF NOT EXISTS app_settings (key VARCHAR PRIMARY KEY, value JSONB)');
        await db.query("INSERT INTO app_settings (key, value) VALUES ('maintenance_mode', 'false') ON CONFLICT (key) DO NOTHING");
        console.log('✅ Settings table initialized');
    } catch (err) {
        console.error('❌ Failed to initialize settings table:', err.message);
    }
})();



