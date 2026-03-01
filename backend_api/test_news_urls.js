const fetch = require('node-fetch');

async function test() {
    try {
        const res = await fetch('http://localhost:5000/api/news');
        const data = await res.json();
        const urls = data.map(i => i.image_url).filter(u => u && u.length > 0);
        console.log("Found URLs:", urls.slice(0, 10));
    } catch (e) {
        console.error(e);
    }
}

test();
