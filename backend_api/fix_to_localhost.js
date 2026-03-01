const db = require('./db');

async function fixToLocalhost() {
    try {
        const tables = ['shorts', 'news', 'advertisements'];
        const columns = {
            'shorts': ['video_url'],
            'news': ['image_url', 'video_url'],
            'advertisements': ['media_url']
        };

        let totalUpdated = 0;

        for (const table of tables) {
            const cols = columns[table];
            const query = `SELECT id, ${cols.map(c => `"${c}"`).join(', ')} FROM ${table}`;
            const { rows } = await db.query(query);

            for (const row of rows) {
                let updated = false;
                const updateQueryParts = [];
                const values = [];
                let vIndex = 1;

                for (const col of cols) {
                    let val = row[col];
                    // Match any IP-based URL pointing to port 5000/uploads
                    if (val && /^http:\/\/[0-9.]+:5000\/uploads/.test(val)) {
                        const newVal = val.replace(/^http:\/\/[0-9.]+:5000\/uploads/, 'http://localhost:5000/uploads');
                        if (newVal !== val) {
                            updateQueryParts.push(`"${col}" = $${vIndex}`);
                            values.push(newVal);
                            vIndex++;
                            updated = true;
                        }
                    }
                }

                if (updated) {
                    values.push(row.id);
                    await db.query(`UPDATE ${table} SET ${updateQueryParts.join(', ')} WHERE id = $${vIndex}`, values);
                    totalUpdated++;
                }
            }
        }

        console.log(`Updated ${totalUpdated} records to use localhost.`);
    } catch (err) {
        console.error("Error fixing URLs:", err);
    } finally {
        process.exit(0);
    }
}

fixToLocalhost();
