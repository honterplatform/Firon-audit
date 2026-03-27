import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@audit/db';
import * as fs from 'fs';
import * as path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  const decodedKey = decodeURIComponent(key);

  // Try database first (works across Railway services)
  try {
    const file = await prisma.storedFile.findUnique({ where: { key: decodedKey } });
    if (file) {
      const buffer = Buffer.from(file.data, 'base64');
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': file.contentType,
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }
  } catch { /* DB not available, fall through to filesystem */ }

  // Fall back to local filesystem
  const baseDir = process.env.LOCAL_STORAGE_DIR || './data/uploads';
  const filePath = path.join(baseDir, decodedKey);
  const resolved = path.resolve(filePath);

  if (!resolved.startsWith(path.resolve(baseDir))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!fs.existsSync(resolved)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const buffer = fs.readFileSync(resolved);
  const MIME_TYPES: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.webp': 'image/webp', '.svg': 'image/svg+xml', '.pdf': 'application/pdf',
    '.json': 'application/json', '.html': 'text/html',
  };
  const ext = path.extname(decodedKey).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
