# Deployment Guide

This guide covers deploying the Property Management PWA to various platforms.

## Prerequisites

1. **Supabase Setup**
   - Run `supabase-schema.sql` in your Supabase SQL Editor
   - Create storage buckets: `tenant-photos` and `receipts` (set as public)
   - Note your Supabase URL and anon key

2. **Environment Variables**
   - Create a `.env` file (or set in your deployment platform):
     ```
     VITE_SUPABASE_URL=your-supabase-url
     VITE_SUPABASE_ANON_KEY=your-anon-key
     ```

## Deployment Options

### Option 1: Vercel (Recommended)

1. **Install Vercel CLI** (optional):
   ```bash
   npm i -g vercel
   ```

2. **Deploy via CLI**:
   ```bash
   vercel
   ```

3. **Deploy via GitHub**:
   - Push your code to GitHub
   - Go to [vercel.com](https://vercel.com)
   - Import your repository
   - Add environment variables in project settings
   - Deploy!

4. **Configuration**:
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`

### Option 2: Netlify

1. **Install Netlify CLI** (optional):
   ```bash
   npm i -g netlify-cli
   ```

2. **Deploy via CLI**:
   ```bash
   netlify deploy --prod
   ```

3. **Deploy via GitHub**:
   - Push your code to GitHub
   - Go to [netlify.com](https://netlify.com)
   - Import your repository
   - Build settings are auto-detected from `netlify.toml`
   - Add environment variables in site settings
   - Deploy!

### Option 3: GitHub Pages

1. **Install gh-pages**:
   ```bash
   npm install --save-dev gh-pages
   ```

2. **Add to package.json**:
   ```json
   "scripts": {
     "predeploy": "npm run build",
     "deploy": "gh-pages -d dist"
   }
   ```

3. **Deploy**:
   ```bash
   npm run deploy
   ```

### Option 4: Traditional Hosting (Apache/Nginx)

1. **Build the project**:
   ```bash
   npm run build
   ```

2. **Upload `dist` folder** to your web server

3. **Configure server** for SPA routing:
   - **Apache** (.htaccess):
     ```apache
     <IfModule mod_rewrite.c>
       RewriteEngine On
       RewriteBase /
       RewriteRule ^index\.html$ - [L]
       RewriteCond %{REQUEST_FILENAME} !-f
       RewriteCond %{REQUEST_FILENAME} !-d
       RewriteRule . /index.html [L]
     </IfModule>
     ```
   
   - **Nginx**:
     ```nginx
     location / {
       try_files $uri $uri/ /index.html;
     }
     ```

## Post-Deployment Checklist

- [ ] Verify Supabase connection works
- [ ] Test authentication (login/register)
- [ ] Verify file uploads work (tenant photos, receipts)
- [ ] Test PWA installation on mobile
- [ ] Check offline functionality
- [ ] Verify all routes work (no 404s)
- [ ] Test on different browsers
- [ ] Check mobile responsiveness

## Environment Variables

Set these in your deployment platform:

- `VITE_SUPABASE_URL` - Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Your Supabase anon key

**Note**: For production, consider using environment variables instead of hardcoding keys in `src/lib/supabase.ts`

## Custom Domain

### Vercel
1. Go to Project Settings → Domains
2. Add your custom domain
3. Follow DNS configuration instructions

### Netlify
1. Go to Site Settings → Domain Management
2. Add custom domain
3. Configure DNS as instructed

## SSL/HTTPS

Both Vercel and Netlify provide free SSL certificates automatically. For traditional hosting, use Let's Encrypt.

## Performance Optimization

- Enable CDN (automatic on Vercel/Netlify)
- Enable compression
- Use browser caching
- Optimize images before upload
- Consider lazy loading for large lists

## Troubleshooting

### Build Fails
- Check Node.js version (should be 18+)
- Clear `node_modules` and reinstall
- Check for TypeScript errors: `npm run build`

### 404 Errors on Routes
- Ensure SPA routing is configured (see above)
- Check that all routes redirect to `index.html`

### Supabase Connection Issues
- Verify environment variables are set
- Check Supabase project is active
- Verify RLS policies are correct

### PWA Not Installing
- Ensure site is served over HTTPS
- Check manifest.json is accessible
- Verify service worker is registered

