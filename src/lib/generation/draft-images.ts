import { buildEventwangMediaUrl } from "../collectors/eventwang-gallery";

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
};

export function assignEventwangImagesToDrafts(
  drafts: Array<{ id: string }>,
  images: DraftImageSource[],
  imagesPerDraft = 10
): Array<{ draftId: string; images: DraftImagePlacement[] }> {
  const usableImages = images
    .map((image) => ({
      prompt: [image.styleTag || image.alt, image.sourceUrl].filter(Boolean).join(" · "),
      url: image.url || buildEventwangMediaUrl(image.localPath),
      localPath: image.localPath
    }))
    .filter((image) => Boolean(image.url));

  return drafts.map((draft, draftIndex) => {
    const draftImages: DraftImagePlacement[] = [];
    if (!usableImages.length) {
      return { draftId: draft.id, images: draftImages };
    }

    const count = Math.min(imagesPerDraft, usableImages.length);
    for (let offset = 0; offset < count; offset += 1) {
      const image = usableImages[(draftIndex + offset) % usableImages.length];
      if (!image) continue;
      draftImages.push(image);
    }

    return { draftId: draft.id, images: draftImages };
  });
}
