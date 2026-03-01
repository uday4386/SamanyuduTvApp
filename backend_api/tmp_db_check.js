const db = require('./db.js');
db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users'").then((r) => {
    console.log(r.rows);
    process.exit(0);
}).catch(e => {
    console.error(e);
    process.exit(1);
});
