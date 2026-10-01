import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { AppError } from "@/shared/errors";
export interface ObjectStorage {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array>;
}
export function objectStorage(): ObjectStorage {
  const {
    S3_ENDPOINT,
    S3_REGION,
    S3_BUCKET,
    S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY,
  } = process.env;
  if (!S3_REGION || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY)
    throw new AppError(
      "STORAGE_NOT_CONFIGURED",
      "El almacenamiento de fotografías no está configurado",
      503,
    );
  const client = new S3Client({
    region: S3_REGION,
    endpoint: S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(S3_ENDPOINT),
    credentials: {
      accessKeyId: S3_ACCESS_KEY_ID,
      secretAccessKey: S3_SECRET_ACCESS_KEY,
    },
  });
  return {
    async put(key, bytes, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: key,
          Body: bytes,
          ContentType: contentType,
        }),
      );
    },
    async get(key) {
      const object = await client.send(
        new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }),
      );
      if (!object.Body)
        throw new AppError("NOT_FOUND", "Imagen no disponible", 404);
      return object.Body.transformToByteArray();
    },
  };
}
