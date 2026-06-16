import { BrandingApplier } from '@/monday/BrandingApplier';
import { MondayProvider } from '@/monday/MondayProvider';

/**
 * Layout for the authenticated in-product app (lobby + spaces). Loaded inside
 * the monday.com iframe (or standalone via ?devSessionToken). The MondayProvider
 * bootstraps the session here so the public marketing pages stay auth-free.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <MondayProvider>
      <BrandingApplier />
      <main>{children}</main>
    </MondayProvider>
  );
}
