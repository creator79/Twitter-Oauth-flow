// oauth.ts
import { hmacSha1, percentEncode, generateNonce, generateTimestamp } from './utils';

export function createOAuthHeader(
  method: string,
  url: string,
  params: { [key: string]: string },
  consumerKey: string,
  consumerSecret: string,
  accessToken?: string,
  accessTokenSecret?: string
): string {
  const oauthParams: { [key: string]: string } = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: generateNonce(),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: generateTimestamp(),
    oauth_version: '1.0'
  };

  if (accessToken) {
    oauthParams.oauth_token = accessToken;
  }

  const combinedParams = { ...params, ...oauthParams };

  const paramString = Object.keys(combinedParams)
    .sort()
    .map(key => `${percentEncode(key)}=${percentEncode(combinedParams[key])}`)
    .join('&');

  const baseString = `${method.toUpperCase()}&${percentEncode(url)}&${percentEncode(paramString)}`;

  const signingKey = `${percentEncode(consumerSecret)}&${accessTokenSecret ? percentEncode(accessTokenSecret) : ''}`;
  const signature = hmacSha1(baseString, signingKey);

  oauthParams.oauth_signature = signature;

  const oauthHeader = 'OAuth ' + Object.keys(oauthParams)
    .sort()
    .map(key => `${percentEncode(key)}="${percentEncode(oauthParams[key])}"`)
    .join(', ');

  return oauthHeader;
}