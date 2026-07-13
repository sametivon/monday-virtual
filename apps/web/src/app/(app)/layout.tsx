import { BrandingApplier } from '@/monday/BrandingApplier';
import { MondayProvider } from '@/monday/MondayProvider';
import { Toasts, UiMotionRoot } from '@/ui/primitives';

/**
 * Layout for the authenticated in-product app (lobby + spaces). Loaded inside
 * the monday.com iframe (or standalone via ?devSessionToken). The MondayProvider
 * bootstraps the session here so the public marketing pages stay auth-free.
 * UiMotionRoot provides the motion context; Toasts is the global notification
 * stack.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <UiMotionRoot>
      <MondayProvider>
        <BrandingApplier />
        <main>{children}</main>
        <Toasts />
      </MondayProvider>
    </UiMotionRoot>
  );
}
