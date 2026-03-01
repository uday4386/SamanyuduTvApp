const fetch = require('node-fetch');

async function test() {
    try {
        const res = await fetch('http://localhost:5000/api/news');
        const data = await res.json();
        console.log(JSON.stringify(data.slice(0, 2), null, 2));
    } catch (e) {
        console.error(e);
    }
}

test();
