const { Pool } = require('pg');
const pool = new Pool({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'admin123',
    database: 'samanyudu'
});

async function check() {
    try {
        const res = await pool.query("SELECT id, title, video_url FROM shorts");
        console.log(`Checking ${res.rows.length} shorts...`);
        for (const row of res.rows) {
            console.log(`ID: ${row.id} | Title: ${row.title}`);
            console.log(`URL: ${row.video_url}`);
            if (row.video_url.includes('172.16.')) {
                console.log('-> STILL HAS OLD IP 172.16.x.x');
            }
            if (row.video_url.includes('localhost')) {
                console.log('-> STILL HAS localhost');
            }
        }
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

check();
