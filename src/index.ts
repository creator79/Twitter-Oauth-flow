import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import { createOAuthHeader } from './outh2'; // Adjust the import path as necessary

dotenv.config(); // Load environment variables from .env file

// Retrieve Twitter API credentials from environment variables
const apiKey = process.env.TWITTER_CONSUMER_KEY!;
const apiSecretKey = process.env.TWITTER_CONSUMER_SECRET!;
const accessToken = process.env.TWITTER_ACCESS_TOKEN!;
const accessTokenSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET!;

function uploadMedia(filePath: string) {
  // Read file content synchronously
  const fileContent = fs.readFileSync(filePath);

  // HTTP method and API endpoint for media upload
  const method = 'POST';
  const url = 'https://upload.twitter.com/1.1/media/upload.json';

  // Generate OAuth 1.0a header for Twitter API authentication
  const oauthHeader = createOAuthHeader(method, url, {}, apiKey, apiSecretKey, accessToken, accessTokenSecret);

  // Generate a unique boundary for multipart form data
  const boundary = crypto.randomBytes(16).toString('hex');
  const contentType = `multipart/form-data; boundary=${boundary}`;

  // Construct the multipart form data body
  const postData = `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="media"; filename="${path.basename(filePath)}"\r\n` +
    `Content-Type: application/octet-stream\r\n\r\n`;

  // End of multipart form data
  const endData = `\r\n--${boundary}--\r\n`;

  // Calculate the total content length of the request body
  const contentLength = Buffer.byteLength(postData, 'utf8') + fileContent.length + Buffer.byteLength(endData, 'utf8');

  // Options for the HTTPS request
  const requestOptions: https.RequestOptions = {
    method,
    host: 'upload.twitter.com',
    path: '/1.1/media/upload.json',
    headers: {
      'Authorization': oauthHeader,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': contentLength.toString()
    }
  };

  // Create the HTTPS request
  const req = https.request(requestOptions, (res) => {
    let data = '';

    // Accumulate response data
    res.on('data', (chunk) => {
      data += chunk;
    });

    // Handle end of response
    res.on('end', () => {
      console.log('Response:', data);
    });
  });

  // Handle request errors
  req.on('error', (e) => {
    console.error('Request error:', e);
  });

  // Write the multipart form data and file content to the request body
  req.write(postData);
  req.write(fileContent);
  req.write(endData);

  // End the request
  req.end();
}

// Example usage: Upload a local file
const filePath = './src/test.jpg'; // Replace with your file path
uploadMedia(filePath);
