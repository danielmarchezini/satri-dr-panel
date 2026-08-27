import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

export interface StorageCreds {
  accessKey: string;
  secretKey: string;
  endpoint: string;
  bucket: string;
}

export interface BackupFile {
  key: string;
  label: string; // staging | production | outro
  sizeBytes: number;
  lastModified: string;
}

export interface StorageSummary {
  files: BackupFile[];
  totalBytes: number;
  latestByLabel: Record<string, BackupFile | undefined>;
}

function client(creds: StorageCreds) {
  return new S3Client({
    region: 'auto',
    endpoint: creds.endpoint,
    credentials: { accessKeyId: creds.accessKey, secretAccessKey: creds.secretKey },
    forcePathStyle: true,
  });
}

export async function listBackups(creds: StorageCreds): Promise<StorageSummary> {
  const s3 = client(creds);
  const files: BackupFile[] = [];
  let continuationToken: string | undefined;

  do {
    const res = await s3.send(new ListObjectsV2Command({
      Bucket: creds.bucket,
      Prefix: 'postgres/',
      ContinuationToken: continuationToken,
    }));
    for (const obj of res.Contents || []) {
      if (!obj.Key || !obj.Key.endsWith('.dump.age')) continue;
      // Chave: postgres/<label>/<ano>/<mes>/satri-<label>-<stamp>.dump.age
      const parts = obj.Key.split('/');
      const label = parts[1] || 'desconhecido';
      files.push({
        key: obj.Key,
        label,
        sizeBytes: obj.Size || 0,
        lastModified: obj.LastModified?.toISOString() || '',
      });
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);

  const totalBytes = files.reduce((sum, f) => sum + f.sizeBytes, 0);
  const latestByLabel: Record<string, BackupFile | undefined> = {};
  for (const f of files) {
    const current = latestByLabel[f.label];
    if (!current || f.lastModified > current.lastModified) {
      latestByLabel[f.label] = f;
    }
  }

  return { files, totalBytes, latestByLabel };
}
