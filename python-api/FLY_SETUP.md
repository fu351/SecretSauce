# Deploying Python API to Fly.io (Connected to Vercel)

This guide walks you through deploying the recipe scraper Python API to Fly.io and connecting it to your Vercel-hosted Next.js frontend.

## Overview

Your architecture:
- **Frontend**: Next.js on Vercel (already deployed or will be)
- **Backend**: Python FastAPI on Fly.io (this guide)

The frontend calls the Fly.io backend for recipe scraping, Instagram import, and AI text parsing.

---

## Step 1: Install Fly CLI

**Windows (PowerShell as Administrator):**
```powershell
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
```

**macOS/Linux:**
```bash
curl -L https://fly.io/install.sh | sh
```

After installation, restart your terminal and verify:
```bash
fly version
```

---

## Step 2: Create Fly.io Account & Login

1. Go to [fly.io](https://fly.io) and sign up (free tier available)
2. Login via CLI:
```bash
fly auth login
```
This opens a browser for authentication.

---

## Step 3: Navigate to Python API Directory

```bash
cd python-api
```

---

## Step 4: Create the Dockerfile

Fly.io needs a Dockerfile to build your app. Create `python-api/Dockerfile`:

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port (Fly.io uses 8080 by default)
EXPOSE 8080

# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
```

---

## Step 5: Create fly.toml Configuration

Create `python-api/fly.toml`:

```toml
app = "secretsauce-api"
primary_region = "ord"

[build]
  dockerfile = "Dockerfile"

[env]
  PORT = "8080"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0
  processes = ["app"]

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 512
```

**Note**: Change `app = "secretsauce-api"` to your preferred app name (must be globally unique on Fly.io).

---

## Step 6: Launch the App on Fly.io

```bash
fly launch --no-deploy
```

When prompted:
- **App name**: Enter your app name (e.g., `secretsauce-api`) or accept the generated one
- **Region**: Choose one close to your users (e.g., `ord` for Chicago, `iad` for Virginia)
- **Would you like to set up a PostgreSQL database?**: No
- **Would you like to set up an Upstash Redis database?**: No

This creates your app on Fly.io without deploying yet.

---

## Step 7: Set Environment Secrets

Your Python API needs the OpenAI API key for recipe parsing:

```bash
fly secrets set OPENAI_API_KEY=sk-your-actual-openai-api-key
```

**Get your OpenAI key** from: https://platform.openai.com/api-keys

---

## Step 8: Deploy to Fly.io

```bash
fly deploy
```

This will:
1. Build your Docker image
2. Push it to Fly.io's registry
3. Deploy it to your app

Wait for deployment to complete. You'll see output like:
```
Monitoring deployment...
 1 desired, 1 placed, 1 healthy, 0 unhealthy
--> v1 deployed successfully
```

---

## Step 9: Get Your Fly.io URL

After deployment, your app is available at:
```
https://your-app-name.fly.dev
```

Test it's working:
```bash
curl https://your-app-name.fly.dev/health
```

Should return: `{"status":"healthy"}`

---

## Step 10: Connect Vercel to Fly.io

Now connect your Vercel frontend to the Fly.io backend.

### In Vercel Dashboard:

1. Go to your project on [vercel.com](https://vercel.com)
2. Navigate to **Settings** → **Environment Variables**
3. Add these variables for **all environments** (Production, Preview, Development):

| Name | Value |
|------|-------|
| `PYTHON_SERVICE_URL` | `https://your-app-name.fly.dev/` |
| `NEXT_PUBLIC_PYTHON_SERVICE_URL` | `https://your-app-name.fly.dev/` |
| `OPENAI_API_KEY` | `sk-your-openai-api-key` |
| `SUPABASE_SERVICE_ROLE_KEY` | `your-supabase-service-role-key` |

**Important**: Include the trailing `/` in the Fly.io URLs.

### Get your Supabase Service Role Key:
1. Go to [supabase.com](https://supabase.com) → Your project
2. Settings → API
3. Copy the `service_role` key (not the `anon` key)

---

## Step 11: Redeploy Vercel

After adding environment variables, redeploy your Vercel app:

1. Go to **Deployments** tab in Vercel
2. Click the **...** menu on the latest deployment
3. Select **Redeploy**

Or push a commit to trigger automatic redeployment.

---

## Step 12: Test the Full Flow

1. Visit your Vercel app
2. Go to **Add Recipe** → **Import Recipe** tab
3. Try importing from a URL like:
   ```
   https://www.allrecipes.com/recipe/23600/worlds-best-lasagna/
   ```

If it works, you'll see the form populate with the recipe data!

---

## Managing Your Fly.io App

### View Logs
```bash
fly logs
```

### Check Status
```bash
fly status
```

### SSH into Container (debugging)
```bash
fly ssh console
```

### Scale Memory (if you get memory errors)
```bash
fly scale memory 1024
```

### Update After Code Changes
```bash
fly deploy
```

---

## Instagram Setup (Optional)

Instagram scraping requires an authenticated session to work reliably.

### Create Instagram Session

1. Install instaloader locally:
```bash
pip install instaloader
```

2. Login and save session:
```bash
instaloader --login YOUR_INSTAGRAM_USERNAME
```

3. Find the session file:
   - Windows: `C:\Users\YourName\.config\instaloader\session-USERNAME`
   - Mac/Linux: `~/.config/instaloader/session-USERNAME`

4. Copy to python-api directory:
```bash
cp ~/.config/instaloader/session-USERNAME python-api/instagram_session
```

5. Redeploy:
```bash
fly deploy
```

**Tips for Instagram:**
- Use a dedicated Instagram account (not your personal one)
- Disable 2FA on that account
- Sessions expire periodically - you'll need to refresh them

---

## Troubleshooting

### "Python service URL not configured"
- Make sure `PYTHON_SERVICE_URL` is set in Vercel environment variables
- Include the trailing `/` in the URL
- Redeploy Vercel after adding variables

### "Backend error" or timeouts
- Check Fly.io logs: `fly logs`
- Make sure `OPENAI_API_KEY` is set: `fly secrets list`
- Try scaling up memory: `fly scale memory 1024`

### Recipe scraping fails for a specific site
- The `recipe-scrapers` library supports 400+ sites but not all
- Check if the site is supported: https://github.com/hhursev/recipe-scrapers

### Instagram import fails
- Instagram blocks requests without authentication
- Set up the Instagram session (see section above)
- Rate limit: don't import too many posts quickly

### Deployment fails with build errors
- Check that `requirements.txt` has all dependencies
- Make sure Dockerfile syntax is correct
- Run `fly logs` to see detailed error messages

---

## Security: Restrict CORS to Your Domain

For production, update the CORS settings in `main.py` to only allow your Vercel domain:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://your-app.vercel.app",
        "https://your-custom-domain.com"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Then redeploy: `fly deploy`

---

## Cost

**Fly.io Free Tier includes:**
- 3 shared-cpu-1x VMs with 256MB RAM
- 160GB outbound data transfer per month

This is plenty for a recipe app. You'll only pay if you exceed these limits or scale up.

**Vercel Free Tier includes:**
- Unlimited static deployments
- 100GB bandwidth
- Serverless functions

---

## Quick Reference

| Command | Description |
|---------|-------------|
| `fly deploy` | Deploy latest code |
| `fly logs` | View real-time logs |
| `fly status` | Check app status |
| `fly secrets set KEY=value` | Set environment variable |
| `fly secrets list` | List all secrets |
| `fly scale memory 1024` | Increase memory to 1GB |
| `fly apps destroy app-name` | Delete the app |

---

## Summary Checklist

- [ ] Install Fly CLI
- [ ] Create Fly.io account and login
- [ ] Create Dockerfile in python-api/
- [ ] Create fly.toml in python-api/
- [ ] Run `fly launch --no-deploy`
- [ ] Set OpenAI secret: `fly secrets set OPENAI_API_KEY=...`
- [ ] Deploy: `fly deploy`
- [ ] Add environment variables in Vercel dashboard
- [ ] Redeploy Vercel
- [ ] Test import functionality

Your recipe intake system is now live! 🎉
