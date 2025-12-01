import { OAuth2Client } from "google-auth-library";
import http from "node:http";
import open from "open";
import { URL } from "node:url";
import {
  saveGoogleTokens,
  getGoogleTokens,
  clearGoogleTokens,
  isGoogleTokenExpired,
  type TokenData,
} from "./token.js";

// Google OAuth2 configuration
// These are public client credentials for CLI applications
// Users can also set their own via environment variables
const DEFAULT_CLIENT_ID =
  process.env["GOOGLE_CLIENT_ID"] ??
  "764086051850-6qr4p6gpi6hn506pt8ejuq83di341hur.apps.googleusercontent.com";
const DEFAULT_CLIENT_SECRET =
  process.env["GOOGLE_CLIENT_SECRET"] ?? "";

const SCOPES = [
  "https://www.googleapis.com/auth/generative-language.retriever",
  "https://www.googleapis.com/auth/cloud-platform",
];

const REDIRECT_PORT = 9004;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/oauth2callback`;

let oauth2Client: OAuth2Client | undefined;

/**
 * Get or create the OAuth2 client.
 */
function getOAuth2Client(): OAuth2Client {
  if (!oauth2Client) {
    oauth2Client = new OAuth2Client(
      DEFAULT_CLIENT_ID,
      DEFAULT_CLIENT_SECRET,
      REDIRECT_URI
    );
  }
  return oauth2Client;
}

/**
 * Check if the user is logged in with Google OAuth.
 */
export function isLoggedIn(): boolean {
  const tokens = getGoogleTokens();
  return !!tokens?.accessToken;
}

/**
 * Get a valid access token, refreshing if necessary.
 */
export async function getAccessToken(): Promise<string | undefined> {
  const tokens = getGoogleTokens();
  if (!tokens?.accessToken) {
    return undefined;
  }

  // If token is not expired, return it
  if (!isGoogleTokenExpired()) {
    return tokens.accessToken;
  }

  // Try to refresh the token
  if (tokens.refreshToken) {
    try {
      const client = getOAuth2Client();
      client.setCredentials({ refresh_token: tokens.refreshToken });
      const { credentials } = await client.refreshAccessToken();
      
      if (credentials.access_token) {
        const newTokens: TokenData = {
          accessToken: credentials.access_token,
          refreshToken: credentials.refresh_token ?? tokens.refreshToken,
          expiresAt: credentials.expiry_date ?? undefined,
          tokenType: credentials.token_type ?? undefined,
          scope: credentials.scope ?? undefined,
        };
        saveGoogleTokens(newTokens);
        return newTokens.accessToken;
      }
    } catch {
      // Refresh failed, token is invalid
      clearGoogleTokens();
      return undefined;
    }
  }

  return undefined;
}

/**
 * Start the OAuth login flow.
 * Opens the browser for the user to authenticate.
 */
export async function login(): Promise<TokenData> {
  const client = getOAuth2Client();

  // Generate the authorization URL
  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });

  // Start a local server to handle the callback
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        if (!req.url?.startsWith("/oauth2callback")) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }

        const url = new URL(req.url, `http://localhost:${REDIRECT_PORT}`);
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        if (error) {
          res.writeHead(400);
          res.end(`Authentication failed: ${error}`);
          server.close();
          reject(new Error(`Authentication failed: ${error}`));
          return;
        }

        if (!code) {
          res.writeHead(400);
          res.end("No authorization code received");
          server.close();
          reject(new Error("No authorization code received"));
          return;
        }

        // Exchange the authorization code for tokens
        const { tokens: credentials } = await client.getToken(code);
        
        if (!credentials.access_token) {
          res.writeHead(500);
          res.end("Failed to get access token");
          server.close();
          reject(new Error("Failed to get access token"));
          return;
        }

        const tokenData: TokenData = {
          accessToken: credentials.access_token,
          refreshToken: credentials.refresh_token ?? undefined,
          expiresAt: credentials.expiry_date ?? undefined,
          tokenType: credentials.token_type ?? undefined,
          scope: credentials.scope ?? undefined,
        };

        // Save tokens
        saveGoogleTokens(tokenData);

        // Send success response
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>SMASK - Authentication Successful</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                color: #fff;
              }
              .container {
                text-align: center;
                padding: 40px;
                background: rgba(255,255,255,0.1);
                border-radius: 16px;
                backdrop-filter: blur(10px);
              }
              h1 { color: #4ade80; margin-bottom: 16px; }
              p { color: #94a3b8; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>✓ Authentication Successful</h1>
              <p>You can close this window and return to SMASK.</p>
            </div>
          </body>
          </html>
        `);

        server.close();
        resolve(tokenData);
      } catch (err) {
        res.writeHead(500);
        res.end("Internal server error");
        server.close();
        reject(err);
      }
    });

    server.listen(REDIRECT_PORT, () => {
      console.log(`\nOpening browser for Google authentication...`);
      console.log(`If the browser doesn't open, visit: ${authUrl}\n`);
      
      // Open the browser
      open(authUrl).catch(() => {
        console.log("Could not open browser automatically.");
        console.log(`Please visit: ${authUrl}`);
      });
    });

    server.on("error", (err) => {
      reject(new Error(`Failed to start local server: ${err.message}`));
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error("Authentication timed out. Please try again."));
    }, 5 * 60 * 1000);
  });
}

/**
 * Log out and clear stored tokens.
 */
export function logout(): void {
  clearGoogleTokens();
  oauth2Client = undefined;
}

/**
 * Ensure the user is authenticated.
 * If not logged in, prompts for login.
 */
export async function ensureAuthenticated(): Promise<string> {
  const token = await getAccessToken();
  if (token) {
    return token;
  }

  // Not authenticated, need to login
  const tokens = await login();
  return tokens.accessToken;
}




