# Property Management PWA - Project Information

## Project Overview

A comprehensive Progressive Web App for property management with automated utility billing, tenant management, and payment tracking.

## Technology Stack

### Frontend
- **React 18** - UI library
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Vite** - Build tool
- **React Router** - Navigation
- **Zustand** - State management
- **React Query** - Data fetching
- **Lucide React** - Icons

### Backend
- **Supabase** - Backend as a Service
  - PostgreSQL Database
  - Authentication
  - File Storage
  - Row Level Security

### PWA Features
- Service Worker
- Offline Support
- Installable
- Background Sync

### Utilities
- **jsPDF** - PDF generation
- **xlsx** - Excel export
- **date-fns** - Date formatting

## Project Structure

```
property-management-pwa/
├── src/
│   ├── components/       # Reusable components
│   ├── lib/              # Utilities and helpers
│   ├── pages/            # Page components
│   ├── store/            # State management
│   ├── App.tsx           # Main app component
│   └── main.tsx          # Entry point
├── public/               # Static assets
├── .github/              # GitHub workflows
├── .vscode/              # VS Code settings
├── dist/                 # Build output
└── node_modules/         # Dependencies
```

## Features

### Core Features
- ✅ Building & Unit Management
- ✅ Tenant Management with Photo Upload
- ✅ Automated Monthly Billing
- ✅ Payment Processing
- ✅ Reports & Analytics
- ✅ PDF & Excel Export
- ✅ PWA Support

### Security
- Row Level Security (RLS)
- Authentication required
- File upload restrictions
- Input validation

## Development

### Prerequisites
- Node.js 18+
- npm or yarn
- Supabase account

### Getting Started
1. Clone repository
2. Install dependencies: `npm install`
3. Set up Supabase (see SETUP.md)
4. Run dev server: `npm run dev`

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

Supported platforms:
- Vercel (Recommended)
- Netlify
- GitHub Pages
- Traditional hosting

## License

MIT License - see [LICENSE](./LICENSE) file

## Support

For issues and questions:
1. Check [SETUP.md](./SETUP.md) for setup issues
2. Check [DEPLOYMENT.md](./DEPLOYMENT.md) for deployment issues
3. Open an issue on GitHub

## Roadmap

Future enhancements:
- [ ] Email notifications
- [ ] SMS integration
- [ ] Multi-user support
- [ ] Advanced analytics
- [ ] Mobile app (React Native)

