import { env } from "./env";

export const mediaUrl = (key: string | null) => (key ? `/api/media/${key}` : null);

export async function putMedia(key: string, body: ArrayBuffer | Uint8Array, contentType: string) {
  const { MEDIA } = await env();
  await MEDIA.put(key, body as any, { httpMetadata: { contentType } });
  return key;
}

export async function getMediaBytes(key: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const { MEDIA } = await env();
  const obj = await MEDIA.get(key);
  if (!obj) return null;
  return {
    bytes: new Uint8Array(await obj.arrayBuffer()),
    contentType: obj.httpMetadata?.contentType ?? "image/jpeg",
  };
}

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16);
