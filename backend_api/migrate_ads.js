const db = require('./db');

async function migrate() {
    try {
        console.log('Starting migration: adding display_interval to advertisements...');
        await db.query('ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS display_interval INT DEFAULT 4;');
        console.log('Migration successful: display_interval added to advertisements.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();
