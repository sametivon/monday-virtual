'use client';

import { useRef, useState } from 'react';
import { Palette, RotateCcw, Upload, X } from 'lucide-react';
import { Permission, UploadKind, type BrandingPalette } from '@mvs/shared';
import { api } from '@/lib/api';
import { applyBranding } from '@/lib/branding';
import { useSessionStore } from '@/stores/sessionStore';
import { Button, Modal } from '@/ui/primitives';

const PALETTE_FIELDS: { key: keyof BrandingPalette; label: string }[] = [
  { key: 'primary', label: 'Primary' },
  { key: 'secondary', label: 'Secondary' },
  { key: 'accent', label: 'Accent' },
  { key: 'background', label: 'Background' },
  { key: 'surface', label: 'Surface' },
  { key: 'text', label: 'Text' },
];

/** The product's own default palette (matches the :root tokens in globals.css). */
const DEFAULT_PALETTE: BrandingPalette = {
  primary: '#6c5ce7',
  secondary: '#0a9a6e',
  background: '#faf7f2',
  surface: '#ffffff',
  accent: '#e8a33d',
  text: '#211c29',
};

const inputCls =
  'w-full rounded-md border border-line/15 bg-brand-bg px-3 py-2 text-sm text-brand-text placeholder:text-brand-text/40 focus:border-brand-primary focus:outline-none';

/**
 * White-label editor (admins with branding:edit): product name + palette,
 * previewed live by writing the CSS variables, persisted tenant-wide on save.
 */
export function BrandingSettings() {
  const me = useSessionStore((s) => s.me);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [palette, setPalette] = useState<BrandingPalette | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!me?.permissions.includes(Permission.BRANDING_EDIT)) return null;
  const saved = me.tenant.branding;

  const openEditor = () => {
    setName(saved.productName);
    setPalette({ ...saved.palette });
    setLogoUrl(saved.logoUrl ?? null);
    setError(null);
    setOpen(true);
  };

  const onLogoPicked = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const url = await api.uploadAsset(UploadKind.LOGO, file);
      setLogoUrl(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const preview = (next: BrandingPalette, nextName: string) => {
    applyBranding({ ...saved, productName: nextName, palette: next });
  };

  const setColor = (key: keyof BrandingPalette, value: string) => {
    if (!palette) return;
    const next = { ...palette, [key]: value };
    setPalette(next);
    preview(next, name);
  };

  const resetToDefaults = () => {
    const next = { ...DEFAULT_PALETTE };
    setPalette(next);
    preview(next, name);
  };

  const cancel = () => {
    applyBranding(saved); // roll back the live preview
    setOpen(false);
  };

  const save = async () => {
    if (!palette) return;
    setSaving(true);
    try {
      const branding = await api.updateBranding({
        productName: name.trim() || undefined,
        palette,
        logoUrl,
      });
      useSessionStore.getState().patchBranding(branding);
      applyBranding(branding);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <Button variant="ghost" icon={Palette} onClick={openEditor}>
        Branding
      </Button>
    );
  }

  return (
    <Modal title="Branding" size="sm" onClose={cancel}>
      <div className="p-5">
        <label className="block">
          <span className="mb-1 block text-xs text-brand-text/60">Product name</span>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (palette) preview(palette, e.target.value);
            }}
            maxLength={60}
            className={inputCls}
          />
        </label>

        <div className="mt-4">
          <span className="mb-1 block text-xs text-brand-text/60">Logo</span>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            className="hidden"
            onChange={(e) => void onLogoPicked(e.target.files?.[0] ?? undefined)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex w-full items-center justify-center gap-2.5 rounded-md border border-dashed border-line/20 bg-brand-bg px-4 py-4 text-sm text-brand-text/60 transition hover:border-brand-primary/40 hover:text-brand-text disabled:opacity-50"
          >
            {logoUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoUrl} alt="Logo" className="h-9 w-auto max-w-[120px] object-contain" />
                <span>{uploading ? 'Uploading…' : 'Replace logo'}</span>
              </>
            ) : (
              <>
                <Upload size={16} strokeWidth={1.75} aria-hidden="true" />
                <span>{uploading ? 'Uploading…' : 'Upload a logo'}</span>
              </>
            )}
          </button>
          {logoUrl && (
            <div className="mt-1.5 flex justify-end">
              <Button variant="subtle" size="sm" icon={X} onClick={() => setLogoUrl(null)}>
                Remove logo
              </Button>
            </div>
          )}
        </div>
        {error && <p className="mt-3 text-xs text-danger">{error}</p>}

        <div className="mt-4 flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wide text-brand-text/55">
            Colors
          </span>
          <Button variant="subtle" size="sm" icon={RotateCcw} onClick={resetToDefaults}>
            Reset to defaults
          </Button>
        </div>
        <div className="mt-1.5 divide-y divide-line/8 rounded-md border border-line/10">
          {palette &&
            PALETTE_FIELDS.map(({ key, label }) => (
              <label
                key={key}
                className="flex items-center justify-between gap-2 px-3 py-2 text-sm text-brand-text"
              >
                {label}
                <input
                  type="color"
                  value={palette[key]}
                  onChange={(e) => setColor(key, e.target.value)}
                  className="h-8 w-12 cursor-pointer rounded-sm border border-line/15 bg-transparent p-0.5"
                />
              </label>
            ))}
        </div>
      </div>

      <div className="border-t border-line/8 p-4">
        <div className="flex gap-2">
          <Button variant="accent" className="flex-1" loading={saving} onClick={() => void save()}>
            Save for everyone
          </Button>
          <Button variant="ghost" onClick={cancel}>
            Cancel
          </Button>
        </div>
        <p className="mt-3 text-xs text-brand-text/40">
          Changes apply to everyone in your workspace on their next load.
        </p>
      </div>
    </Modal>
  );
}
