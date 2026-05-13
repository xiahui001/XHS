import {
  assignEventwangImagesToDrafts,
  type DraftImageAssignment,
  type DraftImageSource
} from "./draft-images";
import {
  readUsedImageKeys,
  recordAssignedDraftImages,
  type ImageUsageStoreOptions
} from "./image-usage-store";
import { WORKFLOW_IMAGES_PER_DRAFT } from "../workflow/run-config";

export type DraftImageAssignmentRequest = {
  drafts: Array<{ id: string }>;
  images: DraftImageSource[];
  imagesPerDraft?: number;
  allowPartial?: boolean;
};

export type DraftImageAssignmentResponse = {
  assignments: DraftImageAssignment[];
  assignedImageCount: number;
  missingImageCount: number;
  completeDraftCount: number;
};

export async function assignDraftImagesWithUsageStore(
  request: DraftImageAssignmentRequest,
  options: ImageUsageStoreOptions = {}
): Promise<DraftImageAssignmentResponse> {
  const usedImageKeys = await readUsedImageKeys(options);
  const assignments = assignEventwangImagesToDrafts(request.drafts, request.images, {
    imagesPerDraft: request.imagesPerDraft ?? WORKFLOW_IMAGES_PER_DRAFT,
    usedImageKeys,
    allowPartial: request.allowPartial ?? false
  });

  await recordAssignedDraftImages(assignments, options);

  return {
    assignments,
    assignedImageCount: assignments.reduce((total, assignment) => total + assignment.images.length, 0),
    missingImageCount: assignments.reduce((total, assignment) => total + assignment.missingImageCount, 0),
    completeDraftCount: assignments.filter((assignment) => assignment.missingImageCount === 0).length
  };
}
