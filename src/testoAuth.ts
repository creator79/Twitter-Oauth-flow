import { createHmac, randomBytes } from 'crypto';
import * as qs from 'querystring';

export function createOAuthHeader(
  method: string,
  url: string,
  params: Record<string, string | number | boolean>,
  consumerKey: string,
  consumerSecret: string,
  accessToken: string,
  accessTokenSecret: string
): string {
  const oauthTimestamp = Math.floor(Date.now() / 1000).toString();
  const oauthNonce = randomBytes(16).toString('base64');

  const oauthParams: Record<string, string | number | boolean> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: oauthNonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: oauthTimestamp,
    oauth_token: accessToken,
    oauth_version: '1.0',
    ...params,
  };

  const baseString = `${method.toUpperCase()}&${encodeURIComponent(url)}&${encodeURIComponent(
    qs.stringify(oauthParams, '&', '=', { encodeURIComponent: encodeURIComponent })
  )}`;

  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(accessTokenSecret)}`;
  const oauthSignature = createHmac('sha1', signingKey).update(baseString).digest('base64');

  oauthParams.oauth_signature = oauthSignature;

  const oauthHeader = 'OAuth ' + Object.entries(oauthParams)
    .map(([key, value]) => `${key}="${encodeURIComponent(value.toString())}"`)
    .join(', ');

  return oauthHeader;
}
