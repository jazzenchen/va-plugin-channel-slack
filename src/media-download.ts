/**
 * Download and cache media from Slack messages.
 *
 * Slack file URLs (url_private) require bot token authentication.
 * We download them locally and pass file:// URIs to the agent.
 */

import fs from "node:fs/promises";
import path from "node:path";

function log(level: string, msg: string): void {
  process.stderr.write(`[slack-media][${level}] ${msg}\n`);
}

export interface DownloadedMedia {
  path: string;
  mimeType: string;
  fileName?: string;
}

function buildCachePath(params: {
  cacheDir: string;
  chatId: string;
  fileId: string;
  ext: string;
}): string {
  const { cacheDir, chatId, fileId, ext } = params;
  return path.join(cacheDir, "slack", chatId, `${fileId}${ext}`);
}

async function isCached(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Download a file from Slack using the bot token and cache it locally.
 */
export async function downloadSlackFile(params: {
  botToken: string;
  urlPrivate: string;
  fileId: string;
  cacheDir: string;
  chatId: string;
  mimeType: string;
  fileName?: string;
}): Promise<DownloadedMedia | null> {
  const { botToken, urlPrivate, fileId, cacheDir, chatId, mimeType, fileName } = params;

  const ext = fileName
    ? path.extname(fileName) || mimeTypeToExt(mimeType)
    : mimeTypeToExt(mimeType);

  const cachePath = buildCachePath({ cacheDir, chatId, fileId, ext });

  if (await isCached(cachePath)) {
    log("debug", `cache hit: ${cachePath}`);
    return { path: cachePath, mimeType, fileName };
  }

  try {
    log("debug", `downloading file=${fileId} url=${urlPrivate.slice(0, 80)}...`);

    const res = await fetch(urlPrivate, {
      headers: { Authorization: `Bearer ${botToken}` },
    });

    if (!res.ok) {
      log("error", `download failed: ${res.status} ${res.statusText}`);
      return null;
    }

    const buf = Buffer.from(await res.arrayBuffer());
    log("debug", `downloaded ${buf.length} bytes for file=${fileId}`);

    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(cachePath, buf);
    log("debug", `cached to ${cachePath}`);

    return { path: cachePath, mimeType, fileName };
  } catch (err) {
    log("error", `download failed for file=${fileId}: ${String(err)}`);
    return null;
  }
}

function mimeTypeToExt(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "video/mp4": ".mp4",
    "audio/mpeg": ".mp3",
    "audio/ogg": ".ogg",
    "application/pdf": ".pdf",
    "text/plain": ".txt",
  };
  return map[mime] ?? ".bin";
}
