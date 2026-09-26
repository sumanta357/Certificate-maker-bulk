// Storage abstraction: local filesystem (dev) or any S3-compatible API (prod).
import fsPromises from "fs/promises";
import path from "path";
import { s3Fetch, type S3FetchOptions } from "./s3";

export interface StorageDriver {
  put(key: string, data: Buffer | Uint8Array, contentType?: string): Promise<{ key: string }>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export class LocalStorage implements StorageDriver {
  constructor(private root = process.env.LOCAL_STORAGE_DIR || "./storage") {}

  private resolve(key: string): string {
    const normalizedRoot = path.normalize(this.root);
    const p = path.normalize(path.join(normalizedRoot, key));
    if (!p.startsWith(normalizedRoot)) {
      throw new Error("Invalid storage key");
    }
    return p;
  }

  async put(key: string, data: Buffer | Uint8Array, contentType?: string): Promise<{ key: string }> {
    void contentType;
    const p = this.resolve(key);
    await fsPromises.mkdir(path.dirname(p), { recursive: true });
    await fsPromises.writeFile(p, data);
    return { key };
  }

  async get(key: string): Promise<Buffer> {
    return fsPromises.readFile(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    await fsPromises.rm(this.resolve(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fsPromises.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }
}

export class S3Storage implements StorageDriver {
  constructor(
    private opts: {
      endpoint?: string;
      accessKeyId: string;
      secretAccessKey: string;
      bucket: string;
      publicBaseUrl?: string;
    }
  ) {}

  private objectUrl(key: string): string {
    const base = (this.opts.endpoint || "").replace(/\/+$/, "");
    return `${base}/${this.opts.bucket}/${key}`;
  }

  async put(key: string, data: Buffer | Uint8Array, contentType?: string): Promise<{ key: string }> {
    await s3Fetch({
      method: "PUT",
      url: this.objectUrl(key),
      headers: { "content-type": contentType || "application/octet-stream" },
      body: data,
      accessKeyId: this.opts.accessKeyId,
      secretAccessKey: this.opts.secretAccessKey,
      region: "auto",
      service: "s3",
    });
    return { key };
  }

  async get(key: string): Promise<Buffer> {
    const res = await s3Fetch({
      method: "GET",
      url: this.objectUrl(key),
      accessKeyId: this.opts.accessKeyId,
      secretAccessKey: this.opts.secretAccessKey,
      region: "auto",
      service: "s3",
    });
    if (!res.ok) throw new Error(`Storage GET failed with status ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    await s3Fetch({
      method: "DELETE",
      url: this.objectUrl(key),
      accessKeyId: this.opts.accessKeyId,
      secretAccessKey: this.opts.secretAccessKey,
      region: "auto",
      service: "s3",
    });
  }

  async exists(key: string): Promise<boolean> {
    const res = await s3Fetch({
      method: "HEAD",
      url: this.objectUrl(key),
      accessKeyId: this.opts.accessKeyId,
      secretAccessKey: this.opts.secretAccessKey,
      region: "auto",
      service: "s3",
    });
    return res.ok;
  }
}

export function getStorage(): StorageDriver {
  const driver = (process.env.STORAGE_DRIVER || "local").toLowerCase();
  if (driver === "local") return new LocalStorage();

  const accessKeyId = process.env.STORAGE_ACCESS_KEY || "";
  const secretAccessKey = process.env.STORAGE_SECRET_KEY || "";
  const bucket = process.env.STORAGE_BUCKET || "autocert";
  let endpoint = (process.env.STORAGE_ENDPOINT || "").replace(/\/+$/, "");
  if (!endpoint && driver === "supabase") {
    const url = process.env.SUPABASE_URL || "";
    if (url) endpoint = `${url.replace(/\/+$/, "")}/storage/v1/s3`;
  }
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    console.warn(
      `[storage] STORAGE_DRIVER=${driver} but endpoint/keys missing — falling back to local storage.`
    );
    return new LocalStorage();
  }
  return new S3Storage({ endpoint, accessKeyId, secretAccessKey, bucket });
}

export type { S3FetchOptions };
