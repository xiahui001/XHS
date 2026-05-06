import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const SOURCE = "eventwang";
const TRANSIENT_QUERY_PREFIXES = ["utm_"];
const TRANSIENT_QUERY_KEYS = new Set(["spm", "from", "from_app", "timestamp", "time", "sign", "token", "_t", "v"]);

export function createEventwangImageDedupeStore(dbPath = "data/eventwang-gallery/eventwang-dedupe.sqlite") {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  let closed = false;
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS eventwang_image_fingerprints (
      source TEXT NOT NULL,
      fingerprint_type TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      gallery_id TEXT,
      keyword TEXT,
      detail_url TEXT,
      preview_url TEXT,
      local_path TEXT,
      first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (source, fingerprint_type, fingerprint)
    );
  `);

  const findFingerprint = db.prepare(`
    SELECT fingerprint_type
    FROM eventwang_image_fingerprints
    WHERE source = ? AND fingerprint_type = ? AND fingerprint = ?
    LIMIT 1
  `);
  const touchFingerprint = db.prepare(`
    UPDATE eventwang_image_fingerprints
    SET last_seen_at = datetime('now')
    WHERE source = ? AND fingerprint_type = ? AND fingerprint = ?
  `);
  const insertFingerprint = db.prepare(`
    INSERT OR IGNORE INTO eventwang_image_fingerprints (
      source, fingerprint_type, fingerprint, gallery_id, keyword, detail_url, preview_url, local_path
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  function hasSeenCandidate(candidate) {
    for (const fingerprint of candidateFingerprints(candidate)) {
      if (hasFingerprint(fingerprint.type, fingerprint.value)) {
        touchFingerprint.run(SOURCE, fingerprint.type, fingerprint.value);
        return { duplicate: true, reason: fingerprint.reason };
      }
    }
    return { duplicate: false };
  }

  function hasDuplicateContent(image) {
    const contentHash = hashFile(image.localPath);
    if (hasFingerprint("content", contentHash)) {
      touchFingerprint.run(SOURCE, "content", contentHash);
      return { duplicate: true, reason: "content" };
    }
    return { duplicate: false, contentHash };
  }

  function recordDownloadedImage(image) {
    const contentHash = image.contentHash || hashFile(image.localPath);
    for (const fingerprint of downloadedFingerprints(image, contentHash)) {
      insertFingerprint.run(
        SOURCE,
        fingerprint.type,
        fingerprint.value,
        image.galleryId || null,
        image.keyword || null,
        image.detailUrl || null,
        image.previewUrl || null,
        image.localPath || null
      );
      touchFingerprint.run(SOURCE, fingerprint.type, fingerprint.value);
    }
    return { contentHash };
  }

  function hasFingerprint(type, value) {
    return Boolean(findFingerprint.get(SOURCE, type, value));
  }

  return {
    dbPath,
    hasSeenCandidate,
    hasDuplicateContent,
    recordDownloadedImage,
    close: () => {
      if (closed) return;
      db.close();
      closed = true;
    }
  };
}

export function normalizeEventwangImageUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";

  let url;
  try {
    url = new URL(raw.startsWith("//") ? `https:${raw}` : raw);
  } catch {
    return raw;
  }

  url.protocol = "https:";
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";

  const params = Array.from(url.searchParams.entries())
    .filter(([key]) => !isTransientQueryKey(key))
    .sort(([left], [right]) => left.localeCompare(right));
  url.search = "";
  for (const [key, value] of params) url.searchParams.append(key, value);

  return url.href.replace(/\/$/, "");
}

export function hashText(input) {
  return createHash("sha256").update(String(input)).digest("hex");
}

export function hashFile(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function candidateFingerprints(candidate) {
  return [
    urlFingerprint(candidate.detailUrl, "url"),
    urlFingerprint(candidate.previewUrl, "url"),
    candidate.galleryId ? { type: "gallery", value: String(candidate.galleryId), reason: "gallery" } : null
  ].filter(Boolean);
}

function downloadedFingerprints(image, contentHash) {
  return [
    ...candidateFingerprints(image),
    contentHash ? { type: "content", value: contentHash, reason: "content" } : null
  ].filter(Boolean);
}

function urlFingerprint(input, reason) {
  const normalized = normalizeEventwangImageUrl(input);
  if (!normalized) return null;
  return { type: "url", value: hashText(normalized), reason };
}

function isTransientQueryKey(key) {
  const lower = key.toLowerCase();
  return TRANSIENT_QUERY_KEYS.has(lower) || TRANSIENT_QUERY_PREFIXES.some((prefix) => lower.startsWith(prefix));
}
