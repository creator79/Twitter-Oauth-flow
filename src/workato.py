import os
import base64
import hmac
import hashlib
import time
import json
import requests
from urllib.parse import quote, urlencode

def percent_encode(string):
    return quote(string, safe='~')

def generate_nonce():
    return base64.b64encode(os.urandom(32)).decode('ascii')

def generate_timestamp():
    return str(int(time.time()))

def create_signature(method, url, params, consumer_secret, token_secret=''):
    param_string = '&'.join([f"{percent_encode(k)}={percent_encode(str(v))}" for k, v in sorted(params.items())])
    base_string = f"{method}&{percent_encode(url)}&{percent_encode(param_string)}"
    signing_key = f"{percent_encode(consumer_secret)}&{percent_encode(token_secret)}"
    return base64.b64encode(hmac.new(signing_key.encode(), base_string.encode(), hashlib.sha1).digest()).decode('ascii')

def create_oauth_header(method, url, params, consumer_key, consumer_secret, access_token, access_token_secret):
    oauth_params = {
        'oauth_consumer_key': consumer_key,
        'oauth_nonce': generate_nonce(),
        'oauth_signature_method': 'HMAC-SHA1',
        'oauth_timestamp': generate_timestamp(),
        'oauth_token': access_token,
        'oauth_version': '1.0'
    }
    
    all_params = {**params, **oauth_params}
    oauth_params['oauth_signature'] = create_signature(method, url, all_params, consumer_secret, access_token_secret)
    
    return 'OAuth ' + ', '.join([f'{percent_encode(k)}="{percent_encode(v)}"' for k, v in oauth_params.items()])

def test_twitter_connection(api_key, api_secret_key, access_token, access_token_secret):
    url = 'https://api.twitter.com/1.1/account/verify_credentials.json'
    method = 'GET'
    
    params = {'include_email': 'true'}  # You can modify these parameters as needed
    
    oauth_header = create_oauth_header(method, url, params, api_key, api_secret_key, access_token, access_token_secret)
    headers = {'Authorization': oauth_header}
    
    full_url = f"{url}?{urlencode(params)}"
    response = requests.get(full_url, headers=headers)
    
    if response.status_code == 200:
        return response.json()
    else:
        raise Exception(f"Connection test failed: {response.status_code} - {response.text}")

def main(input):
    api_key = input['api_key']
    api_secret_key = input['api_secret_key']
    access_token = input['access_token']
    access_token_secret = input['access_token_secret']
    
    try:
        user_info = test_twitter_connection(api_key, api_secret_key, access_token, access_token_secret)
        print(f"Connection successful. User info: {json.dumps(user_info, indent=2)}")
        
        return {
            "connection_status": "success",
            "user_id": user_info['id_str'],
            "screen_name": user_info['screen_name'],
            "name": user_info['name']
        }
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            "connection_status": "failed",
            "error": str(e)
        }

# The script ends here. Do not add any code below this line.