# GitaRide — Deployment Guide

## Architecture
- **Frontend**: Netlify (Vite/React)
- **Backend**: Render (Node/Express + Socket.io)
- **Database**: MongoDB Atlas

---

## Step 1 — Push to GitHub
```bash
git add .
git commit -m "fix: production deployment config"
git push origin main
```

---

## Step 2 — Deploy Backend on Render

1. Go to [render.com](https://render.com) → New → Web Service
2. Connect your GitHub repo
3. Fill in:

| Field | Value |
|---|---|
| Name | `gitaride-backend` |
| Runtime | `Node` |
| Build Command | `npm install && npm run build` |
| Start Command | `node dist/server.cjs` |

4. Add Environment Variables:

| Key | Value |
|---|---|
| `MONGODB_URI` | `mongodb+srv://bharath:bharath@cluster0.rv85kjy.mongodb.net/gitaride?appName=Cluster0` |
| `GEMINI_API_KEY` | *(your Gemini key, or leave blank)* |
| `FRONTEND_URL` | *(set after Netlify deploy, e.g. `https://gitaride.netlify.app`)* |
| `NODE_ENV` | `production` |

5. Deploy → copy the URL e.g. `https://gitaride-backend.onrender.com`

---

## Step 3 — Deploy Frontend on Netlify

1. Go to [netlify.com](https://netlify.com) → Add new site → Import from Git
2. Fill in:

| Field | Value |
|---|---|
| Build command | `npm run build:frontend` |
| Publish directory | `dist` |

3. Add Environment Variables:

| Key | Value |
|---|---|
| `VITE_API_URL` | `https://gitaride-backend.onrender.com` |
| `VITE_CLERK_PUBLISHABLE_KEY` | `pk_live_xxxx` *(your Clerk live key)* |

4. Deploy → copy your Netlify URL

---

## Step 4 — Link them together

Go back to **Render** → gitaride-backend → Environment:
- Set `FRONTEND_URL` = `https://your-app.netlify.app`
- Click "Save Changes" → Render will redeploy

---

## Step 5 — Clerk Production Setup

1. Go to [clerk.com](https://clerk.com) → Your App → Domains
2. Add your Netlify URL: `https://your-app.netlify.app`
3. Under API Keys → copy the **Production** publishable key (starts with `pk_live_`)
4. Update `VITE_CLERK_PUBLISHABLE_KEY` on Netlify with the live key

---

## Local Development

```bash
npm install
# Edit .env with your values
npm run dev
# Visit http://localhost:3000
```
