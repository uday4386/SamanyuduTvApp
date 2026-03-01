const db = require('./db.js');
Promise.all([
    db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'news_likes'"),
    db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'shorts_likes'")
]).then(([res1, res2]) => {
    console.log('news_likes:', res1.rows);
    console.log('shorts_likes:', res2.rows);
    process.exit(0);
});
