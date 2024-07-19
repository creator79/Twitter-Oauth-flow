import express from 'express';
import axios from 'axios';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = 3000;

// Twitter API credentials
const clientId = process.env.TWITTER_CLIENT_ID;
const clientSecret = process.env.TWITTER_CLIENT_SECRET;
const redirectUri = 'http://localhost:3000/callback';

// Generate a random state for CSRF protection
const state = crypto.randomBytes(16).toString('hex');

// Add a root route handler
app.get('/', (req, res) => {
  res.redirect('/login');
});

app.get('/login', (req, res) => {
  const authUrl = `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=tweet.read%20users.read&state=state&code_challenge=challenge&code_challenge_method=plain`;
  res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {
  const { code, state } = req.query;

  if (state !== "state") {
    return res.status(400).send('Invalid state parameter');
  }

  try {
    const tokenResponse = await axios.post('https://api.twitter.com/2/oauth2/token', null, {
      params: {
        code,
        grant_type: 'authorization_code',
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: 'challenge',
      },
      auth: {
        username: clientId!,
        password: clientSecret!,
      },
    });

    const { access_token } = tokenResponse.data;
    console.log("Bearer",access_token)

    // Use the access token to make API requests
    const userResponse = await axios.get('https://api.twitter.com/2/users/me', {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    res.json(userResponse.data);
  } catch (error) {
    console.error('Error during token exchange:', error);
    res.status(500).send('An error occurred during authentication');
  }
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});