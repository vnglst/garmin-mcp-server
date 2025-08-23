# Garmin Connect Setup Guide

This guide will help you connect your MCP server to real Garmin Connect data.

## Prerequisites

1. **Garmin Connect Account**: You need an active Garmin Connect account
2. **Garmin Device**: A compatible Garmin device (watch, etc.) that syncs to Garmin Connect

## Setup Steps

### 1. Configure Your Credentials

1. Copy the environment example file:

   ```bash
   cp .env.example .env
   ```

2. Edit the `.env` file and add your Garmin Connect credentials:

   ```bash
   # Garmin Connect Credentials
   GARMIN_USERNAME=your-garmin-email@example.com
   GARMIN_PASSWORD=your-garmin-password

   # Cache settings
   CACHE_DURATION_MINUTES=15
   ```

   ⚠️ **Security Note**: Your credentials are stored locally and used only to authenticate with Garmin Connect. Never commit the `.env` file to version control.

### 2. Test the Connection

1. Build and start the server:

   ```bash
   npm run build
   npm start
   ```

2. Or test with the MCP Inspector:
   ```bash
   npx @modelcontextprotocol/inspector node dist/index.js
   ```

### 3. Verify Data Access

The server will attempt to authenticate with Garmin Connect when you first request data. You should see logs like:

```
Authenticating with Garmin Connect...
Successfully authenticated with Garmin Connect
Fetching 10 recent runs from Garmin Connect...
Found X running activities
```

## API Limitations & Considerations

### Rate Limiting

- Garmin Connect has rate limits to prevent abuse
- The server includes authentication caching (30-minute sessions)
- Consider setting `CACHE_DURATION_MINUTES` to reduce API calls

### Data Availability

- Only activities synced to Garmin Connect are available
- Make sure your Garmin device has synced recently
- The server filters for running activities specifically

### Authentication

- Uses username/password authentication (not OAuth)
- Session tokens are cached for 30 minutes
- Re-authentication happens automatically when sessions expire

## Troubleshooting

### Authentication Issues

**Problem**: "Unable to authenticate with Garmin Connect"
**Solutions**:

- Verify your username and password are correct
- Check if you can log in to https://connect.garmin.com manually
- Ensure you don't have 2FA enabled (not supported by this library)
- Try updating your password if it contains special characters

### No Data Returned

**Problem**: No running activities found
**Solutions**:

- Ensure your Garmin device has synced recently
- Check that you have running activities in Garmin Connect
- Verify the activity types are correctly detected (running, track_running, etc.)

### Connection Errors

**Problem**: Network timeouts or connection issues
**Solutions**:

- Check your internet connection
- Garmin Connect might be experiencing issues
- Try again after a few minutes

## Data Privacy

- Your credentials are stored locally in the `.env` file
- Authentication is done directly with Garmin Connect
- No data is stored or transmitted to third parties
- The MCP server runs locally on your machine

## Advanced Configuration

### Custom Activity Types

If you want to include other activity types besides running, you can modify the activity type filters in `src/garmin-service.ts`:

```typescript
// Current filters (running only)
activity.activityType?.typeKey === "running" ||
  activity.activityType?.typeKey === "track_running" ||
  activity.activityType?.typeKey === "treadmill_running" ||
  activity.activityType?.typeKey === "trail_running";

// Add other activities like cycling, swimming, etc.
```

### Caching

The authentication session is cached for 30 minutes by default. You can adjust this in the `GarminService` constructor:

```typescript
private readonly authTimeout = 30 * 60 * 1000; // 30 minutes in milliseconds
```

## Next Steps

Once your Garmin data is working:

1. **Add to Claude Desktop**: Use the configuration in `.vscode/mcp.json`
2. **Test with Claude**: Ask Claude about your running data
3. **Customize**: Add more tools or modify data formatting as needed

## Alternative APIs

For production applications, consider using official Garmin APIs:

- **Garmin Connect IQ API**: For app developers
- **Garmin Health API**: For health and fitness applications
- **Garmin Developer Program**: https://developer.garmin.com/

These require developer registration but provide more stable, supported access to Garmin data.
