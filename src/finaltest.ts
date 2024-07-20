import axios from 'axios';
import qs from 'querystring';
import crypto from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config();

// Define the Input type
interface Input {
    api_key: string;
    api_secret_key: string;
    access_token: string;
    access_token_secret: string;
    media_type: 'image' | 'video';
    media_base64: string;
    tweet_text: string;
}

// Helper functions
const percentEncode = (str: string): string => {
    return encodeURIComponent(str).replace(/[!*'()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
};

const generateNonce = (): string => {
    return crypto.randomBytes(32).toString('base64');
};

const generateTimestamp = (): string => {
    return Math.floor(Date.now() / 1000).toString();
};

const createSignature = (
    method: string,
    url: string,
    params: Record<string, any>,
    consumerSecret: string,
    tokenSecret: string = ''
): string => {
    const paramString = Object.keys(params)
        .sort()
        .map(key => `${percentEncode(key)}=${percentEncode(params[key])}`)
        .join('&');
    const baseString = `${method.toUpperCase()}&${percentEncode(url)}&${percentEncode(paramString)}`;
    const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
    return crypto
        .createHmac('sha1', signingKey)
        .update(baseString)
        .digest('base64');
};

const createOAuthHeader = (
    method: string,
    url: string,
    params: Record<string, any>,
    consumerKey: string,
    consumerSecret: string,
    accessToken: string,
    accessTokenSecret: string
): string => {
    const oauthParams: Record<string, string> = {
        oauth_consumer_key: consumerKey,
        oauth_nonce: generateNonce(),
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: generateTimestamp(),
        oauth_token: accessToken,
        oauth_version: '1.0'
    };

    const allParams = { ...params, ...oauthParams };
    oauthParams['oauth_signature'] = createSignature(method, url, allParams, consumerSecret, accessTokenSecret);

    return 'OAuth ' + Object.keys(oauthParams)
        .map(key => `${percentEncode(key)}="${percentEncode(oauthParams[key])}"`)
        .join(', ');
};

// Media upload functions
const uploadMedia = async (
    mediaData: string,
    mediaType: 'image' | 'video',
    consumerKey: string,
    consumerSecret: string,
    accessToken: string,
    accessTokenSecret: string
): Promise<string> => {
    if (mediaType === 'video') {
        return await uploadVideo(mediaData, consumerKey, consumerSecret, accessToken, accessTokenSecret);
    } else if (mediaType === 'image') {
        return await uploadImage(mediaData, consumerKey, consumerSecret, accessToken, accessTokenSecret);
    } else {
        throw new Error('Unsupported media type');
    }
};

const uploadImage = async (
    mediaData: string,
    consumerKey: string,
    consumerSecret: string,
    accessToken: string,
    accessTokenSecret: string
): Promise<string> => {
    const url = 'https://upload.twitter.com/1.1/media/upload.json';
    const method = 'POST';

    const params = {
        media_data: mediaData
    };

    const oauthHeader = createOAuthHeader(method, url, params, consumerKey, consumerSecret, accessToken, accessTokenSecret);
    const headers = { Authorization: oauthHeader };

    const response = await axios.post(url, qs.stringify(params), { headers });

    if (response.status === 200) {
        return response.data.media_id_string;
    } else {
        throw new Error(`Media upload failed: ${response.status} - ${response.data}`);
    }
};

const uploadVideo = async (
    base64Data: string,
    consumerKey: string,
    consumerSecret: string,
    accessToken: string,
    accessTokenSecret: string
): Promise<string> => {
    const mediaSize = Buffer.from(base64Data, 'base64').length;

    // Initialize media upload
    const initParams = {
        command: 'INIT',
        media_type: 'video/mp4',
        total_bytes: mediaSize,
        media_category: 'tweet_video'
    };

    const initUrl = 'https://upload.twitter.com/1.1/media/upload.json';
    const initHeaders = {
        Authorization: createOAuthHeader('POST', initUrl, initParams, consumerKey, consumerSecret, accessToken, accessTokenSecret),
        'Content-Type': 'application/x-www-form-urlencoded'
    };

    try {
        const initResponse = await axios.post(initUrl, qs.stringify(initParams), { headers: initHeaders });
        const mediaId = initResponse.data.media_id_string;

        // Upload chunks
        const chunkSize = 5 * 1024 * 1024; // 5MB
        const totalChunks = Math.ceil(base64Data.length / chunkSize);

        for (let i = 0; i < totalChunks; i++) {
            const chunk = base64Data.slice(i * chunkSize, (i + 1) * chunkSize);

            const appendParams = {
                command: 'APPEND',
                media_id: mediaId,
                segment_index: i.toString(),
                media_data: chunk
            };

            const appendUrl = 'https://upload.twitter.com/1.1/media/upload.json';
            const appendHeaders = {
                Authorization: createOAuthHeader('POST', appendUrl, appendParams, consumerKey, consumerSecret, accessToken, accessTokenSecret),
                'Content-Type': 'application/x-www-form-urlencoded'
            };

            await axios.post(appendUrl, qs.stringify(appendParams), { headers: appendHeaders });
        }

        // Finalize media upload
        const finalizeParams = {
            command: 'FINALIZE',
            media_id: mediaId
        };

        const finalizeUrl = 'https://upload.twitter.com/1.1/media/upload.json';
        const finalizeHeaders = {
            Authorization: createOAuthHeader('POST', finalizeUrl, finalizeParams, consumerKey, consumerSecret, accessToken, accessTokenSecret),
            'Content-Type': 'application/x-www-form-urlencoded'
        };

        await axios.post(finalizeUrl, qs.stringify(finalizeParams), { headers: finalizeHeaders });

        return mediaId;
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error('Error during video upload initialization:', error.response?.data || error.message);
        } else {
            console.error('Unknown error during video upload initialization:', error);
        }
        throw error;
    }
};

const checkMediaStatus = async (
    mediaId: string,
    consumerKey: string,
    consumerSecret: string,
    accessToken: string,
    accessTokenSecret: string
): Promise<void> => {
    const statusParams = { command: 'STATUS', media_id: mediaId };
    const statusUrl = 'https://upload.twitter.com/1.1/media/upload.json';
    const statusHeaders = {
        Authorization: createOAuthHeader('GET', statusUrl, statusParams, consumerKey, consumerSecret, accessToken, accessTokenSecret)
    };

    let mediaStatus: { state: string; check_after_secs?: number };
    do {
        const response = await axios.get(statusUrl, { headers: statusHeaders, params: statusParams });
        mediaStatus = response.data.processing_info;
        if (mediaStatus && mediaStatus.state === 'in_progress') {
            await new Promise(resolve => setTimeout(resolve, (mediaStatus.check_after_secs || 5) * 1000));
        }
    } while (mediaStatus && mediaStatus.state !== 'succeeded');
};

const createTweet = async (
    text: string,
    mediaId: string,
    consumerKey: string,
    consumerSecret: string,
    accessToken: string,
    accessTokenSecret: string
): Promise<any> => {
    const url = 'https://api.twitter.com/2/tweets';
    const method = 'POST';

    const payload = {
        text,
        media: { media_ids: [mediaId] }
    };

    const oauthHeader = createOAuthHeader(method, url, {}, consumerKey, consumerSecret, accessToken, accessTokenSecret);
    const headers = {
        Authorization: oauthHeader,
        'Content-Type': 'application/json'
    };

    const response = await axios.post(url, payload, { headers });

    if (response.status === 201) {
        return response.data;
    } else {
        throw new Error(`Tweet creation failed: ${response.status} - ${response.data}`);
    }
};

// Main function
const main = async (input: Input): Promise<void> => {
    const { api_key, api_secret_key, access_token, access_token_secret, media_type, media_base64, tweet_text } = input;

    try {
        const mediaId = await uploadMedia(media_base64, media_type, api_key, api_secret_key, access_token, access_token_secret);
        console.log(`Media uploaded, ID: ${mediaId}`);

        if (media_type === 'video') {
            await checkMediaStatus(mediaId, api_key, api_secret_key, access_token, access_token_secret);
        }

        const tweetResponse = await createTweet(tweet_text, mediaId, api_key, api_secret_key, access_token, access_token_secret);
        console.log('Tweet created:', tweetResponse);
    } catch (error) {
        console.error('Error:', error);
    }
};

// take a input parameter in python 
const input: Input = {
    api_key: process.env.TWITTER_CONSUMER_KEY!,
    api_secret_key: process.env.TWITTER_CONSUMER_SECRET!,
    access_token: process.env.TWITTER_ACCESS_TOKEN!,
    access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET!,
    media_type: 'video', // or 'video'
    media_base64: '', // Base64 encoded media data
    tweet_text: 'Your video 5 tweet text'
};

// Execute the main function
main(input);
