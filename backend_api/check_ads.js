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
        const res = await pool.query("SELECT id, media_url FROM advertisements");
        console.log(`Checking ${res.rows.length} ads...`);
        for (const row of res.rows) {
            console.log(`ID: ${row.id} | URL: ${row.media_url}`);
            if (row.media_url.includes('172.16.')) {
                console.log('-> STILL HAS OLD IP 172.16.x.x');
            }
        }
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

check();
