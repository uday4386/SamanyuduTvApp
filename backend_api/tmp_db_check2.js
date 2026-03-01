const db = require('./db.js');
db.query("DELETE FROM shorts_comments WHERE id = '257c497b-346f-43c5-bae5-50e8f130b0db' RETURNING short_id").then(res => { console.log(res.rows); process.exit(0); }).catch(e => { console.error('Error:', e); process.exit(1); });
