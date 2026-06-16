import { Injectable, PayloadTooLargeException, ServiceUnavailableException, UnsupportedMediaTypeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import {
  UPLOAD_LIMITS,
  UploadKind,
  type UploadSignRequest,
  type UploadSignResponse,
} from '@mvs/shared';
import type { Env } from '../../config/env';

/**
 * Issues presigned S3 PUT URLs so the browser uploads directly to the bucket
 * (S3 / Cloudflare R2 / Backblaze B2 — all the same API). The API never
 * proxies file bytes. Keys are tenant-scoped; the public URL is derived from
 * S3_PUBLIC_BASE_URL (a CDN or the bucket's public endpoint). Mirrors the
 * media token pattern: the client holds no storage secret, just a short-lived
 * scoped URL.
 */
@Injectable()
export class UploadsService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  /** A configured client, or null when storage env is absent (degrade to 503). */
  private client(): { s3: S3Client; bucket: string; publicBase: string } | null {
    const bucket = this.config.get('S3_BUCKET', { infer: true });
    const accessKeyId = this.config.get('S3_ACCESS_KEY_ID', { infer: true });
    const secretAccessKey = this.config.get('S3_SECRET_ACCESS_KEY', { infer: true });
    const publicBase = this.config.get('S3_PUBLIC_BASE_URL', { infer: true });
    if (!bucket || !accessKeyId || !secretAccessKey || !publicBase) return null;

    const endpoint = this.config.get('S3_ENDPOINT', { infer: true });
    const s3 = new S3Client({
      region: this.config.get('S3_REGION', { infer: true }),
      endpoint, // undefined → AWS default; set for R2/B2
      forcePathStyle: Boolean(endpoint), // R2/B2 want path-style
      credentials: { accessKeyId, secretAccessKey },
    });
    return { s3, bucket, publicBase: publicBase.replace(/\/$/, '') };
  }

  async sign(tenantId: string, req: UploadSignRequest): Promise<UploadSignResponse> {
    const limits = UPLOAD_LIMITS[req.kind];
    if (!limits.mime.test(req.contentType)) {
      throw new UnsupportedMediaTypeException(`${req.contentType} is not allowed for ${req.kind}`);
    }
    if (req.size > limits.maxBytes) {
      throw new PayloadTooLargeException(
        `${req.kind} must be ≤ ${Math.round(limits.maxBytes / 1024 / 1024)}MB`,
      );
    }

    const cfg = this.client();
    if (!cfg) throw new ServiceUnavailableException('Object storage is not configured');

    const ext = extensionFor(req.contentType);
    // Tenant-scoped key so assets can never collide across tenants and a
    // tenant's objects can be lifecycle-managed/deleted as a prefix.
    const key = `${req.kind}/${tenantId}/${randomUUID()}${ext}`;

    const putUrl = await getSignedUrl(
      cfg.s3,
      new PutObjectCommand({ Bucket: cfg.bucket, Key: key, ContentType: req.contentType }),
      { expiresIn: 300 },
    );

    return {
      putUrl,
      publicUrl: `${cfg.publicBase}/${key}`,
      // The PUT must carry the same Content-Type that was signed, or S3 rejects it.
      headers: { 'Content-Type': req.contentType },
    };
  }
}

function extensionFor(contentType: string): string {
  const map: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
  };
  return map[contentType] ?? '';
}

// Re-export so the controller can reference kinds without a second import line.
export { UploadKind };
