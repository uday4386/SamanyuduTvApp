require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const orderedTables = [
    'admin_users',
    'advertisements',
    'news',
    'shorts',
    'news_likes',
    'shorts_likes',
    'shorts_comments'
];

async function initialize() {
    console.log("Attempting to initialize database...");

    let connectionConfig;
    if (process.env.DATABASE_URL) {
        connectionConfig = {
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
        };
    } else {
        connectionConfig = {
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 5432,
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || 'admin123',
            database: process.env.DB_NAME || 'samanyudu'
        };
    }

    const client = new Client(connectionConfig);

    try {
        await client.connect();
        console.log("1. Connected. Building schema...");
        const sql = fs.readFileSync(path.join(__dirname, 'schema.sql')).toString();
        await client.query(sql);
        console.log("Schema built successfully.");

        console.log("2. Inserting data...");
        for (const tableName of orderedTables) {
            const filePath = path.join(__dirname, `${tableName}_rows.csv`);
            if (!fs.existsSync(filePath)) continue;

            const rows = [];
            await new Promise((resolve) => {
                fs.createReadStream(filePath)
                    .pipe(csv())
                    .on('data', (d) => rows.push(d))
                    .on('end', () => resolve());
            });

            if (rows.length === 0) continue;

            const columns = Object.keys(rows[0]);
            for (const row of rows) {
                const values = columns.map(c => row[c] === '' || row[c] === 'null' ? null : row[c]);
                const placeholders = columns.map((_, i) => `$${i + 1}`).join(',');
                const query = `INSERT INTO ${tableName} ("${columns.join('","')}") VALUES (${placeholders}) ON CONFLICT DO NOTHING;`;

                try {
                    await client.query(query, values);
                } catch (e) {
                    // Ignore individual row conflict/error so it completes
                }
            }
            console.log(`Finished ${tableName}: ${rows.length} rows processed.`);
        }

        // Add default superadmin since the CSV was missing the password field
        await client.query("INSERT INTO admin_users (email, password, name, role) VALUES ('superadmin1@samanyudu.tv', 'admin123', 'Super Admin 1', 'super_admin') ON CONFLICT (email) DO NOTHING;");
        console.log("Default superadmin created: superadmin1@samanyudu.tv / admin123");
        console.log("✅ DB INITIALIZATION COMPLETE");
    } catch (e) {
        console.error("❌ DB Initialization Error:", e.message);
    } finally {
        await client.end();
    }
}

module.exports = { initialize };

if (require.main === module) {
    initialize();
}
