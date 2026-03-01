const db = require('./db');

async function checkShorts() {
    try {
        const { rows } = await db.query('SELECT count(*) FROM shorts WHERE video_url = \'\' OR video_url IS NULL');
        console.log(`Shorts with no video: ${rows[0].count}`);

        const { rows: rows2 } = await db.query('SELECT title, video_url FROM shorts LIMIT 5');
        console.log("Sample shorts:", JSON.stringify(rows2, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

checkShorts();
