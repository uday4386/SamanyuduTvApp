require('dotenv').config();
const { Client } = require('pg');

async function migrate() {
    console.log("Connecting to local 'samanyudu' to add saved_items table...");

    const client = new Client({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD,
        database: 'samanyudu',
    });

    try {
        await client.connect();
        const sql = `
            CREATE TABLE IF NOT EXISTS saved_items (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id VARCHAR NOT NULL,
                item_id UUID NOT NULL,
                item_type VARCHAR NOT NULL DEFAULT 'news',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, item_id)
            );
        `;
        await client.query(sql);
        console.log("✅ Added saved_items table!");
    } catch (error) {
        console.error("❌ Error migrating:", error.message);
    } finally {
        await client.end();
    }
}

migrate();
