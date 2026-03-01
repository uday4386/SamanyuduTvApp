
require('dotenv').config();
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const S3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

async function testUpload() {
    try {
        console.log("Testing R2 Upload...");
        const params = {
            Bucket: process.env.R2_BUCKET_NAME,
            Key: 'test-file.txt',
            Body: 'Hello R2!',
            ContentType: 'text/plain',
        };
        await S3.send(new PutObjectCommand(params));
        console.log("Upload Success!");
    } catch (err) {
        console.error("Upload Failed:", err);
    }
}

testUpload();
