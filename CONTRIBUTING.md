# Contributing Guide

Thank you for your interest in contributing to the Property Management PWA!

## Development Setup

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd property-management-pwa
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up Supabase**:
   - Create a Supabase project
   - Run `supabase-schema.sql` in SQL Editor
   - Create storage buckets: `tenant-photos` and `receipts`
   - Update `src/lib/supabase.ts` with your credentials

4. **Start development server**:
   ```bash
   npm run dev
   ```

## Code Style

- Use TypeScript for all new code
- Follow existing code patterns
- Use functional components with hooks
- Use Tailwind CSS for styling
- Keep components small and focused

## Commit Messages

Follow conventional commits:
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes
- `refactor:` Code refactoring
- `test:` Adding tests
- `chore:` Maintenance tasks

Example: `feat: add export to PDF functionality`

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes
3. Test thoroughly
4. Update documentation if needed
5. Submit a pull request with a clear description

## Testing

Before submitting:
- Test on multiple browsers
- Test on mobile devices
- Verify all features work
- Check for console errors
- Test offline functionality

## Questions?

Open an issue for questions or discussions.

