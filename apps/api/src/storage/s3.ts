import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { env } from '../env';

let cached: S3Client | null = null;

function client(): S3Client {
  if (cached) return cached;
  const e = env();
  cached = new S3Client({
    region: 'us-east-1',
    endpoint: e.S3_ENDPOINT,
    forcePathStyle: true, // required for MinIO
    credentials: { accessKeyId: e.S3_ACCESS_KEY, secretAccessKey: e.S3_SECRET_KEY },
  });
  return cached;
}

/** Create the bucket if it does not exist (idempotent). */
export async function ensureBucket(): Promise<void> {
  const bucket = env().S3_BUCKET;
  try {
    await client().send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await client().send(new CreateBucketCommand({ Bucket: bucket }));
  }
}

export async function putObject(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType: string,
): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: env().S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

/** Fetch an object's bytes. Returns null if missing. */
export async function getObjectBytes(key: string): Promise<Uint8Array | null> {
  try {
    const res = await client().send(
      new GetObjectCommand({ Bucket: env().S3_BUCKET, Key: key }),
    );
    if (!res.Body) return null;
    return await res.Body.transformToByteArray();
  } catch {
    return null;
  }
}
