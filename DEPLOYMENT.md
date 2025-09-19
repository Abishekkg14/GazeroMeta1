# 🚀 GaseroMeta Deployment Guide

## Quick Deploy (5 minutes)

### Option 1: Vercel (Easiest)
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy from project root
cd C:\Users\Abishek14\GazeroMeta1
vercel

# Follow prompts:
# - Framework: Other
# - Build Command: npm start
# - Output Directory: ./
```

### Option 2: Railway (Backend + Frontend)
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

## Production Deploy (Full Setup)

### Step 1: Deploy Backend
1. **Go to:** https://railway.app or https://render.com
2. **Connect GitHub** repository
3. **Set environment variables:**
   - `NODE_ENV=production`
   - `PORT=3000`
4. **Deploy** from `backend/` folder

### Step 2: Deploy Frontend
1. **Go to:** https://vercel.com or https://netlify.com
2. **Connect GitHub** repository
3. **Set build settings:**
   - Build Command: `echo 'No build required'`
   - Output Directory: `frontend/`
4. **Deploy**

### Step 3: Update Frontend URLs
Update the frontend to use your deployed backend URL:

```javascript
// In frontend/app.js, change:
const API_BASE = 'https://your-backend-url.railway.app';
// or
const API_BASE = 'https://your-backend-url.render.com';
```

## Environment Variables

### Backend (.env)
```
NODE_ENV=production
PORT=3000
RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
```

### Frontend
Update API endpoints to point to your deployed backend.

## Domain Setup

### Custom Domain
1. **Buy domain** from Namecheap, GoDaddy, etc.
2. **Add DNS records:**
   - A record: `@` → `your-vercel-url`
   - CNAME: `www` → `your-vercel-url`

## Security Checklist

- [ ] Update API keys
- [ ] Set production environment variables
- [ ] Enable HTTPS
- [ ] Configure CORS properly
- [ ] Add rate limiting
- [ ] Set up monitoring

## Monitoring

### Add Health Check
```javascript
// In backend/server.js
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
```

### Error Tracking
- **Sentry:** https://sentry.io
- **LogRocket:** https://logrocket.com

## Cost Estimation

### Free Tiers:
- **Vercel:** Free for personal projects
- **Railway:** $5/month after free tier
- **Render:** Free tier available

### Paid Tiers:
- **Vercel Pro:** $20/month
- **Railway Pro:** $20/month
- **Custom VPS:** $5-50/month

## Troubleshooting

### Common Issues:
1. **CORS errors:** Update CORS settings for production domain
2. **API not found:** Check backend URL in frontend
3. **Environment variables:** Ensure all are set in production
4. **Build failures:** Check Node.js version compatibility

### Debug Commands:
```bash
# Check deployment logs
vercel logs
railway logs

# Test locally with production settings
NODE_ENV=production npm start
```

## Next Steps

1. **Deploy to staging** first
2. **Test all functionality**
3. **Set up monitoring**
4. **Deploy to production**
5. **Configure custom domain**
6. **Set up CI/CD pipeline**

## Support

- **Vercel Docs:** https://vercel.com/docs
- **Railway Docs:** https://docs.railway.app
- **Render Docs:** https://render.com/docs
