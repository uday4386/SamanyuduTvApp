
const fetch = require('node-fetch');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');

async function testApiUpload() {
    const url = 'http://localhost:5000/api/upload';
    console.log(`Testing API Upload to ${url}...`);

    try {
        const form = new FormData();
        const testFile = path.join(__dirname, 'test-image.jpg');
        // Create a dummy test image if not exists
        if (!fs.existsSync(testFile)) {
            fs.writeFileSync(testFile, 'dummy image data');
        }

        form.append('file', fs.createReadStream(testFile));

        const response = await fetch(url, {
            method: 'POST',
            body: form,
            headers: form.getHeaders(),
        });

        const result = await response.json();
        console.log('Status Code:', response.status);
        if (response.ok) {
            console.log('Upload Success! URL:', result.url);
        } else {
            console.error('Upload Failed:', result);
        }
    } catch (err) {
        console.error('Network Error:', err.message);
    }
}

testApiUpload();
