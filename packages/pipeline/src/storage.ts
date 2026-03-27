import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

export interface StorageProvider {
  putObject(key: string, buffer: Buffer, contentType: string): Promise<string>;
  getSignedUrl(key: string, expiresIn?: number): Promise<string>;
}

export class SupabaseStorageProvider implements StorageProvider {
  private supabase: ReturnType<typeof createClient>;
  private bucket: string;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_KEY;
    this.bucket = process.env.SUPABASE_BUCKET || 'audits';

    if (!url || !serviceKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
    }

    this.supabase = createClient(url, serviceKey);
  }

  async putObject(key: string, buffer: Buffer, contentType: string): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(this.bucket)
      .upload(key, buffer, {
        contentType,
        upsert: true,
      });

    if (error) {
      throw new Error(`Failed to upload to Supabase: ${error.message}`);
    }

    return key;
  }

  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(this.bucket)
      .createSignedUrl(key, expiresIn);

    if (error || !data) {
      throw new Error(`Failed to create signed URL: ${error?.message || 'Unknown error'}`);
    }

    return data.signedUrl;
  }
}

export class S3StorageProvider implements StorageProvider {
  private s3: S3Client;
  private bucket: string;

  constructor() {
    this.bucket = process.env.S3_BUCKET || 'audits';
    const region = process.env.S3_REGION || 'us-east-1';
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

    if (!accessKeyId || !secretAccessKey) {
      throw new Error('S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be set');
    }

    this.s3 = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async putObject(key: string, buffer: Buffer, contentType: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });

    await this.s3.send(command);
    return key;
  }

  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return await getSignedUrl(this.s3, command, { expiresIn });
  }
}

export class LocalStorageProvider implements StorageProvider {
  private baseDir: string;

  constructor() {
    this.baseDir = process.env.LOCAL_STORAGE_DIR || './data/uploads';
    try { fs.mkdirSync(this.baseDir, { recursive: true }); } catch { /* read-only FS is fine for web service */ }
  }

  async putObject(key: string, buffer: Buffer, contentType: string): Promise<string> {
    const filePath = path.join(this.baseDir, key);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, buffer);
    return key;
  }

  async getSignedUrl(key: string): Promise<string> {
    // Relative URL — works regardless of APP_BASE_URL config
    return `/api/storage/${encodeURIComponent(key)}`;
  }
}

const dataUrlStore = new Map<string, string>();

class DataUrlStorageProvider implements StorageProvider {

  async putObject(key: string, buffer: Buffer, contentType: string): Promise<string> {
    const base64 = buffer.toString('base64');
    const dataUrl = `data:${contentType};base64,${base64}`;
    dataUrlStore.set(key, dataUrl);
    return key;
  }

  async getSignedUrl(key: string): Promise<string> {
    return dataUrlStore.get(key) ?? key;
  }
}

function isPlaceholder(value?: string | null): boolean {
  if (!value) return true;
  const lowered = value.toLowerCase();
  return (
    lowered.includes('your-') ||
    lowered.includes('project-url') ||
    lowered.includes('example.com')
  );
}

export function createStorageProvider(): StorageProvider {
  const provider = process.env.STORAGE_PROVIDER || 'local';

  if (provider === 'local') {
    return new LocalStorageProvider();
  } else if (provider === 's3') {
    return new S3StorageProvider();
  } else if (provider === 'supabase') {
    const hasSupabaseEnv = !isPlaceholder(process.env.SUPABASE_URL) && !isPlaceholder(process.env.SUPABASE_SERVICE_KEY);
    if (!hasSupabaseEnv) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[storage] Falling back to in-memory data URLs because Supabase credentials are missing.'
        );
      }
      return new DataUrlStorageProvider();
    }
    return new SupabaseStorageProvider();
  } else {
    throw new Error(`Unsupported storage provider: ${provider}`);
  }
}

