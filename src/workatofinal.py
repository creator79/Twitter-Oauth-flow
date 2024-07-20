import base64
import hashlib
import hmac
import json
import os
import time
import urllib.parse
from urllib.parse import quote

import requests

def percent_encode(string):
    return quote(string, safe='~')

def generate_nonce():
    return base64.b64encode(os.urandom(32)).decode('ascii')

def generate_timestamp():
    return str(int(time.time()))

def create_signature(method, url, params, consumer_secret, token_secret=''):
    param_string = '&'.join([f"{percent_encode(k)}={percent_encode(str(v))}" for k, v in sorted(params.items())])
    base_string = f"{method.upper()}&{percent_encode(url)}&{percent_encode(param_string)}"
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

def upload_media(media_data, media_type, consumer_key, consumer_secret, access_token, access_token_secret):
    if media_type == 'video':
        return upload_video(media_data, consumer_key, consumer_secret, access_token, access_token_secret)
    elif media_type == 'image':
        return upload_image(media_data, consumer_key, consumer_secret, access_token, access_token_secret)
    else:
        raise ValueError('Unsupported media type')

def upload_image(media_data, consumer_key, consumer_secret, access_token, access_token_secret):
    url = 'https://upload.twitter.com/1.1/media/upload.json'
    method = 'POST'
    params = {'media_data': media_data}
    
    oauth_header = create_oauth_header(method, url, params, consumer_key, consumer_secret, access_token, access_token_secret)
    headers = {
        'Authorization': oauth_header,
        'Content-Type': 'application/x-www-form-urlencoded'
    }
    
    try:
        response = requests.post(url, data=urllib.parse.urlencode(params), headers=headers)
        response.raise_for_status()
        return response.json()['media_id_string']
    except requests.exceptions.RequestException as e:
        raise Exception(f"Media upload failed: {e.response.status_code} - {e.response.text}")

        #  video upload in chunks 
def upload_video(base64_data, consumer_key, consumer_secret, access_token, access_token_secret):
    media_data = base64.b64decode(base64_data)
    media_size = len(media_data)

    # INIT
    init_url = 'https://upload.twitter.com/1.1/media/upload.json'
    init_params = {
        'command': 'INIT',
        'media_type': 'video/mp4',
        'total_bytes': str(media_size),
        'media_category': 'tweet_video'
    }
    init_headers = {
        'Authorization': create_oauth_header('POST', init_url, init_params, consumer_key, consumer_secret, access_token, access_token_secret),
        'Content-Type': 'application/x-www-form-urlencoded'
    }
    init_response = requests.post(init_url, data=init_params, headers=init_headers)
    if init_response.status_code != 202:
        raise Exception(f"Video upload initialization failed: {init_response.status_code} - {init_response.text}")
    media_id = init_response.json()['media_id_string']

    # APPEND
    chunk_size = 5 * 1024 * 1024  # 5MB
    for i in range(0, len(media_data), chunk_size):
        chunk = media_data[i:i+chunk_size]
        append_url = 'https://upload.twitter.com/1.1/media/upload.json'
        append_params = {
            'command': 'APPEND',
            'media_id': media_id,
            'segment_index': str(i // chunk_size)
        }
        files = {
            'media': chunk
        }
        append_headers = {
            'Authorization': create_oauth_header('POST', append_url, append_params, consumer_key, consumer_secret, access_token, access_token_secret),
        }
        append_response = requests.post(append_url, params=append_params, files=files, headers=append_headers)
        if append_response.status_code != 204:
            raise Exception(f"Video chunk upload failed: {append_response.status_code} - {append_response.text}")

    # FINALIZE
    finalize_url = 'https://upload.twitter.com/1.1/media/upload.json'
    finalize_params = {
        'command': 'FINALIZE',
        'media_id': media_id
    }
    finalize_headers = {
        'Authorization': create_oauth_header('POST', finalize_url, finalize_params, consumer_key, consumer_secret, access_token, access_token_secret),
        'Content-Type': 'application/x-www-form-urlencoded'
    }
    finalize_response = requests.post(finalize_url, data=finalize_params, headers=finalize_headers)
    if finalize_response.status_code != 200:
        raise Exception(f"Video finalization failed: {finalize_response.status_code} - {finalize_response.text}")
    
    return media_id, finalize_response.json()

def check_media_status(media_id, consumer_key, consumer_secret, access_token, access_token_secret):
    status_url = 'https://upload.twitter.com/1.1/media/upload.json'
    status_params = {
        'command': 'STATUS',
        'media_id': media_id
    }
    status_headers = {
        'Authorization': create_oauth_header('GET', status_url, status_params, consumer_key, consumer_secret, access_token, access_token_secret)
    }
    
    while True:
        response = requests.get(status_url, params=status_params, headers=status_headers)
        if response.status_code != 200:
            raise Exception(f"Media status check failed: {response.status_code} - {response.text}")
        
        media_status = response.json()
        processing_info = media_status.get('processing_info', {})
        state = processing_info.get('state')
        
        if state == 'succeeded':
            return media_status
        elif state == 'failed':
            raise Exception(f"Media processing failed: {media_status}")
        else:
            time.sleep(processing_info.get('check_after_secs', 5))

def create_tweet(text, media_id, consumer_key, consumer_secret, access_token, access_token_secret):
    url = 'https://api.twitter.com/2/tweets'
    method = 'POST'
    payload = json.dumps({
        'text': text,
        'media': {'media_ids': [media_id]}
    })
    headers = {
        'Authorization': create_oauth_header(method, url, {}, consumer_key, consumer_secret, access_token, access_token_secret),
        'Content-Type': 'application/json'
    }
    response = requests.post(url, data=payload, headers=headers)
    if response.status_code == 201:
        return response.json()
    else:
        raise Exception(f"Tweet creation failed: {response.status_code} - {response.text}")

def main(input):
    try:
        if input['media_type'] == 'video':
            media_id, finalize_response = upload_video(
                input['media_base64'],
                input['api_key'],
                input['api_secret_key'],
                input['access_token'],
                input['access_token_secret']
            )
            print(f"Video uploaded, ID: {media_id}")
            
            # Check media status for video
            media_status = check_media_status(
                media_id,
                input['api_key'],
                input['api_secret_key'],
                input['access_token'],
                input['access_token_secret']
            )
        elif input['media_type'] == 'image':
            media_id = upload_image(
                input['media_base64'],
                input['api_key'],
                input['api_secret_key'],
                input['access_token'],
                input['access_token_secret']
            )
            print(f"Image uploaded, ID: {media_id}")
            media_status = None  # No need to check status for images
        else:
            raise ValueError(f"Unsupported media type: {input['media_type']}")

        tweet_response = create_tweet(
            input['tweet_text'],
            media_id,
            input['api_key'],
            input['api_secret_key'],
            input['access_token'],
            input['access_token_secret']
        )
        return {
            "success": True,
            "media_id": media_id,
            "tweet_id": tweet_response['data']['id'],
            "tweet_text": tweet_response['data']['text'],
            "media_status": media_status
        }
    except Exception as e:
        error_message = str(e)
        error_type = type(e).__name__
        print(f"Error occurred: {error_type} - {error_message}")
        return {
            "success": False,
            "error": f"{error_type}: {error_message}",
            "log": f"Full error details: {repr(e)}"
        }