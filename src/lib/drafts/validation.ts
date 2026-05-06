export type DraftSelectionInput = {
  title: string;
  body: string;
  tags: string[];
  imageCount: number;
  licenseComplete: boolean;
};

export type DraftSelectionResult = {
  ok: boolean;
  errors: string[];
};

export function validateDraftForSelection(input: DraftSelectionInput): DraftSelectionResult {
  const errors: string[] = [];

  if (countCharacters(input.title) > 20) {
    errors.push("标题需控制在 20 字内");
  }

  if (countCharacters(input.body) > 150) {
    errors.push("正文需控制在 150 字内");
  }

  if (input.tags.length < 8 || input.tags.length > 12) {
    errors.push("标签需保持 8-12 个");
  }

  if (input.imageCount !== 10) {
    errors.push("图片需保持封面+9张");
  }

  if (!input.licenseComplete) {
    errors.push("素材授权信息不完整");
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

function countCharacters(value: string): number {
  return Array.from(value.trim()).length;
}
