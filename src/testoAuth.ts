import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Retrieve Twitter API credentials from environment variables
const apiKey = process.env.TWITTER_CONSUMER_KEY!;
const apiSecretKey = process.env.TWITTER_CONSUMER_SECRET!;
const accessToken = process.env.TWITTER_ACCESS_TOKEN!;
const accessTokenSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET!;

// Encode a string for OAuth parameter
function percentEncode(str: string): string {
    return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

// Create HMAC-SHA1 signature for OAuth
function hmacSha1(text: string, key: string): string {
    return crypto.createHmac('sha1', key).update(text).digest('base64');
}

// Generate a random nonce for OAuth
function generateNonce(): string {
    return crypto.randomBytes(32).toString('hex');
}

// Generate a timestamp for OAuth
function generateTimestamp(): string {
    return Math.floor(Date.now() / 1000).toString();
}

// Create OAuth header for request authentication
function createOAuthHeader(
    method: string,
    url: string,
    params: { [key: string]: string },
    consumerKey: string,
    consumerSecret: string,
    accessToken?: string,
    accessTokenSecret?: string
): string {
    // Base OAuth parameters
    const oauthParams: { [key: string]: string } = {
        oauth_consumer_key: consumerKey,
        oauth_nonce: generateNonce(),
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: generateTimestamp(),
        oauth_version: '1.0'
    };

    // Add access token if provided
    if (accessToken) {
        oauthParams.oauth_token = accessToken;
    }

    // Combine and encode all parameters
    const combinedParams = { ...params, ...oauthParams };
    const paramString = Object.keys(combinedParams)
        .sort()
        .map(key => `${percentEncode(key)}=${percentEncode(combinedParams[key])}`)
        .join('&');

    // Create base string and signing key for OAuth signature
    const baseString = `${method.toUpperCase()}&${percentEncode(url)}&${percentEncode(paramString)}`;
    const signingKey = `${percentEncode(consumerSecret)}&${accessTokenSecret ? percentEncode(accessTokenSecret) : ''}`;
    const signature = hmacSha1(baseString, signingKey);

    // Add signature to OAuth parameters
    oauthParams.oauth_signature = signature;

    // Construct OAuth header string
    const oauthHeader = 'OAuth ' + Object.keys(oauthParams)
        .sort()
        .map(key => `${percentEncode(key)}="${percentEncode(oauthParams[key])}"`)
        .join(', ');

    return oauthHeader;
}

// Upload media to Twitter and get media ID
function uploadMedia(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const fileContent = fs.readFileSync(filePath);
        const method = 'POST';
        const url = 'https://upload.twitter.com/1.1/media/upload.json';

        const oauthHeader = createOAuthHeader(method, url, {}, apiKey, apiSecretKey, accessToken, accessTokenSecret);

        const boundary = crypto.randomBytes(16).toString('hex');
        const contentType = `multipart/form-data; boundary=${boundary}`;

        // Prepare multipart form-data payload
        const postData = `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="media"; filename="${path.basename(filePath)}"\r\n` +
            `Content-Type: application/octet-stream\r\n\r\n`;

        const endData = `\r\n--${boundary}--\r\n`;
        const contentLength = Buffer.byteLength(postData, 'utf8') + fileContent.length + Buffer.byteLength(endData, 'utf8');

        // Request options for media upload
        const requestOptions: https.RequestOptions = {
            method,
            host: 'upload.twitter.com',
            path: '/1.1/media/upload.json',
            headers: {
                'Authorization': oauthHeader,
                'Content-Type': contentType,
                'Content-Length': contentLength.toString()
            }
        };

        // Make HTTPS request to upload media
        const req = https.request(requestOptions, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (response.media_id_string) {
                        resolve(response.media_id_string); // Return media ID
                    } else {
                        reject(new Error('Media upload failed: No media ID returned'));
                    }
                } catch (error) {
                    reject(new Error('Failed to parse upload response'));
                }
            });
        });

        req.on('error', (e) => {
            reject(new Error(`Request error: ${e.message}`));
        });

        req.write(postData);
        req.write(fileContent);
        req.write(endData);
        req.end();
    });
}

// Post a tweet with media ID
function createTweet(text: string, mediaIds: string[]) {
    return new Promise((resolve, reject) => {
        const method = 'POST';
        const url = 'https://api.twitter.com/2/tweets';
        
        const payload = JSON.stringify({
            text: text,
            media: {
                media_ids: mediaIds
            }
        });

        const oauthHeader = createOAuthHeader(method, url, {}, apiKey, apiSecretKey, accessToken, accessTokenSecret);

        // Request options for tweet creation
        const requestOptions: https.RequestOptions = {
            method,
            host: 'api.twitter.com',
            path: '/2/tweets',
            headers: {
                'Authorization': oauthHeader,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        // Make HTTPS request to post tweet
        const req = https.request(requestOptions, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                console.log('Full response:', data); // Log the full response
                try {
                    const response = JSON.parse(data);
                    console.log('Parsed response:', response); 
                    resolve(response); // Return tweet response
                } catch (error) {
                    reject(new Error('Failed to parse tweet response'));
                }
            });
        });

        req.on('error', (e) => {
            reject(new Error(`Tweet request error: ${e.message}`));
        });

        req.write(payload);
        req.end();
    });
}

// Upload media and create a tweet
async function uploadAndTweet(filePath: string, tweetText: string) {
    try {
        const mediaId = await uploadMedia(filePath);
        console.log('Media uploaded, ID:', mediaId);
        
        const tweetResponse = await createTweet(tweetText, [mediaId]);
        console.log('Tweet posted:', tweetResponse);
    } catch (error) {
        console.error('Error:', error);
    }
}

// Example usage
const filePath = './src/test.jpg'; // Path to the media file
const tweetText = "Hello, this is a tweet with media!";
uploadAndTweet(filePath, tweetText);