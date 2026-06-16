'use client';

import { useRef, useState } from 'react';
import { Permission, UploadKind, type BrandingPalette } from '@mvs/shared';
import { api } from '@/lib/api';
import { applyBranding } from '@/lib/branding';
import { useSessionStore } from '@/stores/sessionStore';

const PALETTE_FIELDS: { key: keyof BrandingPalette; label: string }[] = [
  { key: 'primary', label: 'Primary' },
  { key: 'secondary', label: 'Secondary' },
  { key: 'accent', label: 'Accent' },
  { key: 'background', label: 'Background' },
  { key: 'surface', label: 'Surface' },
  { key: 'text', label: 'Text' },
];

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
      <button
        onClick={openEditor}
        className="rounded-lg border border-white/10 bg-brand-surface px-4 py-2 text-sm transition hover:border-brand-primary"
      >
        🎨 Branding
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-brand-surface p-6 text-left">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Workspace branding</h2>
          <button onClick={cancel} className="text-white/60 hover:text-white">✕</button>
        </div>

        <label className="mb-1 block text-sm text-white/60">Product name</label>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (palette) preview(palette, e.target.value);
          }}
          maxLength={60}
          className="mb-4 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 outline-none focus:border-brand-primary"
        />

        <label className="mb-1 block text-sm text-white/60">Logo</label>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-black/30">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Logo" className="h-full w-full object-contain" />
            ) : (
              <span className="text-xs text-white/30">none</span>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            className="hidden"
            onChange={(e) => void onLogoPicked(e.target.files?.[0] ?? undefined)}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="rounded-lg bg-white/10 px-3 py-2 text-sm transition hover:bg-white/20 disabled:opacity-50"
          >
            {uploading ? 'Uploading…' : logoUrl ? 'Replace' : 'Upload'}
          </button>
          {logoUrl && (
            <button
              onClick={() => setLogoUrl(null)}
              className="rounded-lg px-2 py-2 text-sm text-white/50 transition hover:text-white"
            >
              Remove
            </button>
          )}
        </div>
        {error && <p className="mb-3 text-xs text-red-400">⚠️ {error}</p>}

        <div className="mb-1 text-sm text-white/60">Colors</div>
        <div className="mb-6 grid grid-cols-2 gap-3">
          {palette &&
            PALETTE_FIELDS.map(({ key, label }) => (
              <label key={key} className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm">
                {label}
                <input
                  type="color"
                  value={palette[key]}
                  onChange={(e) => setColor(key, e.target.value)}
                  className="h-7 w-10 cursor-pointer rounded border-0 bg-transparent"
                />
              </label>
            ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => void save()}
            disabled={saving}
            className="flex-1 rounded-lg bg-brand-primary py-2 font-semibold transition hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save for everyone'}
          </button>
          <button onClick={cancel} className="rounded-lg bg-white/10 px-4 py-2 transition hover:bg-white/20">
            Cancel
          </button>
        </div>
        <p className="mt-3 text-xs text-white/40">
          Changes apply to everyone in your workspace on their next load.
        </p>
      </div>
    </div>
  );
}
