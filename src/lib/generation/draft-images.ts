import { buildEventwangMediaUrl } from "../collectors/eventwang-gallery";
import { WORKFLOW_IMAGES_PER_DRAFT } from "../workflow/run-config";

export type DraftImageSource = {
  url: string;
  alt: string;
  sourceUrl: string;
  localPath?: string;
  styleTag?: string;
  styleBucket?: string;
};

export type DraftImagePlacement = {
  prompt: string;
  url: string;
  localPath?: string;
  role: "cover" | "body";
  usageKey: string;
};

export type DraftImageAssignment = {
  draftId: string;
  images: DraftImagePlacement[];
  missingImageCount: number;
};

export type DraftImageAssignmentOptions = {
  imagesPerDraft?: number;
  usedImageKeys?: Iterable<string>;
  allowPartial?: boolean;
};

export class DraftImageAssignmentError extends Error {
  constructor(
    message: string,
    readonly details: {
      required: number;
      available: number;
      draftCount: number;
      imagesPerDraft: number;
    }
  ) {
    super(message);
    this.name = "DraftImageAssignmentError";
  }
}

export function assignEventwangImagesToDrafts(
  drafts: Array<{ id: string }>,
  images: DraftImageSource[],
  options: DraftImageAssignmentOptions | number = WORKFLOW_IMAGES_PER_DRAFT
): DraftImageAssignment[] {
  const { imagesPerDraft, usedImageKeys, allowPartial } = normalizeAssignmentOptions(options);
  const usedKeys = new Set(usedImageKeys);
  const seenKeys = new Set<string>();
  const usableImages = images
    .map((image) => {
      const url = image.url || buildEventwangMediaUrl(image.localPath);
      const usageKey = imageUsageKey(image, url);
      if (!url || !usageKey || usedKeys.has(usageKey) || seenKeys.has(usageKey)) return null;
      seenKeys.add(usageKey);
      return {
        promptParts: [image.styleTag || image.alt, image.sourceUrl].filter(Boolean),
        url,
        localPath: image.localPath,
        usageKey
      };
    })
    .filter((image): image is NonNullable<typeof image> => Boolean(image));

  const required = drafts.length * imagesPerDraft;
  if (usableImages.length < required && !allowPartial) {
    throw new DraftImageAssignmentError(
      `需要 ${required} 张不重复图片用于 ${drafts.length} 篇草稿，当前只有 ${usableImages.length} 张未使用图片。`,
      {
        required,
        available: usableImages.length,
        draftCount: drafts.length,
        imagesPerDraft
      }
    );
  }

  return drafts.map((draft, draftIndex) => {
    const start = draftIndex * imagesPerDraft;
    const imagesForDraft = usableImages.slice(start, start + imagesPerDraft).map((image, imageIndex) => {
      const role: DraftImagePlacement["role"] = imageIndex === 0 ? "cover" : "body";
      const label = role === "cover" ? "cover" : `body ${imageIndex}`;
      return {
        prompt: [label, ...image.promptParts].join(" | "),
        url: image.url,
        localPath: image.localPath,
        role,
        usageKey: image.usageKey
      };
    });

    return {
      draftId: draft.id,
      images: imagesForDraft,
      missingImageCount: Math.max(0, imagesPerDraft - imagesForDraft.length)
    };
  });
}

export function imageUsageKey(image: { localPath?: string; url?: string; sourceUrl?: string }, resolvedUrl?: string) {
  const localPath = normalizeLocalPath(image.localPath) || normalizeLocalPath(extractEventwangFilePath(image.url || resolvedUrl || ""));
  if (localPath) return `local:${localPath}`;

  const url = normalizeUrl(image.url || resolvedUrl || "");
  if (url) return `url:${url}`;

  const sourceUrl = normalizeUrl(image.sourceUrl || "");
  return sourceUrl ? `source:${sourceUrl}` : "";
}

function normalizeAssignmentOptions(options: DraftImageAssignmentOptions | number) {
  if (typeof options === "number") {
    return {
      imagesPerDraft: Math.max(1, Math.floor(options)),
      usedImageKeys: [],
      allowPartial: false
    };
  }

  return {
    imagesPerDraft: Math.max(1, Math.floor(options.imagesPerDraft ?? WORKFLOW_IMAGES_PER_DRAFT)),
    usedImageKeys: options.usedImageKeys ?? [],
    allowPartial: options.allowPartial ?? false
  };
}

function extractEventwangFilePath(value: string) {
  if (!value) return "";
  try {
    const url = new URL(value, "http://local.test");
    if (url.pathname !== "/api/materials/eventwang-file") return "";
    return url.searchParams.get("path") || "";
  } catch {
    return "";
  }
}

function normalizeLocalPath(value: string | undefined) {
  if (!value) return "";
  const normalized = value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^file:\/*/i, "")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "");
  const dataIndex = normalized.toLowerCase().indexOf("data/eventwang-gallery/");
  return (dataIndex >= 0 ? normalized.slice(dataIndex) : normalized).toLowerCase();
}

function normalizeUrl(value: string) {
  const raw = value.trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.hash = "";
    return url.toString();
  } catch {
    return raw;
  }
}
