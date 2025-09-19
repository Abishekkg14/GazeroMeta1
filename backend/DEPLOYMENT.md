# 🚀 Backend Deployment Guide

## Quick Deploy (5 minutes)

### Option 1: Railway (Recommended)
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
cd C:\Users\Abishek14\GazeroMeta1\backend
railway login
railway init
railway up

# Set environment variables
railway variables set NODE_ENV=production
railway variables set PORT=3000
```

### Option 2: Render (Free Tier)
1. Go to https://render.com
2. Connect GitHub repository
3. Create new Web Service:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Root Directory:** `backend`
4. Deploy

### Option 3: Vercel (Serverless)
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
cd C:\Users\Abishek14\GazeroMeta1\backend
vercel

# Follow prompts:
# - Framework: Other
# - Build Command: npm install
# - Output Directory: ./
```

## Production Deploy (Full Setup)

### Step 1: Prepare for Deployment
```bash
# Ensure all dependencies are installed
cd C:\Users\Abishek14\GazeroMeta1\backend
npm install

# Test locally
npm start
```

### Step 2: Choose Platform

#### Railway (Easiest)
1. **Install CLI:** `npm install -g @railway/cli`
2. **Login:** `railway login`
3. **Deploy:** `railway up`
4. **Set Variables:**
   - `NODE_ENV=production`
   - `PORT=3000`

#### Render (Free Tier)
1. **Go to:** https://render.com
2. **Connect GitHub**
3. **Create Web Service:**
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Root Directory: `backend`

#### Heroku (Classic)
1. **Install CLI:** `npm install -g heroku`
2. **Login:** `heroku login`
3. **Create App:** `heroku create your-app-name`
4. **Deploy:** `git push heroku main`

#### Vercel (Serverless)
1. **Install CLI:** `npm install -g vercel`
2. **Deploy:** `vercel`
3. **Configure:** Use `vercel.json` config

### Step 3: Environment Variables

Set these in your platform's dashboard:

```bash
NODE_ENV=production
PORT=3000
RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
```

### Step 4: Test Deployment

```bash
# Test your deployed backend
curl https://your-backend-url.railway.app/health
curl https://your-backend-url.railway.app/gas-price
```

## Platform Comparison

| Platform | Free Tier | Ease | Cost | Best For |
|----------|-----------|------|------|----------|
| Railway | ✅ | ⭐⭐⭐⭐⭐ | $5/month | Quick deploy |
| Render | ✅ | ⭐⭐⭐⭐ | $7/month | Full apps |
| Vercel | ✅ | ⭐⭐⭐⭐⭐ | $20/month | Serverless |
| Heroku | ❌ | ⭐⭐⭐ | $7/month | Classic apps |

## Troubleshooting

### Common Issues:

1. **Port binding error:**
   ```javascript
   // In server.js, use:
   const PORT = process.env.PORT || 3000;
   ```

2. **CORS errors:**
   ```javascript
   // Update CORS settings for production domain
   app.use(cors({
     origin: ['https://your-frontend-domain.com']
   }));
   ```

3. **Environment variables not set:**
   - Check platform dashboard
   - Restart deployment
   - Verify variable names

4. **Build failures:**
   - Check Node.js version compatibility
   - Verify all dependencies in package.json
   - Check build logs

### Debug Commands:

```bash
# Check deployment logs
railway logs
render logs
vercel logs

# Test locally with production settings
NODE_ENV=production npm start

# Check environment variables
railway variables
```

## Next Steps

1. **Deploy backend** to chosen platform
2. **Get backend URL** (e.g., `https://your-app.railway.app`)
3. **Update frontend** to use new backend URL
4. **Deploy frontend** to Vercel/Netlify
5. **Test complete flow**

## Support

- **Railway Docs:** https://docs.railway.app
- **Render Docs:** https://render.com/docs
- **Vercel Docs:** https://vercel.com/docs
- **Heroku Docs:** https://devcenter.heroku.com
