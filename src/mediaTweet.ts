  import axios from 'axios';
  import crypto from 'crypto';
  import qs from 'querystring';
  import * as dotenv from 'dotenv';

  dotenv.config();

  const percentEncode = (str: string): string => {
    return encodeURIComponent(str).replace(/[!*()']/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase());
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

  const uploadMedia = async (
    mediaData: string,
    apiKey: string,
    apiSecretKey: string,
    accessToken: string,
    accessTokenSecret: string
  ): Promise<string> => {
    const url = 'https://upload.twitter.com/1.1/media/upload.json';
    const method = 'POST';

    const params = {
      media_data: mediaData
    };

    const oauthHeader = createOAuthHeader(method, url, params, apiKey, apiSecretKey, accessToken, accessTokenSecret);
    const headers = { Authorization: oauthHeader };
    console.log("Header",headers )

    const response = await axios.post(url, qs.stringify(params), { headers });

    if (response.status === 200) {
      return response.data.media_id_string;
    } else {
      throw new Error(`Media upload failed: ${response.status} - ${response.data}`);
    }
  };

  const createTweet = async (
    text: string,
    mediaId: string,
    apiKey: string,
    apiSecretKey: string,
    accessToken: string,
    accessTokenSecret: string
  ): Promise<any> => {
    const url = 'https://api.twitter.com/2/tweets';
    const method = 'POST';

    const payload = {
      text,
      media: { media_ids: [mediaId] }
    };

    const oauthHeader = createOAuthHeader(method, url, {}, apiKey, apiSecretKey, accessToken, accessTokenSecret);
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

  interface Input {
    api_key: string;
    api_secret_key: string;
    access_token: string;
    access_token_secret: string;
    media_base64: string;
    tweet_text: string;
  }

  const main = async (input: Input): Promise<any> => {
    const { api_key, api_secret_key, access_token, access_token_secret, media_base64, tweet_text } = input;

    try {
      const mediaId = await uploadMedia(media_base64, api_key, api_secret_key, access_token, access_token_secret);
      console.log(`Media uploaded, ID: ${mediaId}`);

      const tweetResponse = await createTweet(tweet_text, mediaId, api_key, api_secret_key, access_token, access_token_secret);
      console.log(`Tweet posted: ${JSON.stringify(tweetResponse, null, 2)}`);

      return {
        status: 'success',
        media_id: mediaId,
        tweet_id: tweetResponse.data.id,
        tweet_text: tweetResponse.data.text
      };
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error: ${error.message}`);
        return {
          status: 'failed',
          error: error.message
        };
      } else {
        console.error('Unexpected error', error);
        return {
          status: 'failed',
          error: 'An unexpected error occurred'
        };
      }
    }
  };

  // Example usage
  const input: Input = {
    api_key: process.env.TWITTER_CONSUMER_KEY!,
    api_secret_key: process.env.TWITTER_CONSUMER_SECRET!,
    access_token: process.env.TWITTER_ACCESS_TOKEN!,
    access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET!,
    media_base64: '',
    tweet_text: 'Your tweet text'
  };

  main(input).then(result => console.log(result));
