const db = require('./db');

async function checkEmpty() {
    try {
        const { rows } = await db.query('SELECT count(*) FROM news WHERE image_url = \'\' OR image_url IS NULL');
        console.log(`News with no image: ${rows[0].count}`);

        const { rows: rows2 } = await db.query('SELECT title, image_url FROM news LIMIT 5');
        console.log("Sample news:", rows2);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

checkEmpty();
