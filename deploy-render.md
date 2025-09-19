# 🚀 Deploy to Render (Free Tier)

## Step 1: Prepare Your Code
1. **Push to GitHub** (if not already done):
   ```bash
   git add .
   git commit -m "Ready for deployment"
   git push origin main
   ```

## Step 2: Deploy on Render
1. **Go to:** https://render.com
2. **Sign up/Login** with GitHub
3. **Click "New +"** → **"Web Service"**
4. **Connect your GitHub repository**
5. **Configure:**
   - **Name:** `gaserometa-backend`
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Node Version:** `18` (or latest)

## Step 3: Set Environment Variables
In Render dashboard, go to **Environment** tab:
- `NODE_ENV` = `production`
- `PORT` = `3000`

## Step 4: Deploy
Click **"Create Web Service"** and wait for deployment.

## Step 5: Get Your Backend URL
After deployment, you'll get a URL like:
`https://gaserometa-backend.onrender.com`

## Step 6: Update Frontend
Update your frontend to use the new backend URL:
```javascript
// In frontend/app.js, change:
const API_BASE = 'https://gaserometa-backend.onrender.com';
```

## Step 7: Deploy Frontend
Deploy frontend to Vercel/Netlify with the new backend URL.
