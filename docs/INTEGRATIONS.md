# MyWorkDay Platform Integrations

This document covers the global (platform-wide) integrations available to Super Administrators.

## Overview

MyWorkDay supports two levels of integrations:

1. **Global Integrations** - Platform-wide settings configured by Super Administrators in System Settings. These apply across all tenants unless overridden.
2. **Tenant Integrations** - Per-tenant settings configured by Tenant Administrators in their Tenant Settings.

This document focuses on **Global Integrations**.

---

## Accessing Global Integrations

1. Log in as a Super Administrator
2. Navigate to **Super Mode** → **Settings** → **Integrations** tab
3. Configure Mailgun (Email) and/or S3 (Storage) settings

---

## Mailgun (Email) Integration

### Configuration Fields

| Field | Required | Description |
|-------|----------|-------------|
| Domain | Yes | Your Mailgun sending domain (e.g., `mg.yourdomain.com`) |
| From Email | Yes | Default sender email address |
| Region | Yes | `US` (US servers) or `EU` (EU servers for GDPR compliance) |
| API Key | Yes | Your Mailgun API key (starts with `key-`) |
| Signing Key | No | Webhook signing key for verifying Mailgun webhooks |

### Setting Up Mailgun

1. Create a Mailgun account at [mailgun.com](https://www.mailgun.com)
2. Add and verify your sending domain
3. Copy your API key from **Settings** → **API Security**
4. Enter the configuration in MyWorkDay's Integrations tab
5. Click **Test Connection** to validate the domain
6. Use **Send Test Email** to verify email delivery

### Test Connection Behavior

- **Test Connection**: Validates the domain exists and the API key is correct by querying Mailgun's domain API
- **Send Test Email**: Sends an actual email to the specified address using your configuration

---

## S3 (Storage) Integration

### Configuration Fields

| Field | Required | Description |
|-------|----------|-------------|
| Region | Yes | AWS region code (e.g., `us-east-1`, `eu-west-1`) |
| Bucket Name | Yes | S3 bucket name |
| Public Base URL | No | Base URL for publicly accessible files |
| CloudFront URL | No | CloudFront distribution URL for CDN delivery |
| Access Key ID | Yes | AWS IAM access key ID |
| Secret Access Key | Yes | AWS IAM secret access key |

### Setting Up S3

1. Create an S3 bucket in AWS Console
2. Create an IAM user with S3 permissions for the bucket
3. Generate access keys for the IAM user
4. Enter the configuration in MyWorkDay's Integrations tab
5. Click **Test Connection** to validate bucket access

### IAM Policy Example

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::your-bucket-name",
        "arn:aws:s3:::your-bucket-name/*"
      ]
    }
  ]
}
```

---

## Secret Management

### Secret Masking Rules

All sensitive values (API keys, access keys, secrets) are **write-only** and follow these rules:

1. **Never Exposed**: Actual secret values are never returned in API responses
2. **Masked Display**: Configured secrets show as `••••XXXX` (last 4 characters visible)
3. **Not Configured**: Unconfigured secrets show as `Not configured`

### Modifying Secrets

To **replace** a secret:
1. Click the secret field to expand it
2. Enter the new value in the input field
3. Click **Save Changes**

To **clear** a secret:
1. Click the **Clear** button next to the masked secret
2. The secret will be removed immediately
3. Save changes if other fields were modified

### Encryption

All secrets are encrypted at rest using AES-256-GCM encryption:

- Encryption key: `APP_ENCRYPTION_KEY` environment variable
- Algorithm: AES-256-GCM (authenticated encryption)
- Unique IV per encrypted value
- Auth tag stored with ciphertext

---

## API Endpoints (Super Admin Only)

All endpoints require Super Administrator authentication.

### Mailgun

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/super/integrations/mailgun` | Get Mailgun settings (secrets masked) |
| PUT | `/api/v1/super/integrations/mailgun` | Update Mailgun settings |
| DELETE | `/api/v1/super/integrations/mailgun/secret/:key` | Clear specific secret |
| POST | `/api/v1/super/integrations/mailgun/test` | Test domain validation |
| POST | `/api/v1/super/integrations/mailgun/send-test-email` | Send test email |

### S3

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/super/integrations/s3` | Get S3 settings (secrets masked) |
| PUT | `/api/v1/super/integrations/s3` | Update S3 settings |
| DELETE | `/api/v1/super/integrations/s3/secret/:key` | Clear specific secret |
| POST | `/api/v1/super/integrations/s3/test` | Test bucket access |

### Status

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/super/integrations/status` | Get overall integration status |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `APP_ENCRYPTION_KEY` | Yes | Base64-encoded 32-byte key for AES-256 encryption |
| `MAILGUN_DEBUG` | No | Set to `true` for debug logging of Mailgun operations |

### Generating Encryption Key

Generate a 32-byte (256-bit) key and encode it as base64:

```bash
openssl rand -base64 32
```

This produces a 44-character base64 string that should be set as `APP_ENCRYPTION_KEY`.

---

## Troubleshooting

### "Encryption key not configured"

The `APP_ENCRYPTION_KEY` environment variable is missing or invalid. Generate a new key with `openssl rand -hex 32` and add it to your environment.

### "Mailgun domain not found"

- Verify the domain is correctly added in Mailgun dashboard
- Ensure DNS records are properly configured
- Check that you're using the correct region (US vs EU)

### "S3 bucket access denied"

- Verify IAM user has correct permissions
- Check bucket policy allows the IAM user
- Ensure region matches the bucket's actual region

### "Test email not received"

- Check spam/junk folder
- Verify the from email domain is verified in Mailgun
- Ensure no sending limits are in place
