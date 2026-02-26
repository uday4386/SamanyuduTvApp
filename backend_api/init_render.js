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
    console.log("Attempting to initialize database on Render...");
    if (!process.env.DATABASE_URL) {
        console.log("No DATABASE_URL found, skipping.");
        return;
    }

    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

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
        console.log("✅ DB INITIALIZATION COMPLETE");
    } catch (e) {
        console.error("❌ DB Initialization Error:", e.message);
    } finally {
        await client.end();
    }
}

module.exports = { initialize };
