'use client';

import { useEffect } from 'react';
import { applyBranding } from '@/lib/branding';
import { useSessionStore } from '@/stores/sessionStore';

/** Applies the tenant's white-label branding whenever the session (re)loads. */
export function BrandingApplier() {
  const branding = useSessionStore((s) => s.me?.tenant.branding);
  useEffect(() => {
    if (branding) applyBranding(branding);
  }, [branding]);
  return null;
}
