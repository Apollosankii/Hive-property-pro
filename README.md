# Property Management & Utility Billing PWA

A comprehensive Progressive Web App for property management with automated utility billing, tenant management, and payment tracking.

## Features

- 🏢 **Building & Unit Management** - Manage multiple buildings and units
- 👥 **Tenant Management** - Add tenants with photo upload and unit assignment
- 📊 **Automated Monthly Billing** - Generate bills with water, electricity, and rent
- 💳 **Payment Processing** - Record payments with receipt upload and PDF generation
- 📈 **Reports & Analytics** - Revenue, arrears, and occupancy reports with Excel export
- 📱 **PWA Support** - Installable on mobile and desktop, works offline
- 🔐 **Secure Authentication** - Supabase Auth with Row Level Security

## Tech Stack

- **Frontend**: React 18 + TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: Custom components with Lucide icons
- **State Management**: Zustand + React Query
- **Backend**: Supabase (PostgreSQL + Storage + Auth)
- **PWA**: Vite PWA Plugin
- **PDF Generation**: jsPDF
- **Excel Export**: xlsx

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Supabase Database

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Run the SQL schema from `supabase-schema.sql`
4. Create storage buckets:
   - `tenant-photos` (public)
   - `receipts` (public)

### 3. Configure Environment Variables

The Supabase URL and keys are already configured in `src/lib/supabase.ts`. For production, move these to environment variables:

```env
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Run Development Server

```bash
npm run dev
```

### 5. Build for Production

```bash
npm run build
```

The built files will be in the `dist` directory, ready to deploy to Vercel, Netlify, or any static hosting service.

## Project Structure

```
src/
├── components/       # Reusable components (Layout, etc.)
├── lib/             # Utilities (Supabase client, PDF, Excel, utils)
├── pages/           # Page components
│   ├── Dashboard.tsx
│   ├── Buildings.tsx
│   ├── Units.tsx
│   ├── Tenants.tsx
│   ├── TenantDetail.tsx
│   ├── Billing.tsx
│   ├── Payments.tsx
│   ├── Reports.tsx
│   ├── Settings.tsx
│   ├── Login.tsx
│   └── Register.tsx
├── store/           # Zustand stores
└── App.tsx          # Main app with routing
```

## Key Features Implementation

### Monthly Bill Generation

1. Navigate to Billing page
2. Select the billing month
3. Click "Generate Bills"
4. Enter meter readings for all occupied units
5. Bills are automatically created with:
   - Water charges (calculated from meter readings)
   - Electricity charges (calculated from meter readings)
   - Monthly rent
   - Arrears from previous months

### Payment Recording

1. Go to Payments page
2. Click "Record Payment"
3. Select the bill to pay
4. Enter amount and payment method
5. Optionally upload receipt image
6. Balance is automatically updated

### Reports

- **Revenue Report**: Filter by date range, export to Excel
- **Arrears Report**: View outstanding balances with aging
- **Occupancy Report**: Unit status and occupancy rate

## PWA Features

- **Offline Support**: Caches data and works offline
- **Installable**: Add to home screen on mobile/desktop
- **Background Sync**: Payments made offline sync when online
- **Push Notifications**: (Can be added for payment reminders)

## Security

- Row Level Security (RLS) enabled on all tables
- Authentication required for all operations
- File upload restrictions (images only, max 5MB)
- Input validation on all forms

## Database Schema

See `supabase-schema.sql` for complete schema. Key tables:

- `buildings` - Building information
- `units` - Units within buildings
- `tenants` - Tenant information with photos
- `bills` - Monthly utility bills with auto-calculations
- `payments` - Payment records with receipts

## Troubleshooting

### Storage Buckets Not Created

If file uploads fail, make sure storage buckets are created in Supabase:
1. Go to Storage in Supabase dashboard
2. Create buckets: `tenant-photos` and `receipts`
3. Set them as public buckets

### RLS Policies

If you get permission errors, check RLS policies in Supabase:
- All tables should have policies allowing authenticated users
- Storage buckets need upload/read policies

## Future Enhancements

- [ ] Email notifications for bills and reminders
- [ ] SMS integration for payment reminders
- [ ] Multi-user support with roles
- [ ] Advanced analytics and charts
- [ ] Bulk operations for payments
- [ ] Mobile app (React Native)

## License

MIT

