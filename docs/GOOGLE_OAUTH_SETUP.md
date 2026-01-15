# Google OAuth Setup Guide

This document describes how to set up Google OAuth authentication for MyWorkDay.

## Overview

Google OAuth has been integrated as an additional authentication method alongside the existing email/password login. Users can sign in with their Google account, and the system will:

- Link Google accounts to existing users by matching verified email addresses
- Create new super admin accounts (first user only) via Google
- Respect existing invitation policies for new users

## Environment Variables

The following environment variables must be configured:

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_CLIENT_ID` | Yes | OAuth 2.0 Client ID from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Yes | OAuth 2.0 Client Secret |
| `GOOGLE_OAUTH_REDIRECT_URL` | No | Callback URL (defaults to `{APP_PUBLIC_URL}/api/v1/auth/google/callback`) |
| `APP_PUBLIC_URL` | No | Public URL of your application (e.g., `https://myworkday.example.com`) |

## Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to **APIs & Services** > **Credentials**
4. Click **Create Credentials** > **OAuth client ID**
5. Select **Web application**
6. Add authorized redirect URIs:
   - For development: `http://localhost:5000/api/v1/auth/google/callback`
   - For production: `https://your-domain.com/api/v1/auth/google/callback`
7. Copy the Client ID and Client Secret

## Railway Deployment Configuration

When deploying to Railway:

1. Set the environment variables in Railway dashboard:
   - `GOOGLE_CLIENT_ID`: Your OAuth client ID
   - `GOOGLE_CLIENT_SECRET`: Your OAuth client secret
   - `APP_PUBLIC_URL`: Your Railway app URL (e.g., `https://myapp.railway.app`)

2. Update the redirect URI in Google Cloud Console to match your Railway URL:
   - `https://myapp.railway.app/api/v1/auth/google/callback`

3. Ensure cookies are configured correctly:
   - The app already sets `trust proxy = 1` for Railway's reverse proxy
   - Cookies use `secure: true` in production and `sameSite: "lax"`

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/auth/google` | GET | Initiates Google OAuth flow (redirects to Google) |
| `/api/v1/auth/google/callback` | GET | Handles OAuth callback from Google |
| `/api/v1/auth/google/status` | GET | Returns `{ enabled: boolean }` |
| `/api/v1/auth/google/unlink` | POST | Unlinks Google from authenticated user's account |

## Account Linking Rules

1. **Existing user with same email**:
   - If Google email is verified AND user has no linked Google ID → auto-link and login
   - If user already linked to a different Google ID → block with error

2. **New user (no matching email)**:
   - If no users exist (bootstrap) → create as Super Admin
   - Otherwise → block with "No account found" message (invite required)

3. **Tenant context**:
   - Tenant IDs are never guessed from email domains
   - Existing tenant/role assignments are preserved during linking

## Security Considerations

- Google access tokens are NOT stored client-side
- Google refresh tokens are NOT stored (we only use the OAuth flow for authentication)
- Email verification is required for auto-linking to existing accounts
- Session cookies use `httpOnly`, `secure` (in production), and `sameSite: "lax"`

## Testing Checklist

Before deploying to production:

- [ ] Login via Google creates/links account correctly
- [ ] Cookie persists across page reloads
- [ ] Logout works (clears session)
- [ ] Switching between Google and password login works
- [ ] Error messages display correctly on failed auth
- [ ] First user bootstrap via Google creates Super Admin
- [ ] Existing user linking by email works
- [ ] Blocked attempts (no invite) show proper error

## Troubleshooting

### "Google authentication is not configured"
- Check that `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set
- Restart the application after setting environment variables

### "redirect_uri_mismatch" error
- Verify the callback URL in Google Cloud Console matches your app URL
- Check that `APP_PUBLIC_URL` is set correctly in production

### Cookies not persisting
- Ensure `trust proxy` is enabled (already configured)
- Check that the cookie domain matches your app domain
