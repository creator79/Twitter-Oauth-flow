// main.ts
import { percentEncode } from './utils';
import axios, { AxiosResponse } from 'axios';
import readline from 'readline';
import { createOAuthHeader } from './outh';
import dotenv from 'dotenv';
dotenv.config();


const CONSUMER_KEY = process.env.TWITTER_CONSUMER_KEY!;
const CONSUMER_SECRET = process.env.TWITTER_CONSUMER_SECRET!;
const CALLBACK_URL = 'oob';  // OAuth out of band     

interface RequestTokenResponse {
    oauth_token: string;
    oauth_token_secret: string;
}

interface AccessTokenResponse {
    oauth_token: string;
    oauth_token_secret: string;
    user_id: string;
    screen_name: string;
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function getRequestToken(): Promise<RequestTokenResponse> {
    try {
        const method = 'POST';
        const url = 'https://api.twitter.com/oauth/request_token';
        const params = { oauth_callback: CALLBACK_URL };

        const authHeader = createOAuthHeader(method, url, params, CONSUMER_KEY, CONSUMER_SECRET);

        const response: AxiosResponse = await axios.post(url, null, {
            headers: {
                Authorization: authHeader,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            params: {
                oauth_callback: percentEncode(CALLBACK_URL)
            }
        });

        const responseParams = new URLSearchParams(response.data);
        return {
            oauth_token: responseParams.get('oauth_token') || '',
            oauth_token_secret: responseParams.get('oauth_token_secret') || '',
        };
    } catch (error) {
        console.error('Error getting request token:', error);
        if (axios.isAxiosError(error) && error.response) {
            console.error('Error response data:', error.response.data);
            console.error('Error response status:', error.response.status);
            console.error('Error response headers:', error.response.headers);
        }
        throw error;
    }
}

function getAuthorizationUrl(oauthToken: string): string {
    return `https://api.twitter.com/oauth/authorize?oauth_token=${oauthToken}`;
}

function promptForPin(): Promise<string> {
    return new Promise((resolve) => {
        rl.question('Enter the PIN from the Twitter authorization page: ', (pin) => {
            resolve(pin);
        });
    });
}

async function getAccessToken(oauthToken: string, oauthTokenSecret: string, pin: string): Promise<AccessTokenResponse> {
    try {
        const method = 'POST';
        const url = 'https://api.twitter.com/oauth/access_token';
        const params = { oauth_verifier: pin };

        const authHeader = createOAuthHeader(method, url, params, CONSUMER_KEY, CONSUMER_SECRET, oauthToken, oauthTokenSecret);

        const response: AxiosResponse = await axios.post(url, null, {
            headers: {
                Authorization: authHeader,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            params: {
                oauth_verifier: pin
            }
        });

        const responseParams = new URLSearchParams(response.data);
        return {
            oauth_token: responseParams.get('oauth_token') || '',
            oauth_token_secret: responseParams.get('oauth_token_secret') || '',
            user_id: responseParams.get('user_id') || '',
            screen_name: responseParams.get('screen_name') || '',
        };
    } catch (error) {
        console.error('Error getting access token:', error);
        if (axios.isAxiosError(error) && error.response) {
            console.error('Error response data:', error.response.data);
            console.error('Error response status:', error.response.status);
            console.error('Error response headers:', error.response.headers);
        }
        throw error;
    }
}

async function main() {
    try {
        // Step 1: Get request token
        const requestToken = await getRequestToken();
        console.log('Request Token:', requestToken);

        // Step 2: Get authorization URL and prompt user to visit it
        const authUrl = getAuthorizationUrl(requestToken.oauth_token);
        console.log('Please visit this URL to authorize the application:');
        console.log(authUrl);

        // Step 3: Prompt for PIN
        const pin = await promptForPin();

        // Step 4: Get access token
        const accessToken = await getAccessToken(requestToken.oauth_token, requestToken.oauth_token_secret, pin);
        console.log('Access Token:', accessToken);

        console.log('Authorization complete!');
    } catch (error) {
        console.error('An error occurred during the authorization process:', error);
    } finally {
        rl.close();
    }
}

main();
