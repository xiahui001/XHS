"use client";

import {
  CheckCircle2,
  FileText,
  Home,
  Layers3,
  ListPlus,
  PlugZap,
  Plus,
  QrCode,
  RefreshCw,
  Save,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  X as XIcon
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { clearStoredAuthSession, readFreshStoredAuthSession, readStoredAuthSession, type AuthUser } from "@/lib/auth/session";
import { buildEventwangPartialStatus, countEventwangDuplicateSkips } from "@/lib/collectors/eventwang-fallback";
import { buildEventwangMediaUrl } from "@/lib/collectors/eventwang-gallery";
import { getEventwangUsabilityError } from "@/lib/collectors/eventwang-usability";
import {
  attachDraftBatchMetadata,
  createDraftBatchMetadata,
  findLatestDraftBatchId,
  type DraftBatchMetadata
} from "@/lib/drafts/batches";
import {
  DEFAULT_DRAFT_LIBRARY_ACCOUNT_ID,
  DRAFT_LIBRARY_ACCOUNT_OPTIONS,
  buildDraftLibraryStatus,
  buildDraftLibrarySummary
} from "@/lib/drafts/account-library";
import { buildCoreSearchTerms, buildEventwangFallbackSearchTerms } from "@/lib/keywords/search-terms";
import { getMaterialHardBlocker } from "@/lib/workflow/material-gate";
import { calculateWorkflowProgress } from "@/lib/workflow/progress";
import {
  EVENTWANG_IMAGE_LIMIT_PER_RUN,
  EVENTWANG_IMAGE_POOL_MIN_IMAGES_PER_DRAFT,
  EVENTWANG_MAX_CANDIDATES_PER_RUN,
  WORKFLOW_DRAFTS_PER_RUN,
  WORKFLOW_IMAGES_PER_DRAFT
} from "@/lib/workflow/run-config";
import { buildWorkflowRetryStatus, shouldRetryWorkflowError, workflowRetryDelayMs } from "@/lib/workflow/unattended";
import { CONTENT_DOMAINS, XHS_COLLECTOR_PROFILE_LABEL, getContentDomain } from "@/lib/workspace/content-domains";
import { DASHBOARD_NAV_ITEMS, type SectionId } from "@/lib/workspace/dashboard-navigation";
import {
  buildKeywordOptions,
  buildGlobalChecks,
  createDefaultWorkspaceState,
  DEFAULT_KEYWORD_OPTION,
  type GlobalCheck,
  pickRandomKeyword,
  planKeywordDraftBatches,
  type KeywordDraftBatch,
  type KeywordPreset,
  type WorkspaceState
} from "@/lib/workspace/state";

type DraftImage = {
  prompt?: string;
  url?: string;
  localPath?: string;
  role?: "cover" | "body";
  usageKey?: string;
};

type Draft = {
  id: string;
  accountName: string;
  industry: string;
  topic: string;
  title: string;
  body: string;
  tags: string[];
  coverTitleOptions: string[];
  imageStructure?: Array<{
    order: number;
    role: string;
    visualBrief: string;
    captionNote: string;
  }>;
  generatedImages?: DraftImage[];
  publishImages?: DraftImage[];
  batchId?: string;
  batchKeyword?: string;
  batchCreatedAt?: string;
  readAt?: string | null;
  qualityScore: number;
  status: string;
};

type MobilePublishPackageResult = {
  packageId: string;
  packageUrl: string;
  deeplinkUrl: string;
  shareText: string;
  imageCount: number;
  imageUrls: string[];
  skippedImageCount: number;
  storageProvider?: "supabase" | "local" | "inline";
  bucket: string | null;
  packageDataUrl?: string;
  storagePath: string;
  storageError?: string;
  phoneScanReady: boolean;
  shareReady: boolean;
  publicAccessWarning: string | null;
  createdAt: string;
};

type DraftImageAssignmentResult = {
  assignments: Array<{
    draftId: string;
    images: NonNullable<Draft["generatedImages"]>;
    missingImageCount: number;
  }>;
  assignedImageCount: number;
  missingImageCount: number;
  completeDraftCount: number;
};

type XhsReference = {
  id: string;
  title: string;
  content: string;
  sourceUrl?: string;
  imageUrls: string[];
  scrapedAt: string;
};

type WorkflowStep = {
  key: "material" | "text" | "image" | "draft" | "send";
  label: string;
  status: "waiting" | "running" | "done" | "failed";
  detail: string;
};

type MetricKey = "references" | "drafts" | "keywords";

type CurrentBatchState = {
  batchId: string | null;
  batchCreatedAt: string | null;
  keyword: string;
  searchTerms: string[];
  referenceCount: number;
  draftCount: number;
  keywordCount: number;
  imageCount: number;
  status: string;
  xhsSkippedReason: string | null;
};

type PersistedWorkflowJob = {
  version: typeof WORKFLOW_JOB_VERSION;
  state: "active";
  userId?: string;
  accountId: string;
  keyword: string;
  activeWorkflowStep: number;
  currentBatch: CurrentBatchState;
  references: XhsReference[];
  images: EventwangImage[];
  drafts: Draft[];
  eventwangGalleryResult: EventwangGalleryResult | null;
  batchMetadata?: DraftBatchMetadata;
  updatedAt: string;
};

type XhsLoginStatus = {
  loggedIn: boolean;
  savedLogin: boolean;
  riskBlocked?: boolean;
  storageStatePath: string;
  lastSavedAt: string | null;
  detail: string;
  verificationMode?: "file" | "live" | "cache" | "hosted";
  checkedAt?: string | null;
};

type XhsCdpStatus = {
  available: boolean;
  loggedIn: boolean;
  loginState: "unknown" | "logged_in" | "logged_out";
  loginDetail: string;
  cdpUrl: string;
  browser: string | null;
  userAgent: string | null;
  pageCount: number;
  xhsPageCount: number;
  pages: Array<{
    id: string;
    title: string;
    url: string;
  }>;
  message: string;
};

type EventwangImage = {
  url: string;
  alt: string;
  sourceUrl: string;
  localPath?: string;
  styleTag?: string;
  styleBucket?: string;
};

type EventwangGalleryResult = {
  requestedKeyword?: string;
  searchedTerms?: string[];
  keyword: string;
  galleryUrl: string;
  outputDir: string;
  selectedCount: number;
  imageCount: number;
  styleBucketCount: number;
  requiredStyleBuckets: number;
  blockingReason?: string | null;
  attempts?: Array<{
    attempt: number;
    maxCandidates: number;
    timeoutMs: number;
    status: "success" | "empty" | "failed";
    selectedCount: number;
    imageCount: number;
    styleBucketCount: number;
    reason: string;
  }>;
  items: Array<{
    galleryId: string;
    ownerId: string;
    resultIndex: number;
    tagName: string;
    styleTag: string;
    styleBucket: string;
    detailUrl: string;
    sourceUrl: string;
    previewUrl: string | null;
    localPath: string;
    downloadFilename: string;
  }>;
  partialSuccess?: boolean;
  targetImageCount?: number;
  duplicateSkipCount?: number;
  fallbackKeywordsUsed?: string[];
  source?: "eventwang_live" | "image_pool" | "mixed";
  liveImageCount?: number;
  poolImageCount?: number;
  quotaFallback?: boolean;
  skipped: Array<{
    galleryId: string;
    detailUrl: string;
    tagName: string;
    styleTag: string;
    styleBucket: string;
    reason: string;
  }>;
};

type ReplyAnalysis = {
  primaryIntent: string;
  missingFields: string[];
  needsHuman: boolean;
  handoffReason: string | null;
  suggestedReply: string;
};

type ScrapingCheck = {
  label: string;
  ok: boolean;
  detail: string;
};

type ScrapingConnector = {
  key: string;
  label: string;
  status: "ready" | "warning" | "blocked";
  message: string;
  checks: ScrapingCheck[];
};

type ScrapingHandshake = {
  serverTime: string;
  crawlerBridge: {
    mode: string;
    samePort: boolean;
    outputRoot: string;
  };
  connectors: ScrapingConnector[];
  safeguards: string[];
};

type ApiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
};

const navIconById: Record<SectionId, LucideIcon> = {
  "section-0": Home,
  "section-global-check": PlugZap,
  "section-3": FileText,
  "section-6": ListPlus,
  "section-7": Settings
};

const navItems = DASHBOARD_NAV_ITEMS.map((item) => ({
  ...item,
  icon: navIconById[item.id]
}));

const TEST_DRAFT_COUNT = WORKFLOW_DRAFTS_PER_RUN;
const IMAGES_PER_DRAFT = WORKFLOW_IMAGES_PER_DRAFT;
const TEST_XHS_REFERENCE_LIMIT = 3;
const TEST_EVENTWANG_IMAGE_LIMIT = EVENTWANG_IMAGE_LIMIT_PER_RUN;
const TEST_EVENTWANG_MAX_CANDIDATES = EVENTWANG_MAX_CANDIDATES_PER_RUN;
const UNATTENDED_RETRY_ATTEMPTS = 2;
const WORKFLOW_JOB_VERSION = 1;
const WORKFLOW_STORAGE_PREFIX = "xhs-matrix-active-workflow:";
const DRAFT_PREVIEW_CACHE_STORAGE_KEY = "xhs-matrix-draft-preview-cache";
const MOBILE_PACKAGE_CACHE_STORAGE_KEY = "xhs-matrix-mobile-package-cache";

function getDraftPublishImages(draft: Draft) {
  if (draft.publishImages?.length) return draft.publishImages;
  return draft.generatedImages ?? [];
}

function getUsableDraftPublishImages(draft: Draft) {
  return getDraftPublishImages(draft).filter((image) => image.url?.trim() || image.localPath?.trim());
}

function getDraftPublishImageCount(draft: Draft) {
  return getUsableDraftPublishImages(draft).length;
}

function getDraftCandidateImageCount(draft: Draft) {
  return Math.min(
    IMAGES_PER_DRAFT,
    Math.max(getDraftPublishImageCount(draft), draft.imageStructure?.length ?? 0)
  );
}

function getDraftPreviewImages(
  draft: Draft,
  mobilePackage?: MobilePublishPackageResult | null,
  previewCache: DraftImage[] = []
) {
  const seen = new Set<string>();
  const draftPreviewImages = getDraftPublishImages(draft)
    .map((image, index) => {
      const url = image.url?.trim() || buildEventwangMediaUrl(image.localPath || "");
      if (!url || seen.has(url)) return null;
      seen.add(url);

      return {
        key: image.usageKey || image.localPath || url,
        prompt: image.prompt || `草稿配图 ${index + 1}`,
        url
      };
    })
    .filter((image): image is { key: string; prompt: string; url: string } => Boolean(image));

  if (draftPreviewImages.length) return draftPreviewImages;

  const packagePreviewImages = (
    mobilePackage?.imageUrls.map((url, index) => ({
      key: url,
      prompt: `手机发布图 ${index + 1}`,
      url
    })) ?? []
  ).filter((image) => Boolean(image.url));

  if (packagePreviewImages.length) return packagePreviewImages;

  return previewCache
    .map((image, index) => {
      const url = image.url?.trim() || buildEventwangMediaUrl(image.localPath || "");
      if (!url || seen.has(url)) return null;
      seen.add(url);

      return {
        key: image.usageKey || image.localPath || url,
        prompt: image.prompt || `草稿预览图 ${index + 1}`,
        url
      };
    })
    .filter((image): image is { key: string; prompt: string; url: string } => Boolean(image));
}

function mergeDraftPreviewImages(existingImages: DraftImage[], addedImages: DraftImage[]) {
  const seen = new Set<string>();
  const merged: DraftImage[] = [];

  for (const image of [...existingImages, ...addedImages]) {
    const key = image.usageKey || image.localPath || image.url || image.prompt;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(image);
  }

  return merged.slice(0, IMAGES_PER_DRAFT);
}

function readDraftPreviewCache(): Record<string, DraftImage[]> {
  if (typeof window === "undefined") return {};

  try {
    const raw =
      window.localStorage.getItem(DRAFT_PREVIEW_CACHE_STORAGE_KEY) ||
      window.sessionStorage.getItem(DRAFT_PREVIEW_CACHE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, DraftImage[]>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeDraftPreviewCache(cache: Record<string, DraftImage[]>) {
  if (typeof window === "undefined") return;
  const serialized = JSON.stringify(cache);
  window.localStorage.setItem(DRAFT_PREVIEW_CACHE_STORAGE_KEY, serialized);
  window.sessionStorage.setItem(DRAFT_PREVIEW_CACHE_STORAGE_KEY, serialized);
}

function readMobilePackageCache(): Record<string, MobilePublishPackageResult> {
  if (typeof window === "undefined") return {};

  try {
    const raw =
      window.localStorage.getItem(MOBILE_PACKAGE_CACHE_STORAGE_KEY) ||
      window.sessionStorage.getItem(MOBILE_PACKAGE_CACHE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return {};

    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, MobilePublishPackageResult] =>
        Boolean(entry[0] && isMobilePublishPackageResult(entry[1]))
      )
    );
  } catch {
    return {};
  }
}

function writeMobilePackageCache(cache: Record<string, MobilePublishPackageResult>) {
  if (typeof window === "undefined") return;
  const serialized = JSON.stringify(cache);
  window.localStorage.setItem(MOBILE_PACKAGE_CACHE_STORAGE_KEY, serialized);
  window.sessionStorage.setItem(MOBILE_PACKAGE_CACHE_STORAGE_KEY, serialized);
}

function isMobilePublishPackageResult(value: unknown): value is MobilePublishPackageResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "packageId" in value &&
    typeof value.packageId === "string" &&
    "packageUrl" in value &&
    typeof value.packageUrl === "string" &&
    "imageUrls" in value &&
    Array.isArray(value.imageUrls)
  );
}

export function MatrixDashboard() {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [keywordSelection, setKeywordSelection] = useState(DEFAULT_KEYWORD_OPTION);
  const [targetAccountId, setTargetAccountId] = useState("A2");
  const [keywordAccountId, setKeywordAccountId] = useState("A2");
  const [draftAccountId, setDraftAccountId] = useState(DEFAULT_DRAFT_LIBRARY_ACCOUNT_ID);
  const [message, setMessage] = useState("下周六能搭一个 300 人年会舞台吗，大概多少钱？");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [xhsReferences, setXhsReferences] = useState<XhsReference[]>([]);
  const [images, setImages] = useState<EventwangImage[]>([]);
  const [reply, setReply] = useState<ReplyAnalysis | null>(null);
  const [scrapingHandshake, setScrapingHandshake] = useState<ScrapingHandshake | null>(null);
  const [eventwangGalleryResult, setEventwangGalleryResult] = useState<EventwangGalleryResult | null>(null);
  const [status, setStatus] = useState("待启动");
  const [mobilePublishPackage, setMobilePublishPackage] = useState<MobilePublishPackageResult | null>(null);
  const [mobilePublishPackageDraftId, setMobilePublishPackageDraftId] = useState<string | null>(null);
  const [draftPreviewLoadingId, setDraftPreviewLoadingId] = useState<string | null>(null);
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [workflowMode, setWorkflowMode] = useState<"review" | "auto">("review");
  const [activeWorkflowStep, setActiveWorkflowStep] = useState(0);
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStep[]>(resetWorkflowSteps());
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [xhsLoginStatus, setXhsLoginStatus] = useState<XhsLoginStatus | null>(null);
  const [xhsCdpStatus, setXhsCdpStatus] = useState<XhsCdpStatus | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>(() => createDefaultWorkspaceState("demo-user"));
  const [keywordPresets, setKeywordPresets] = useState<KeywordPreset[]>([]);
  const [keywordPresetText, setKeywordPresetText] = useState("");
  const [keywordDraftBatches, setKeywordDraftBatches] = useState<KeywordDraftBatch[]>([]);
  const [activeSection, setActiveSection] = useState<SectionId>("section-0");
  const [authChecked, setAuthChecked] = useState(false);
  const [localBrowserMode, setLocalBrowserMode] = useState(false);
  const [draftPreviewCache, setDraftPreviewCache] = useState<Record<string, DraftImage[]>>(() => readDraftPreviewCache());
  const [mobilePublishPackageCache, setMobilePublishPackageCache] = useState<Record<string, MobilePublishPackageResult>>(() =>
    readMobilePackageCache()
  );
  const [activeMetricKey, setActiveMetricKey] = useState<MetricKey | null>(null);
  const [currentBatch, setCurrentBatch] = useState<CurrentBatchState>(() => createEmptyBatchState());
  const draftDetailRef = useRef<HTMLElement | null>(null);
  const workflowJobRef = useRef<PersistedWorkflowJob | null>(null);
  const resumeStartedRef = useRef(false);
  const draftLoadRequestRef = useRef(0);
  const autoMobilePackageDraftIdsRef = useRef<Set<string>>(new Set());
  const draftImageHydrationPromisesRef = useRef<Map<string, Promise<Draft>>>(new Map());
  const draftPreviewHydrationAttemptedRef = useRef<Set<string>>(new Set());
  const draftPreviewCacheRef = useRef<Map<string, DraftImage[]>>(new Map(Object.entries(draftPreviewCache)));
  const mobilePublishPackageCacheRef = useRef<Map<string, MobilePublishPackageResult>>(
    new Map(Object.entries(mobilePublishPackageCache))
  );
  const mobilePackageInFlightDraftIdRef = useRef<string | null>(null);
  const xhsCdpStatusInFlightRef = useRef(false);
  const selectedDraftIdRef = useRef<string | null>(null);

  useEffect(() => {
    void bootstrapAuthState();
  }, [router]);

  useEffect(() => {
    setLocalBrowserMode(window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
  }, []);

  useEffect(() => {
    if (!authChecked || !authUser || resumeStartedRef.current) return;

    const job = readPersistedWorkflowJob(authUser.id);
    if (!job) return;
    if (job.accountId !== targetAccountId) {
      setTargetAccountId(job.accountId);
      setKeywordAccountId(job.accountId);
      setDraftAccountId(job.accountId);
      return;
    }

    resumeStartedRef.current = true;
    void resumePersistedWorkflow(job);
  }, [authChecked, authUser, targetAccountId]);

  useEffect(() => {
    if (authUser && authChecked) void loadKeywordPresets(authUser.id, keywordAccountId);
  }, [authChecked, authUser, keywordAccountId]);

  useEffect(() => {
    if (!authChecked) return;
    void refreshXhsCdpStatus(false);
  }, [authChecked]);

  useEffect(() => {
    if (!selectedDraftId) {
      setMobilePublishPackage(null);
      setMobilePublishPackageDraftId(null);
      return;
    }

    const cachedPackage = mobilePublishPackageCacheRef.current.get(selectedDraftId);
    if (cachedPackage) {
      setMobilePublishPackage(cachedPackage);
      setMobilePublishPackageDraftId(selectedDraftId);
      return;
    }

    if (mobilePublishPackageDraftId !== selectedDraftId) {
      setMobilePublishPackage(null);
      setMobilePublishPackageDraftId(null);
    }
  }, [selectedDraftId]);

  useEffect(() => {
    if (activeSection !== "section-3" || !selectedDraftId) return;

    draftDetailRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }, [activeSection, selectedDraftId]);

  const selectedCount = useMemo(() => drafts.filter((draft) => draft.status === "pending_review").length, [drafts]);
  const selectedContentDomain = useMemo(() => getContentDomain(targetAccountId), [targetAccountId]);
  const selectedDraft = useMemo(
    () => drafts.find((draft) => draft.id === selectedDraftId) ?? drafts[0] ?? null,
    [drafts, selectedDraftId]
  );

  useEffect(() => {
    selectedDraftIdRef.current = selectedDraft?.id ?? null;
  }, [selectedDraft?.id]);

  useEffect(() => {
    if (activeSection !== "section-3" || !selectedDraft) return;
    const activeMobilePackage = getActiveMobilePackageForDraft(selectedDraft.id);
    if (getDraftPreviewImages(selectedDraft, activeMobilePackage, getCachedDraftPreviewImages(selectedDraft)).length) return;
    if (draftPreviewHydrationAttemptedRef.current.has(selectedDraft.id)) return;

    draftPreviewHydrationAttemptedRef.current.add(selectedDraft.id);
    void prepareDraftMediaImages(selectedDraft, "preview");
  }, [activeSection, mobilePublishPackage, mobilePublishPackageDraftId, selectedDraft?.id]);

  useEffect(() => {
    if (activeSection !== "section-3" || !selectedDraft) return;
    if (mobilePublishPackageCacheRef.current.has(selectedDraft.id)) {
      const cachedPackage = mobilePublishPackageCacheRef.current.get(selectedDraft.id);
      if (cachedPackage && mobilePublishPackageDraftId !== selectedDraft.id) {
        setMobilePublishPackage(cachedPackage);
        setMobilePublishPackageDraftId(selectedDraft.id);
      }
      return;
    }
    if (autoMobilePackageDraftIdsRef.current.has(selectedDraft.id)) return;
    if (mobilePackageInFlightDraftIdRef.current) return;

    autoMobilePackageDraftIdsRef.current.add(selectedDraft.id);
    void createMobilePublishPackage({ draft: selectedDraft, source: "auto" });
  }, [activeSection, busyAction, selectedDraft]);
  const activeDraftBatchId = useMemo(
    () => currentBatch.batchId ?? findLatestDraftBatchId(drafts),
    [currentBatch.batchId, drafts]
  );
  const keywordSelectionLabel =
    keywordSelection === DEFAULT_KEYWORD_OPTION ? "默认随机" : keywordSelection || "未选择";
  const mobilePackageBusy = busyAction === "mobile-publish-package";
  const taskBusy = Boolean(busyAction && busyAction !== "mobile-publish-package");
  const workflowBusy = busyAction === "workflow" || busyAction === "workflow-step";
  const nextWorkflowStep = workflowSteps[activeWorkflowStep];
  const runningWorkflowStep = workflowSteps.find((step) => step.status === "running");
  const targetKeywordOptions = useMemo(() => buildKeywordOptions(keywordPresets, targetAccountId), [keywordPresets, targetAccountId]);
  const visibleKeywordPresets = useMemo(
    () => keywordPresets.filter((preset) => preset.accountId === keywordAccountId),
    [keywordAccountId, keywordPresets]
  );
  const visibleKeywordCount = useMemo(
    () => buildKeywordOptions(visibleKeywordPresets, keywordAccountId).length,
    [keywordAccountId, visibleKeywordPresets]
  );
  const hasDraftCandidateImages = useMemo(
    () => drafts.some((draft) => getDraftCandidateImageCount(draft) > 0),
    [drafts]
  );
  const workflowProgress = useMemo(
    () =>
      calculateWorkflowProgress(
        workflowSteps,
        runningWorkflowStep?.label ?? nextWorkflowStep?.label ?? "待启动",
        runningWorkflowStep?.detail ?? status
      ),
    [nextWorkflowStep, runningWorkflowStep, status, workflowSteps]
  );
  const globalChecks = useMemo<GlobalCheck[]>(
    () =>
      buildGlobalChecks({
        authReady: Boolean(authUser),
        bindingReady: workspaceState.binding.state === "bound",
        textScrapeReady:
          Boolean(xhsCdpStatus?.available && xhsCdpStatus.loggedIn) ||
          isConnectorReady(scrapingHandshake, "xhs-hotspot") ||
          Boolean(xhsLoginStatus?.loggedIn),
        imageScrapeReady:
          isConnectorReady(scrapingHandshake, "eventwang") ||
          Boolean(eventwangGalleryResult?.selectedCount),
        textGenerationReady: Boolean(workspaceState.prompts.textRemix.trim()),
        imageGenerationReady: Boolean(workspaceState.prompts.imageRemix.trim()) && (images.length > 0 || hasDraftCandidateImages)
      }),
    [authUser, eventwangGalleryResult, hasDraftCandidateImages, images.length, scrapingHandshake, workspaceState, xhsCdpStatus, xhsLoginStatus]
  );
  const eventwangConnector = useMemo(
    () => scrapingHandshake?.connectors.find((connector) => connector.key === "eventwang") ?? null,
    [scrapingHandshake]
  );
  const eventwangLoggedIn = eventwangIsLiveLoggedIn(eventwangConnector);
  const eventwangLiveCheck = eventwangConnector?.checks.find((check) => check.label.includes("真实在线"));
  const activeMetricDetails = activeMetricKey
    ? buildMetricDetails(activeMetricKey, currentBatch, xhsReferences, drafts)
    : null;

  useEffect(() => {
    setKeywordSelection(DEFAULT_KEYWORD_OPTION);
    setKeyword("");
  }, [targetAccountId]);

  function bootstrapAuthState() {
    const snapshot = readStoredAuthSession();
    if (!snapshot) {
      clearStoredAuthSession();
      router.replace("/login");
      return;
    }

    const cachedUser = snapshot.user;
    setAuthUser(cachedUser);
    setAuthChecked(true);
    void hydrateWorkspaceFromLocalSession(cachedUser);
    void refreshXhsLoginStatus();
    void refreshXhsCdpStatus(false);
    void runScrapingHandshake();
  }

  async function hydrateWorkspaceFromLocalSession(cachedUser: AuthUser) {
    const restoredAccountCode = await loadWorkspaceState(cachedUser.id);
    setTargetAccountId(restoredAccountCode);
    setKeywordAccountId(restoredAccountCode);
    setDraftAccountId(restoredAccountCode);
    await loadDrafts(restoredAccountCode, cachedUser.id);
    await loadKeywordPresets(cachedUser.id, restoredAccountCode);
  }

  function signOut() {
    clearStoredAuthSession();
    setAuthUser(null);
    setDrafts([]);
    setSelectedDraftId(null);
    setAuthChecked(false);
    router.replace("/login");
  }

  async function loadWorkspaceState(userId: string) {
    const response = await getJson<{
      state: WorkspaceState;
      lastAccountCode: string | null;
    }>(`/api/workspace-state?userId=${encodeURIComponent(userId)}`);

    if (response.ok && response.data) {
      setWorkspaceState(response.data.state);
      return response.data.lastAccountCode || targetAccountId;
    }

    return targetAccountId;
  }

  async function loadDrafts(accountCode: string, userId = authUser?.id) {
    const requestId = draftLoadRequestRef.current + 1;
    draftLoadRequestRef.current = requestId;
    let latestDrafts: Draft[] = [];

    const localResponse = await fetchDrafts(accountCode, null);
    if (requestId !== draftLoadRequestRef.current) return latestDrafts;
    if (localResponse.ok && localResponse.data) {
      latestDrafts = applyDraftLibraryResult(accountCode, localResponse.data);
    } else {
      setStatus(localResponse.error?.message || "草稿加载失败");
    }

    if (!userId) return latestDrafts;

    const response = await fetchDrafts(accountCode, userId);
    if (requestId !== draftLoadRequestRef.current) return latestDrafts;
    if (!response.ok || !response.data) {
      if (!localResponse.ok) setStatus(response.error?.message || "草稿加载失败");
      return latestDrafts;
    }

    return applyDraftLibraryResult(accountCode, response.data);
  }

  async function fetchDrafts(accountCode: string | null, userId?: string | null) {
    const params = new URLSearchParams();
    if (accountCode) params.set("accountId", accountCode);
    if (userId) params.set("userId", userId);
    return getJson<{ drafts: Draft[]; mode: string }>(`/api/drafts?${params.toString()}`);
  }

  function applyDraftLibraryResult(accountCode: string, data: { drafts: Draft[]; mode: string }) {
    setDrafts(data.drafts);
    setSelectedDraftId(data.drafts[0]?.id ?? null);
    const latestBatchId = findLatestDraftBatchId(data.drafts);
    if (latestBatchId) {
      setCurrentBatch((batch) => ({
        ...batch,
        batchId: batch.batchId ?? latestBatchId
      }));
    }
    setStatus(
      buildDraftLibraryStatus({
        accountId: accountCode,
        draftCount: data.drafts.length,
        mode: data.mode
      })
    );
    return data.drafts;
  }

  async function saveWorkspaceState() {
    if (!authUser) {
      setStatus("请先登录后保存 Prompt 和绑定状态");
      return;
    }

    setBusyAction("workspace-save");
    const response = await postJson<{ saved: boolean }>("/api/workspace-state", {
      userId: authUser.id,
      textRemixPrompt: workspaceState.prompts.textRemix,
      imageRemixPrompt: workspaceState.prompts.imageRemix,
      lastAccountCode: keywordAccountId
    });
    setBusyAction(null);
    setStatus(response.ok ? "Prompt 微调已保存" : response.error?.message || "保存失败");
  }

  async function saveBindingState(nextState: WorkspaceState["binding"]["state"], detail: string) {
    const nextBinding = { state: nextState, accountId: null, detail };
    setWorkspaceState((state) => ({ ...state, binding: nextBinding }));

    if (!authUser) {
      setStatus("绑定状态已在本地更新，登录后可持久保存");
      return;
    }

    const response = await postJson<{ saved: boolean }>("/api/binding-state", {
      userId: authUser.id,
      accountCode: null,
      state: nextState,
      detail
    });
    setStatus(response.ok ? detail : response.error?.message || "绑定状态保存失败");
  }

  async function loadKeywordPresets(userId: string, accountCode: string) {
    const response = await getJson<{ presets: KeywordPreset[] }>(
      `/api/keyword-presets?userId=${encodeURIComponent(userId)}&accountCode=${encodeURIComponent(accountCode)}`
    );

    if (response.ok && response.data) {
      const presets = response.data.presets;
      setKeywordPresets((current) => mergeKeywordPresetsForAccount(current, presets, accountCode));
      setKeywordDraftBatches(planKeywordDraftBatches(presets, accountCode));
    } else {
      setStatus(response.error?.message || "关键词预设加载失败");
    }
  }

  async function persistSelectedAccount(accountCode: string) {
    if (!authUser) return;

    const response = await postJson<{ saved: boolean }>("/api/workspace-state", {
      userId: authUser.id,
      textRemixPrompt: workspaceState.prompts.textRemix,
      imageRemixPrompt: workspaceState.prompts.imageRemix,
      lastAccountCode: accountCode
    });

    if (!response.ok) setStatus(response.error?.message || "领域选择保存失败");
  }

  function changeKeywordAccount(accountCode: string) {
    setKeywordAccountId(accountCode);
    setTargetAccountId(accountCode);
    setDraftAccountId(accountCode);
    setKeywordDraftBatches([]);
    setKeywordSelection(DEFAULT_KEYWORD_OPTION);
    setKeyword("");
    setCurrentBatch(createEmptyBatchState());
    setDrafts([]);
    setSelectedDraftId(null);
    setStatus(`关键词库已切换到 ${getContentDomain(accountCode)?.label} 领域`);
    void persistSelectedAccount(accountCode);
    void loadDrafts(accountCode, authUser?.id);
  }

  function changeDraftAccount(accountCode: string) {
    setDraftAccountId(accountCode);
    setDrafts([]);
    setSelectedDraftId(null);
    setMobilePublishPackage(null);
    setStatus(`草稿库已切换到 ${getContentDomain(accountCode)?.label} 领域`);
    void loadDrafts(accountCode, authUser?.id);
  }

  function resolveKeywordForRun(forceRefresh = false) {
    if (!forceRefresh && keyword.trim()) return keyword;

    const nextKeyword =
      keywordSelection === DEFAULT_KEYWORD_OPTION
        ? pickRandomKeyword(targetKeywordOptions) || ""
        : keywordSelection;

    if (!nextKeyword) {
      throw new Error("当前内容领域还没有可用关键词，请先到关键词库导入预设");
    }

    setKeyword(nextKeyword);
    return nextKeyword;
  }

  async function addKeywordPreset() {
    if (!authUser) {
      setStatus("请先登录后添加关键词预设");
      return;
    }
    if (!keywordPresetText.trim()) {
      setStatus("请输入关键词文本");
      return;
    }

    setBusyAction("keyword-preset");
    const response = await postJson<{ preset: KeywordPreset }>("/api/keyword-presets", {
      userId: authUser.id,
      accountCode: keywordAccountId,
      rawText: keywordPresetText
    });
    setBusyAction(null);

    if (!response.ok || !response.data) {
      setStatus(response.error?.message || "关键词预设保存失败");
      return;
    }

    const nextPresets = [response.data.preset, ...keywordPresets];
    setKeywordPresetText("");
    setKeywordPresets(nextPresets);
    setKeywordDraftBatches(planKeywordDraftBatches(nextPresets, keywordAccountId));
    setTargetAccountId(keywordAccountId);
    setKeywordSelection(response.data.preset.keywords[0] ?? DEFAULT_KEYWORD_OPTION);
    setKeyword(response.data.preset.keywords[0] ?? "");
    setActiveSection("section-0");
    void persistSelectedAccount(keywordAccountId);
    setStatus(`关键词预设已保存，并已同步到 ${getContentDomain(keywordAccountId)?.label} 领域的工作台关键词选项`);
  }

  function updateWorkflowStep(key: WorkflowStep["key"], stepStatus: WorkflowStep["status"], detail: string) {
    setWorkflowSteps((steps) => steps.map((step) => (step.key === key ? { ...step, status: stepStatus, detail } : step)));
  }

  function markRunningStepFailed(detail: string) {
    setWorkflowSteps((steps) =>
      steps.map((step) => (step.status === "running" ? { ...step, status: "failed", detail } : step))
    );
  }

  async function refreshXhsLoginStatus(fresh = false): Promise<XhsLoginStatus> {
    setBusyAction((current) => (current ? current : "login-status"));
    const response = await getJson<XhsLoginStatus>(`/api/xhs/session${fresh ? "?fresh=1" : ""}`);
    setBusyAction((current) => (current === "login-status" ? null : current));

    if (!response.ok || !response.data) {
      const fallback = {
        loggedIn: false,
        savedLogin: false,
        riskBlocked: false,
        storageStatePath: ".auth/xhs.json",
        lastSavedAt: null,
        detail: response.error?.message || "未检测到登录态"
      };
      setXhsLoginStatus(fallback);
      return fallback;
    }

    setXhsLoginStatus(response.data);
    return response.data;
  }

  async function startXhsManualLogin() {
    if (!localBrowserMode) {
      setStatus("当前是公网版，不能远程打开你电脑上的登录窗口；请回到 localhost 本机版执行");
      return;
    }
    setBusyAction("xhs-login");
    const response = await postJson<{ started: boolean; message: string }>("/api/xhs/login/start", {});
    setBusyAction(null);

    if (!response.ok || !response.data) {
      setStatus(response.error?.message || "小红书登录窗口启动失败");
      return;
    }

    setStatus(response.data.message);
  }

  async function refreshXhsCdpStatus(showBusy = true): Promise<XhsCdpStatus | null> {
    if (xhsCdpStatusInFlightRef.current) return xhsCdpStatus;

    xhsCdpStatusInFlightRef.current = true;
    if (showBusy) setBusyAction("xhs-cdp-status");

    try {
      const response = await getJson<XhsCdpStatus>("/api/xhs/cdp/status");

      if (!response.ok || !response.data) {
        if (showBusy) setStatus(response.error?.message || "真实浏览器状态检测失败");
        return null;
      }

      setXhsCdpStatus(response.data);
      if (showBusy) setStatus(response.data.message);
      return response.data;
    } finally {
      xhsCdpStatusInFlightRef.current = false;
      if (showBusy) setBusyAction(null);
    }
  }

  async function startXhsCdpBrowser() {
    setBusyAction("xhs-cdp-start");
    const response = await postJson<{ started: boolean; message: string; cdpUrl: string }>("/api/xhs/cdp/start", {});
    setBusyAction(null);

    if (!response.ok || !response.data) {
      setStatus(response.error?.message || "真实浏览器启动失败");
      return;
    }

    setStatus(response.data.message);
    [1200, 3000, 6000].forEach((delayMs) => {
      window.setTimeout(() => {
        void refreshXhsCdpStatus(false);
      }, delayMs);
    });
  }

  async function handleXhsCdpCardClick() {
    const latestStatus = await refreshXhsCdpStatus(true);
    if (latestStatus?.available && latestStatus.loggedIn) {
      return;
    }

    if (localBrowserMode) {
      void startXhsCdpBrowser();
      return;
    }

    setStatus("公网版不能拉起本机真实浏览器，请在 localhost 本机版打开");
  }

  async function startEventwangManualLogin() {
    if (!localBrowserMode) {
      setStatus("当前是公网版，不能远程打开你电脑上的活动汪登录窗口；请回到 localhost 本机版执行");
      return;
    }

    setBusyAction("eventwang-login");
    const response = await postJson<{ started: boolean; message: string }>("/api/eventwang/login/start", {});
    setBusyAction(null);

    if (!response.ok || !response.data) {
      setStatus(response.error?.message || "活动汪登录窗口启动失败");
      return;
    }

    setStatus(response.data.message);
  }

  function openHostedLoginPage(url: string, label: string) {
    window.open(url, "_blank", "noopener,noreferrer");
    setStatus(`已打开${label}官网；该浏览器登录仅供手动查看，不会回写本机采集登录态`);
  }

  function handleXhsLoginCardClick() {
    if (xhsLoginStatus?.loggedIn) {
      void refreshXhsLoginStatus(true);
      return;
    }

    if (localBrowserMode) {
      void startXhsManualLogin();
    } else {
      openHostedLoginPage("https://www.xiaohongshu.com/", "小红书");
    }
  }

  function handleEventwangLoginCardClick() {
    if (eventwangLoggedIn) {
      void refreshScrapingHandshake(true);
      return;
    }

    if (localBrowserMode) {
      void startEventwangManualLogin();
    } else {
      openHostedLoginPage("https://www.eventwang.cn/Gallery", "活动汪");
    }
  }

  function saveWorkflowCheckpoint(input: {
    keyword?: string;
    activeWorkflowStep?: number;
    currentBatch?: CurrentBatchState;
    references?: XhsReference[];
    images?: EventwangImage[];
    drafts?: Draft[];
    eventwangGalleryResult?: EventwangGalleryResult | null;
    batchMetadata?: DraftBatchMetadata;
  }) {
    const previous = workflowJobRef.current;
    const next: PersistedWorkflowJob = {
      version: WORKFLOW_JOB_VERSION,
      state: "active",
      userId: authUser?.id,
      accountId: targetAccountId,
      keyword: input.keyword ?? previous?.keyword ?? keyword,
      activeWorkflowStep: input.activeWorkflowStep ?? previous?.activeWorkflowStep ?? activeWorkflowStep,
      currentBatch: input.currentBatch ?? previous?.currentBatch ?? currentBatch,
      references: input.references ?? previous?.references ?? xhsReferences,
      images: input.images ?? previous?.images ?? images,
      drafts: input.drafts ?? previous?.drafts ?? drafts,
      eventwangGalleryResult: Object.prototype.hasOwnProperty.call(input, "eventwangGalleryResult")
        ? input.eventwangGalleryResult ?? null
        : previous?.eventwangGalleryResult ?? eventwangGalleryResult,
      batchMetadata: input.batchMetadata ?? previous?.batchMetadata,
      updatedAt: new Date().toISOString()
    };

    workflowJobRef.current = next;
    writePersistedWorkflowJob(next);
  }

  function clearWorkflowCheckpoint() {
    clearPersistedWorkflowJob(authUser?.id);
    workflowJobRef.current = null;
  }

  function restoreWorkflowJobState(job: PersistedWorkflowJob) {
    workflowJobRef.current = job;
    setWorkflowMode("auto");
    setKeyword(job.keyword);
    setTargetAccountId(job.accountId);
    setKeywordAccountId(job.accountId);
    setDraftAccountId(job.accountId);
    setActiveWorkflowStep(job.activeWorkflowStep);
    setWorkflowSteps(workflowStepsForCheckpoint(job.activeWorkflowStep));
    setCurrentBatch(job.currentBatch);
    setXhsReferences(job.references);
    setImages(job.images);
    setDrafts(job.drafts);
    setSelectedDraftId(job.drafts[0]?.id ?? null);
    setEventwangGalleryResult(job.eventwangGalleryResult);
    setMobilePublishPackage(null);
    setActiveSection(job.activeWorkflowStep >= 4 ? "section-3" : "section-0");
  }

  async function resumePersistedWorkflow(job: PersistedWorkflowJob) {
    restoreWorkflowJobState(job);
    setBusyAction("workflow");
    setStatus(`检测到未完成的一键生成任务，正在从第 ${job.activeWorkflowStep + 1} 步继续`);

    let references = job.references;
    let eventwangImages = job.images;
    let nextDrafts = job.drafts;
    let insertedCount = nextDrafts.length;
    let batchMetadata = job.batchMetadata ?? draftBatchMetadataFromCurrentBatch(job.currentBatch, job.keyword);
    let batchState = job.currentBatch;

    try {
      if (job.activeWorkflowStep <= 0) {
        await prepareXhsCdpForUnattendedRun();
        const materialResult = await runMaterialStep(job.keyword);
        references = materialResult.references;
        eventwangImages = materialResult.eventwangImages;
        batchMetadata = materialResult.batchMetadata;
        batchState = materialResult.currentBatch;
        saveWorkflowCheckpoint({
          keyword: job.keyword,
          activeWorkflowStep: 1,
          references,
          images: eventwangImages,
          currentBatch: batchState,
          eventwangGalleryResult: materialResult.eventwangGalleryResult,
          batchMetadata
        });
      }

      if (job.activeWorkflowStep <= 1) {
        nextDrafts = await runTextStep(references, job.keyword, batchMetadata);
        saveWorkflowCheckpoint({
          keyword: job.keyword,
          activeWorkflowStep: 2,
          references,
          images: eventwangImages,
          drafts: nextDrafts,
          currentBatch: { ...batchState, draftCount: nextDrafts.length, status: "文案生成完成" },
          batchMetadata
        });
      }

      if (job.activeWorkflowStep <= 2) {
        nextDrafts = await runImageStep(nextDrafts, eventwangImages);
        saveWorkflowCheckpoint({
          keyword: job.keyword,
          activeWorkflowStep: 3,
          references,
          images: eventwangImages,
          drafts: nextDrafts,
          currentBatch: { ...batchState, draftCount: nextDrafts.length, status: "原图配图完成" },
          batchMetadata
        });
      }

      if (job.activeWorkflowStep <= 3) {
        insertedCount = await runDraftStep(nextDrafts);
        saveWorkflowCheckpoint({
          keyword: job.keyword,
          activeWorkflowStep: 4,
          references,
          images: eventwangImages,
          drafts: nextDrafts,
          currentBatch: { ...batchState, draftCount: insertedCount, status: "草稿已入库" },
          batchMetadata
        });
      }

      runSendStep(insertedCount || nextDrafts.length);
      clearWorkflowCheckpoint();
    } catch (error) {
      clearWorkflowCheckpoint();
      setStatus(error instanceof Error ? error.message : "流程执行失败");
      markRunningStepFailed(error instanceof Error ? error.message : "执行失败");
    } finally {
      setBusyAction(null);
    }
  }

  async function runMaterialToXhsWorkflow() {
    if (taskBusy) return;
    const workflowKeyword = resolveKeywordForRun(true);
    const initialBatch = createEmptyBatchState();
    setWorkflowMode("auto");
    setBusyAction("workflow");
    setDraftAccountId(targetAccountId);
    setStatus(`一键生成中，本次关键词：${workflowKeyword}`);
    setActiveWorkflowStep(0);
    setWorkflowSteps(resetWorkflowSteps());
    setCurrentBatch(initialBatch);
    saveWorkflowCheckpoint({
      keyword: workflowKeyword,
      activeWorkflowStep: 0,
      currentBatch: initialBatch,
      references: [],
      images: [],
      drafts: [],
      eventwangGalleryResult: null
    });

    try {
      await prepareXhsCdpForUnattendedRun();
      const materialResult = await runMaterialStep(workflowKeyword);
      saveWorkflowCheckpoint({
        keyword: workflowKeyword,
        activeWorkflowStep: 1,
        references: materialResult.references,
        images: materialResult.eventwangImages,
        currentBatch: materialResult.currentBatch,
        eventwangGalleryResult: materialResult.eventwangGalleryResult,
        batchMetadata: materialResult.batchMetadata
      });
      const nextDrafts = await runTextStep(materialResult.references, workflowKeyword, materialResult.batchMetadata);
      saveWorkflowCheckpoint({
        keyword: workflowKeyword,
        activeWorkflowStep: 2,
        references: materialResult.references,
        images: materialResult.eventwangImages,
        drafts: nextDrafts,
        currentBatch: { ...materialResult.currentBatch, draftCount: nextDrafts.length, status: "文案生成完成" },
        eventwangGalleryResult: materialResult.eventwangGalleryResult,
        batchMetadata: materialResult.batchMetadata
      });
      const draftsWithImages = await runImageStep(nextDrafts, materialResult.eventwangImages);
      saveWorkflowCheckpoint({
        keyword: workflowKeyword,
        activeWorkflowStep: 3,
        references: materialResult.references,
        images: materialResult.eventwangImages,
        drafts: draftsWithImages,
        currentBatch: { ...materialResult.currentBatch, draftCount: draftsWithImages.length, status: "原图配图完成" },
        eventwangGalleryResult: materialResult.eventwangGalleryResult,
        batchMetadata: materialResult.batchMetadata
      });
      const insertedCount = await runDraftStep(draftsWithImages);
      saveWorkflowCheckpoint({
        keyword: workflowKeyword,
        activeWorkflowStep: 4,
        references: materialResult.references,
        images: materialResult.eventwangImages,
        drafts: draftsWithImages,
        currentBatch: { ...materialResult.currentBatch, draftCount: insertedCount, status: "草稿已入库" },
        eventwangGalleryResult: materialResult.eventwangGalleryResult,
        batchMetadata: materialResult.batchMetadata
      });
      runSendStep(insertedCount);
      clearWorkflowCheckpoint();
    } catch (error) {
      clearWorkflowCheckpoint();
      setStatus(error instanceof Error ? error.message : "流程执行失败");
      markRunningStepFailed(error instanceof Error ? error.message : "执行失败");
    } finally {
      setBusyAction(null);
    }
  }

  async function prepareXhsCdpForUnattendedRun() {
    updateWorkflowStep("material", "running", "准备小红书真实浏览器 CDP");
    const latestStatus = await refreshXhsCdpStatus(false);
    if (latestStatus?.available && latestStatus.loggedIn) return true;

    if (!localBrowserMode) {
      setStatus("公网版无法自动拉起本机 Edge CDP，本次会尝试 storageState 备用采集");
      return false;
    }

    const response = await postJson<{ started: boolean; message: string; cdpUrl: string }>("/api/xhs/cdp/start", {});
    if (!response.ok || !response.data) {
      setStatus(response.error?.message || "真实浏览器启动失败，本次会尝试 storageState 备用采集");
      return false;
    }

    setStatus("已请求启动 Edge CDP，等待 9222 端口进入可用状态");
    for (const delayMs of [1500, 3000, 5000]) {
      await waitMs(delayMs);
      const statusAfterStart = await refreshXhsCdpStatus(false);
      if (statusAfterStart?.available && statusAfterStart.loggedIn) {
        setStatus(`真实浏览器 CDP 已连接并已登录，小红书页面 ${statusAfterStart.xhsPageCount} 个`);
        return true;
      }
    }

    setStatus("真实浏览器 CDP 暂未连上，本次会继续尝试 storageState 备用采集");
    return false;
  }

  async function runNextWorkflowStep() {
    if (taskBusy) return;
    setWorkflowMode("review");
    setBusyAction("workflow-step");
    setDraftAccountId(targetAccountId);

    try {
      if (activeWorkflowStep === 0) {
        await runMaterialStep(resolveKeywordForRun(true));
      } else if (activeWorkflowStep === 1) {
        await runTextStep(xhsReferences, resolveKeywordForRun());
      } else if (activeWorkflowStep === 2) {
        await runImageStep(drafts);
      } else if (activeWorkflowStep === 3) {
        await runDraftStep(drafts);
      } else {
        runSendStep(selectedCount || drafts.length);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "流程执行失败");
      markRunningStepFailed(error instanceof Error ? error.message : "执行失败");
    } finally {
      setBusyAction(null);
    }
  }

  async function runMaterialStep(currentKeyword: string) {
    updateWorkflowStep("material", "running", "真实在线检测中");
    setXhsReferences([]);
    setImages([]);
    setEventwangGalleryResult(null);
    setMobilePublishPackage(null);
    const handshake = await ensureScrapeConnectorsReady();
    if (!handshake) throw new Error("全局检测失败，请先刷新全局检测");

    const blocker = getMaterialHardBlocker(handshake.connectors);
    if (blocker) {
      updateWorkflowStep("material", "failed", blocker);
      throw new Error(blocker);
    }

    const batchMetadata = createDraftBatchMetadata({ keyword: currentKeyword });
    const searchTerms = buildCoreSearchTerms(currentKeyword, 3);
    const eventwangSearchTerms = buildEventwangFallbackSearchTerms(currentKeyword, targetKeywordOptions, 8);
    const collectingBatch = {
      batchId: batchMetadata.batchId,
      batchCreatedAt: batchMetadata.batchCreatedAt,
      keyword: currentKeyword,
      searchTerms: eventwangSearchTerms,
      referenceCount: 0,
      draftCount: 0,
      keywordCount: eventwangSearchTerms.length,
      imageCount: 0,
      status: "素材采集中",
      xhsSkippedReason: null
    };
    setCurrentBatch(collectingBatch);

    let xhsItems: XhsReference[] = [];
    let xhsItemCount = 0;
    let xhsSkippedReason: string | null = null;

    updateWorkflowStep("material", "running", `小红书真实浏览器采集中：${searchTerms.join(" / ")}`);
    setStatus(`正在按核心搜索词采集小红书热门文案：${searchTerms.join(" / ")}`);

    const xhsResponse = await postJsonWithWorkflowRetry<{
      items: XhsReference[];
      itemCount: number;
      strategy?: "cdp" | "storageState";
      fallbackReason?: string;
    }>({
      url: "/api/xhs/scrape",
      body: {
        keyword: currentKeyword,
        keywordAlternates: searchTerms.slice(1),
        limit: TEST_XHS_REFERENCE_LIMIT
      },
      label: "小红书热门文案采集",
      stepKey: "material"
    });

    if (xhsResponse.ok && xhsResponse.data) {
      xhsItems = xhsResponse.data.items;
      xhsItemCount = xhsResponse.data.itemCount;
      xhsSkippedReason = xhsResponse.data.fallbackReason ?? null;
    } else {
      xhsSkippedReason = xhsResponse.error?.message || "小红书参考采集失败，已降级使用活动汪素材";
    }

    updateWorkflowStep("material", "running", `${xhsSkippedReason ? "小红书参考已跳过" : `小红书 ${xhsItemCount} 条`}，活动汪核心词采集中`);
    setStatus(`正在按核心搜索词采集活动汪图库原图：${searchTerms.join(" / ")}`);
    const eventwangResponse = await postJsonWithWorkflowRetry<EventwangGalleryResult>({
      url: "/api/materials/collect-eventwang-free",
      body: {
        accountId: targetAccountId,
        keyword: currentKeyword,
        keywordAlternates: eventwangSearchTerms.slice(1),
        limit: TEST_EVENTWANG_IMAGE_LIMIT,
        maxCandidates: TEST_EVENTWANG_MAX_CANDIDATES,
        quickMode: true
      },
      label: "活动汪图库原图采集",
      stepKey: "material"
    });

    if (!eventwangResponse.ok || !eventwangResponse.data) {
      throw new Error(eventwangResponse.error?.message || "活动汪图库采集失败");
    }

    const usabilityError = getEventwangUsabilityError(eventwangResponse.data);
    if (usabilityError && eventwangResponse.data.selectedCount <= 0) {
      updateWorkflowStep("material", "running", usabilityError);
      setStatus(usabilityError);
    } else if (usabilityError) {
      updateWorkflowStep("material", "failed", usabilityError);
      throw new Error(usabilityError);
    }

    const eventwangImages = eventwangResponse.data.items.map((item) => ({
      url: buildEventwangMediaUrl(item.localPath) || item.previewUrl || "",
      alt: item.tagName || item.styleTag,
      sourceUrl: item.detailUrl,
      localPath: item.localPath,
      styleTag: item.styleTag,
      styleBucket: item.styleBucket
    })).filter((image) => image.url);
    const eventwangQuotaFallbackStatus = buildEventwangQuotaFallbackStatus(
      eventwangResponse.data,
      eventwangImages.length,
      TEST_EVENTWANG_IMAGE_LIMIT
    );
    const eventwangPartialStatus =
      eventwangQuotaFallbackStatus ??
      eventwangResponse.data.blockingReason ??
      buildEventwangPartialStatus({
        imageCount: eventwangImages.length,
        targetCount: TEST_EVENTWANG_IMAGE_LIMIT,
        duplicateSkipCount:
          eventwangResponse.data.duplicateSkipCount ?? countEventwangDuplicateSkips(eventwangResponse.data.skipped),
        fallbackKeywordsUsed: eventwangResponse.data.fallbackKeywordsUsed ?? []
      });
    if (!eventwangImages.length) {
      updateWorkflowStep("material", "running", "活动汪本次未采到可用原图，继续生成文案草稿");
    }
    if (!eventwangImages.length && eventwangQuotaFallbackStatus) {
      updateWorkflowStep("material", "running", eventwangQuotaFallbackStatus);
    }
    const references = [...xhsItems, ...buildEventwangReferences(eventwangResponse.data)];

    setImages(eventwangImages);
    setXhsReferences(references);
    setEventwangGalleryResult(eventwangResponse.data);
    const completedBatch = {
      ...collectingBatch,
      referenceCount: references.length,
      imageCount: eventwangImages.length,
      status: "素材采集完成",
      xhsSkippedReason
    };
    setCurrentBatch(completedBatch);
    const eventwangSourceLabel = buildEventwangSourceLabel(eventwangResponse.data, eventwangImages.length, TEST_EVENTWANG_IMAGE_LIMIT);
    updateWorkflowStep(
      "material",
      "done",
      `${xhsSkippedReason ? "小红书参考跳过" : `小红书 ${xhsItemCount} 条`} / ${eventwangSourceLabel} / 搜索词 ${eventwangResponse.data.keyword}`
    );
    if (eventwangQuotaFallbackStatus) {
      setStatus(eventwangQuotaFallbackStatus);
    } else if (eventwangImages.length < TEST_EVENTWANG_IMAGE_LIMIT) {
      setStatus(eventwangPartialStatus);
    } else if (eventwangResponse.data.blockingReason && eventwangResponse.data.selectedCount === 0) {
      setStatus(`活动汪已阻断：${eventwangResponse.data.blockingReason}`);
    } else {
      setStatus(`素材采集完成：实际活动汪搜索词“${eventwangResponse.data.keyword}”，准备二创测试`);
    }
    setActiveWorkflowStep(1);
    return { references, eventwangImages, batchMetadata, eventwangGalleryResult: eventwangResponse.data, currentBatch: completedBatch };
  }

  async function runTextStep(
    references: XhsReference[],
    currentKeyword: string,
    batchMetadata?: DraftBatchMetadata
  ) {
    if (!references.length) throw new Error("请先采集素材");
    const textPrompt = workspaceState.prompts.textRemix.trim();
    if (!textPrompt) throw new Error("文案 Prompt 为空，无法进入大模型生成");

    updateWorkflowStep("text", "running", "请求已提交，等待模型返回");
    setStatus(`大模型文案生成中，当前关键词：${currentKeyword}`);
    const remix = await postJsonWithWorkflowRetry<{ drafts: Draft[]; model: string }>({
      url: "/api/remix/drafts",
      body: {
        keyword: currentKeyword,
        references,
        accountId: targetAccountId,
        customPrompt: textPrompt,
        keywordCategory: keywordDraftBatches[0]?.category,
        keywordCategories: keywordDraftBatches.map((batch) => batch.category),
        count: TEST_DRAFT_COUNT
      },
      label: "文案二创生成",
      stepKey: "text"
    });

    if (!remix.ok || !remix.data) throw new Error(remix.error?.message || "文案二创失败");
    const remixData = remix.data;

    const activeBatch =
      batchMetadata ??
      (currentBatch.batchId && currentBatch.batchCreatedAt
        ? {
            batchId: currentBatch.batchId,
            batchCreatedAt: currentBatch.batchCreatedAt,
            batchKeyword: currentBatch.keyword || currentKeyword
          }
        : createDraftBatchMetadata({ keyword: currentKeyword }));
    const batchDrafts = attachDraftBatchMetadata(remixData.drafts, activeBatch).map((draft) => ({
      ...draft,
      readAt: null
    }));

    updateWorkflowStep("text", "running", "模型已返回，正在写入草稿状态");
    setDraftAccountId(targetAccountId);
    setDrafts(batchDrafts);
    setSelectedDraftId(batchDrafts[0]?.id ?? null);
    setCurrentBatch((batch) => ({
      ...batch,
      batchId: activeBatch.batchId,
      batchCreatedAt: activeBatch.batchCreatedAt,
      keyword: activeBatch.batchKeyword || currentKeyword,
      draftCount: batchDrafts.length,
      status: "文案生成完成"
    }));
    updateWorkflowStep("text", "done", `${batchDrafts.length} 篇`);
    setActiveWorkflowStep(2);
    setStatus("文案已生成");
    return batchDrafts;
  }

  async function runImageStep(nextDrafts: Draft[], imagePool = images) {
    if (!nextDrafts.length) throw new Error("请先生成文案");

    if (!imagePool.length) {
      updateWorkflowStep("image", "done", "活动汪本次没有可用原图，草稿先以文案入库");
      setActiveWorkflowStep(3);
      setStatus("活动汪本次没有可用原图，已继续输出文案草稿；后续补图后再生成发布码");
      return nextDrafts;
    }
    if (!workspaceState.prompts.imageRemix.trim()) throw new Error("图片 Prompt 为空，无法进入图片工作流");

    updateWorkflowStep("image", "running", "活动汪原图应用中");
    setStatus("正在把活动汪原图应用到草稿候选图");
    const imageAssignment = await postJsonWithWorkflowRetry<DraftImageAssignmentResult>({
      url: "/api/draft-images/assign",
      body: {
        drafts: nextDrafts.map((draft) => ({ id: draft.id })),
        images: imagePool,
        imagesPerDraft: IMAGES_PER_DRAFT,
        allowPartial: true
      },
      label: "活动汪原图去重分配",
      stepKey: "image"
    });
    if (!imageAssignment.ok || !imageAssignment.data) {
      throw new Error(imageAssignment.error?.message || "活动汪原图分配失败");
    }

    const imagePlacements = imageAssignment.data.assignments;
    const draftsWithImages = nextDrafts.map((draft) => ({
      ...draft,
      generatedImages: imagePlacements.find((result) => result.draftId === draft.id)?.images ?? []
    }));
    const missingImageCount = imageAssignment.data.missingImageCount;
    setDraftAccountId(targetAccountId);
    setDrafts(draftsWithImages);
    setSelectedDraftId(draftsWithImages[0]?.id ?? null);
    setCurrentBatch((batch) => ({
      ...batch,
      draftCount: draftsWithImages.length,
      status: "原图配图完成"
    }));
    updateWorkflowStep(
      "image",
      "done",
      missingImageCount
        ? `${imagePlacements.length} 篇草稿已尽量配图，缺 ${missingImageCount} 张`
        : `${imagePlacements.length} 篇草稿已配图，每篇${IMAGES_PER_DRAFT}张候选图`
    );
    setActiveWorkflowStep(3);
    setStatus(
      missingImageCount
        ? `活动汪原图不足：已配 ${imageAssignment.data.assignedImageCount} 张，缺 ${missingImageCount} 张；请重新采集补足候选图`
        : `活动汪原图已应用到草稿：${imageAssignment.data.assignedImageCount} 张，已写入历史去重记录`
    );
    return draftsWithImages;
  }

  async function runDraftStep(nextDrafts: Draft[]) {
    if (!nextDrafts.length) throw new Error("请先生成草稿");

    updateWorkflowStep("draft", "running", "草稿入库中");
    setStatus("草稿库入库中，等待存储返回");
    const saved = await postJsonWithWorkflowRetry<{ insertedCount: number; drafts: Draft[] }>({
      url: "/api/drafts",
      body: {
        drafts: nextDrafts,
        userId: authUser?.id,
        accountId: targetAccountId
      },
      label: "草稿入库",
      stepKey: "draft"
    });

    if (!saved.ok || !saved.data) throw new Error(saved.error?.message || "草稿保存失败");
    const savedData = saved.data;

    setDraftAccountId(targetAccountId);
    setDrafts(savedData.drafts);
    setSelectedDraftId(savedData.drafts[0]?.id ?? null);
    setCurrentBatch((batch) => ({
      ...batch,
      draftCount: savedData.insertedCount,
      status: "草稿已入库"
    }));
    updateWorkflowStep("draft", "done", `${savedData.insertedCount} 篇`);
    setActiveWorkflowStep(4);
    setStatus("草稿已入库");
    return savedData.insertedCount;
  }

  function runSendStep(sendCount: number) {
    updateWorkflowStep("send", "running", "等待选择草稿生成手机三步发布码");
    updateWorkflowStep("send", "done", `${sendCount} 篇本地草稿，选择后生成手机三步发布码`);
    setCurrentBatch((batch) => ({
      ...batch,
      draftCount: sendCount,
      status: "等待手机发布"
    }));
    setActiveWorkflowStep(4);
    setActiveSection("section-3");
    setStatus("草稿已入库，请选择一篇生成手机三步发布码；不会自动发布");
  }

  async function handleDraftRowClick(draft: Draft) {
    setSelectedDraftId(draft.id);
    void prepareDraftMediaImages(draft, "preview");
    if (draft.readAt) return;

    const readAt = new Date().toISOString();
    setDrafts((current) => current.map((item) => (item.id === draft.id ? { ...item, readAt } : item)));

    const response = await patchJson<{ drafts: Draft[]; readAt: string }>("/api/drafts", {
      draftId: draft.id,
      readAt,
      userId: authUser?.id,
      accountId: draftAccountId
    });

    if (response.ok && response.data) {
      setDrafts(response.data.drafts);
      return;
    }

    setStatus(response.error?.message || "草稿已读状态保存失败");
  }

  function cacheDraftPreviewImages(draftId: string, images: DraftImage[]) {
    const cachedImages = mergeDraftPreviewImages(draftPreviewCacheRef.current.get(draftId) ?? [], images);
    if (!cachedImages.length) return;

    draftPreviewCacheRef.current.set(draftId, cachedImages);
    setDraftPreviewCache((current) => {
      const next = { ...current, [draftId]: cachedImages };
      writeDraftPreviewCache(next);
      return next;
    });
  }

  function cacheMobilePublishPackage(draftId: string, publishPackage: MobilePublishPackageResult) {
    mobilePublishPackageCacheRef.current.set(draftId, publishPackage);
    setMobilePublishPackageCache((current) => {
      const next = { ...current, [draftId]: publishPackage };
      writeMobilePackageCache(next);
      return next;
    });
  }

  function getCachedDraftPreviewImages(draft: Draft) {
    return draftPreviewCache[draft.id] ?? draftPreviewCacheRef.current.get(draft.id) ?? [];
  }

  function getActiveMobilePackageForDraft(draftId: string) {
    if (mobilePublishPackageDraftId === draftId && mobilePublishPackage) return mobilePublishPackage;
    return mobilePublishPackageCacheRef.current.get(draftId) ?? null;
  }

  async function deleteDraft(draft: Draft) {
    if (!window.confirm(`确认删除草稿《${draft.title}》吗？`)) return;

    const previousDrafts = drafts;
    const nextDrafts = drafts.filter((item) => item.id !== draft.id);
    const deletedSelectedDraft = selectedDraftId === draft.id;

    setDeletingDraftId(draft.id);
    setDrafts(nextDrafts);
    draftPreviewCacheRef.current.delete(draft.id);
    mobilePublishPackageCacheRef.current.delete(draft.id);
    setDraftPreviewCache((current) => {
      const { [draft.id]: _deleted, ...next } = current;
      writeDraftPreviewCache(next);
      return next;
    });
    setMobilePublishPackageCache((current) => {
      const { [draft.id]: _deleted, ...next } = current;
      writeMobilePackageCache(next);
      return next;
    });
    if (deletedSelectedDraft) {
      setSelectedDraftId(nextDrafts[0]?.id ?? null);
      setMobilePublishPackage(null);
      setMobilePublishPackageDraftId(null);
      setDraftPreviewLoadingId(null);
    }

    const response = await deleteJson<{ drafts: Draft[]; deletedDraftId: string }>("/api/drafts", {
      draftId: draft.id,
      userId: authUser?.id,
      accountId: draftAccountId
    });

    setDeletingDraftId(null);
    if (response.ok && response.data) {
      setDrafts(response.data.drafts);
      if (deletedSelectedDraft) setSelectedDraftId(response.data.drafts[0]?.id ?? null);
      setStatus("草稿已删除");
      return;
    }

    setDrafts(previousDrafts);
    if (deletedSelectedDraft) setSelectedDraftId(draft.id);
    setStatus(response.error?.message || "草稿删除失败");
  }

  async function prepareDraftMediaImages(draft: Draft, mode: "preview" | "package" = "package") {
    const usesPublishImages = Boolean(draft.publishImages?.some((image) => image.url?.trim() || image.localPath?.trim()));
    const existingImages = getUsableDraftPublishImages(draft);
    const requiredImageCount = mode === "preview" ? EVENTWANG_IMAGE_POOL_MIN_IMAGES_PER_DRAFT : IMAGES_PER_DRAFT;
    if (existingImages.length >= requiredImageCount) return draft;

    if (mode === "preview") {
      const cachedImages = draftPreviewCacheRef.current.get(draft.id) ?? [];
      const cachedMergedImages = mergeDraftPreviewImages(existingImages, cachedImages);
      if (cachedMergedImages.length >= requiredImageCount) {
        return usesPublishImages
          ? { ...draft, publishImages: cachedMergedImages }
          : { ...draft, generatedImages: cachedMergedImages };
      }
    }

    const draftHydrationKey = `${draft.id}:${mode}`;
    const existingHydration = draftImageHydrationPromisesRef.current.get(draftHydrationKey);
    if (existingHydration) return existingHydration;

    const hydration = (async () => {
      setDraftPreviewLoadingId(draft.id);
      try {
        const mediaKeyword = draft.batchKeyword || currentBatch.keyword || keyword || draft.topic || draft.title;
        const neededImageCount = Math.max(0, IMAGES_PER_DRAFT - existingImages.length);
        const requestImageLimit = mode === "package" ? neededImageCount : IMAGES_PER_DRAFT;
        setStatus(
          mode === "preview"
            ? `正在加载草稿预览图：当前 ${existingImages.length}/${IMAGES_PER_DRAFT} 张图`
            : `当前草稿 ${existingImages.length}/${IMAGES_PER_DRAFT} 张图，正在优先从活动汪抓取原图，抓不满再本地兜底`
        );
        const mediaResponse = await postJson<EventwangGalleryResult>("/api/materials/collect-eventwang-free", {
          accountId: draftAccountId || targetAccountId,
          keyword: mediaKeyword,
          keywordAlternates: mode === "package" ? buildEventwangFallbackSearchTerms(mediaKeyword, targetKeywordOptions, 8).slice(1) : undefined,
          limit: requestImageLimit,
          maxCandidates: mode === "package" ? TEST_EVENTWANG_MAX_CANDIDATES : undefined,
          quickMode: mode === "package",
          poolOnly: mode === "preview"
        });

      if (!mediaResponse.ok || !mediaResponse.data) {
        setStatus(mediaResponse.error?.message || (mode === "preview" ? "草稿预览图加载失败" : "活动汪原图补图失败，继续生成手机发布包"));
        return draft;
      }

      const candidateImages = buildEventwangImages(mediaResponse.data);
      if (!candidateImages.length || neededImageCount <= 0) {
        setStatus(
          mode === "preview"
            ? `本地图片池暂无当前板块可用图，当前草稿 ${existingImages.length}/${IMAGES_PER_DRAFT} 张图`
            : `活动汪和本地图片池暂未补到可用图，将用当前 ${existingImages.length}/${IMAGES_PER_DRAFT} 张图继续生成手机发布包`
        );
        return draft;
      }

      if (mode === "preview") {
        const addedImages = buildDraftPreviewImagesFromCandidates(candidateImages, existingImages.length, neededImageCount);
        if (!addedImages.length) return draft;

        const enrichedImages = mergeDraftPreviewImages(existingImages, addedImages);
        const enrichedDraft = usesPublishImages
          ? { ...draft, publishImages: enrichedImages }
          : { ...draft, generatedImages: enrichedImages };

        cacheDraftPreviewImages(draft.id, enrichedImages);
        setStatus(`草稿预览图已从本地缓存加载：${getDraftPublishImages(enrichedDraft).length}/${IMAGES_PER_DRAFT} 张`);
        return enrichedDraft;
      }

      const imageAssignment = await postJson<DraftImageAssignmentResult>("/api/draft-images/assign", {
        drafts: [{ id: draft.id }],
        images: candidateImages,
        imagesPerDraft: neededImageCount,
        allowPartial: true
      });

      if (!imageAssignment.ok || !imageAssignment.data) {
        setStatus(imageAssignment.error?.message || "候选图补图分配失败，继续生成手机发布包");
        return draft;
      }

      const addedImages = imageAssignment.data.assignments[0]?.images ?? [];
      if (!addedImages.length) return draft;

      const enrichedImages = mergeDraftPreviewImages(existingImages, addedImages);
      const enrichedDraft = usesPublishImages
        ? { ...draft, publishImages: enrichedImages }
        : { ...draft, generatedImages: enrichedImages };

      cacheDraftPreviewImages(draft.id, enrichedImages);
      setDrafts((current) => current.map((item) => (item.id === draft.id ? enrichedDraft : item)));
      setStatus(
        `草稿补图完成：当前草稿 ${getDraftPublishImages(enrichedDraft).length}/${IMAGES_PER_DRAFT} 张图；本次${buildEventwangSourceLabel(
          mediaResponse.data,
          candidateImages.length,
          requestImageLimit
        )}，将继续生成手机发布包`
      );
        return enrichedDraft;
      } finally {
        setDraftPreviewLoadingId((current) => (current === draft.id ? null : current));
      }
    })();

    draftImageHydrationPromisesRef.current.set(draftHydrationKey, hydration);
    try {
      return await hydration;
    } finally {
      if (draftImageHydrationPromisesRef.current.get(draftHydrationKey) === hydration) {
        draftImageHydrationPromisesRef.current.delete(draftHydrationKey);
      }
    }
  }

  async function createMobilePublishPackage(options: { draft?: Draft; source?: "auto" | "manual" } = {}) {
    const draftForRequest = options.draft ?? selectedDraft;

    if (!draftForRequest) {
      setStatus("请先选择一篇草稿");
      return;
    }
    const cachedPackage = mobilePublishPackageCacheRef.current.get(draftForRequest.id);
    if (options.source === "auto" && cachedPackage) {
      setMobilePublishPackage(cachedPackage);
      setMobilePublishPackageDraftId(draftForRequest.id);
      return;
    }
    if (mobilePackageInFlightDraftIdRef.current) return;

    const selectedDraftImageCount = getDraftCandidateImageCount(draftForRequest);

    mobilePackageInFlightDraftIdRef.current = draftForRequest.id;
    setBusyAction("mobile-publish-package");
    setMobilePublishPackage(null);
    setMobilePublishPackageDraftId(null);
    setStatus(`正在生成手机发布包：当前草稿 ${selectedDraftImageCount}/${IMAGES_PER_DRAFT} 张候选图`);

    try {
      const draftForPackage = await prepareDraftMediaImages(draftForRequest, "package");
      const response = await postJson<MobilePublishPackageResult>("/api/mobile-publish-packages", {
        draft: draftForPackage
      });

      if (!response.ok || !response.data) {
        throw new Error(response.error?.message || "手机发布包生成失败");
      }

      cacheDraftPreviewImages(draftForPackage.id, buildDraftPreviewImagesFromUrls(response.data.imageUrls));
      cacheMobilePublishPackage(draftForPackage.id, response.data);

      if (selectedDraftIdRef.current === draftForPackage.id) {
        setMobilePublishPackage(response.data);
        setMobilePublishPackageDraftId(draftForPackage.id);
        setSelectedDraftId(draftForPackage.id);
        setActiveSection("section-3");
        setStatus(
          response.data.publicAccessWarning ||
            `手机三步发布码已生成：${response.data.imageCount} 张候选图；扫码后按 Step 1 保存图片、Step 2 复制文案、Step 3 打开小红书发布`
        );
      }
    } catch (error) {
      if (selectedDraftIdRef.current === draftForRequest.id) {
        setStatus(error instanceof Error ? error.message : "手机发布包生成失败");
      }
    } finally {
      if (mobilePackageInFlightDraftIdRef.current === draftForRequest.id) {
        mobilePackageInFlightDraftIdRef.current = null;
        setBusyAction(null);
      }
    }
  }

  async function collectEventwangImages() {
    const currentKeyword = resolveKeywordForRun(true);
    const searchTerms = buildCoreSearchTerms(currentKeyword, 3);
    setBusyAction("eventwang-gallery");
    try {
      const handshake = await ensureScrapeConnectorsReady();
      const eventwangConnector = handshake?.connectors.find((connector) => connector.key === "eventwang");
      if (eventwangConnector?.status !== "ready") {
        setStatus(`活动汪真实在线检测未通过：${eventwangConnector?.message || "等待检测"}`);
        return;
      }

      const response = await postJson<EventwangGalleryResult>("/api/materials/collect-eventwang-free", {
        accountId: targetAccountId,
        keyword: currentKeyword,
        keywordAlternates: searchTerms.slice(1),
        limit: TEST_EVENTWANG_IMAGE_LIMIT,
        maxCandidates: TEST_EVENTWANG_MAX_CANDIDATES,
        quickMode: true
      });

      if (!response.ok || !response.data) {
        setStatus(response.error?.message || "活动汪图库采集失败");
        return;
      }

      const quotaFallbackStatus = buildEventwangQuotaFallbackStatus(
        response.data,
        response.data.imageCount,
        TEST_EVENTWANG_IMAGE_LIMIT
      );
      const usabilityError = getEventwangUsabilityError(response.data);
      if (usabilityError && !quotaFallbackStatus) {
        setStatus(usabilityError);
        return;
      }

      const nextImages = response.data.items
        .map((item) => ({
          url: buildEventwangMediaUrl(item.localPath) || item.previewUrl || "",
          alt: item.tagName || item.styleTag,
          sourceUrl: item.detailUrl,
          localPath: item.localPath,
          styleTag: item.styleTag,
          styleBucket: item.styleBucket
        }))
        .filter((item) => item.url);
      if (!nextImages.length) {
        setEventwangGalleryResult(response.data);
        setXhsReferences(buildEventwangReferences(response.data));
        setStatus(quotaFallbackStatus ?? "活动汪原图可用地址为空，请重新采集");
        return;
      }
      setImages(nextImages);
      setEventwangGalleryResult(response.data);
      setXhsReferences(buildEventwangReferences(response.data));
      setStatus(
        quotaFallbackStatus ??
          `图库已采集 ${nextImages.length}/${TEST_EVENTWANG_IMAGE_LIMIT} 张原图，实际搜索词：${response.data.keyword}`
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "活动汪图库采集失败");
    } finally {
      setBusyAction(null);
    }
  }

  async function runScrapingHandshake() {
    await refreshScrapingHandshake(true);
  }

  async function refreshScrapingHandshake(showBusy: boolean) {
    if (showBusy) setBusyAction("handshake");
    const response = await getJson<ScrapingHandshake>(`/api/scraping/handshake${showBusy ? "?fresh=1" : ""}`);
    if (showBusy) setBusyAction(null);

    if (!response.ok || !response.data) {
      setStatus(response.error?.message || "全局检测失败");
      return null;
    }

    setScrapingHandshake(response.data);
    const readyCount = response.data.connectors.filter((connector) => connector.status === "ready").length;
    setStatus(`全局检测完成：${readyCount}/${response.data.connectors.length} 个连接器可用`);
    return response.data;
  }

  async function ensureScrapeConnectorsReady() {
    if (isConnectorReady(scrapingHandshake, "xhs-hotspot") && isConnectorReady(scrapingHandshake, "eventwang")) {
      return scrapingHandshake;
    }

    return refreshScrapingHandshake(false);
  }

  async function postJsonWithWorkflowRetry<T>(input: {
    url: string;
    body: unknown;
    label: string;
    stepKey: WorkflowStep["key"];
    maxAttempts?: number;
  }): Promise<ApiEnvelope<T>> {
    const maxAttempts = input.maxAttempts ?? UNATTENDED_RETRY_ATTEMPTS;
    let response: ApiEnvelope<T> | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      response = await postJson<T>(input.url, input.body);
      if (response.ok || !shouldRetryWorkflowError(response.error) || attempt >= maxAttempts) return response;

      const nextAttempt = attempt + 1;
      const retryStatus = buildWorkflowRetryStatus(input.label, nextAttempt, maxAttempts);
      updateWorkflowStep(input.stepKey, "running", retryStatus);
      setStatus(retryStatus);
      await waitMs(workflowRetryDelayMs(attempt));
    }

    return response ?? { ok: false, error: { code: "WORKFLOW_RETRY_FAILED", message: `${input.label}失败` } };
  }

  async function analyzeMessage() {
    setBusyAction("reply");
    const response = await postJson<ReplyAnalysis>("/api/conversations/analyze", { message });
    setBusyAction(null);

    if (!response.ok || !response.data) {
      setStatus(response.error?.message || "私信分析失败");
      return;
    }

    setReply(response.data);
    setStatus("已生成客服回复建议");
  }

  function renderDraftDetail(draft: Draft) {
    const activeMobilePackage = getActiveMobilePackageForDraft(draft.id);
    const previewImages = getDraftPreviewImages(draft, activeMobilePackage, getCachedDraftPreviewImages(draft));
    const draftImageCount = getDraftPublishImageCount(draft);
    const requestedImageCount = Math.min(IMAGES_PER_DRAFT, draft.imageStructure?.length ?? 0);
    const previewImageCount = previewImages.length;
    const previewLoading = draftPreviewLoadingId === draft.id;

    return (
      <article className="draft-detail inline" ref={draftDetailRef}>
        {previewImages.length ? (
          <div className="draft-image-strip">
            {previewImages.map((image) => (
              <a href={image.url} key={image.key} rel="noreferrer" target="_blank" title="打开原图">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt={image.prompt} />
              </a>
            ))}
          </div>
        ) : previewLoading ? (
          <div className="binding-row">
            <span>正在从本地图片池准备预览图，完成后会自动显示照片。</span>
          </div>
        ) : null}
        {draftImageCount < IMAGES_PER_DRAFT ? (
          <div className="binding-row warn">
            <span>
              当前草稿真实原图 {draftImageCount}/{IMAGES_PER_DRAFT} 张
              {requestedImageCount ? `，配图需求 ${requestedImageCount}/${IMAGES_PER_DRAFT} 张` : ""}
              {previewImageCount && previewImageCount > draftImageCount ? `，预览已用本地缓存显示 ${previewImageCount}/${IMAGES_PER_DRAFT} 张` : ""}；
              生成手机发布码前会再走正式补图流程，补不到时手机端会保存已有图片。
            </span>
          </div>
        ) : null}
        <button
          className="wide-button"
          disabled={taskBusy || mobilePackageBusy}
          onClick={() => void createMobilePublishPackage({ source: "manual" })}
          type="button"
        >
          <QrCode aria-hidden="true" size={16} />
          {mobilePackageBusy ? "发布码生成中" : activeMobilePackage ? "重新生成手机三步发布码" : "生成手机三步发布码"}
        </button>
        {activeMobilePackage ? (
          <div className="mobile-package-card">
            <div className="mobile-package-qr-stack">
              <div className={activeMobilePackage.phoneScanReady ? "qr-preview" : "qr-preview warn"}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt="手机三步发布二维码"
                  src={`/api/mobile-publish-packages/qr?url=${encodeURIComponent(activeMobilePackage.packageUrl)}`}
                />
                <span>{activeMobilePackage.phoneScanReady ? "扫码打开三步发布页" : "仅电脑本机可用"}</span>
              </div>
            </div>
            <div className="mobile-package-copy">
              <strong>手机三步发布码</strong>
              <span>
                {activeMobilePackage.imageCount} 张图 · 手机端 Step 1-3 发布
                {activeMobilePackage.skippedImageCount ? ` · 跳过 ${activeMobilePackage.skippedImageCount} 张` : ""}
              </span>
              {activeMobilePackage.publicAccessWarning ? (
                <p className="mobile-package-warning">{activeMobilePackage.publicAccessWarning}</p>
              ) : null}
              {!activeMobilePackage.shareReady ? (
                <p className="mobile-package-warning">
                  多图系统分享需要 HTTPS 公网地址；配置 APP_PUBLIC_URL 后重新生成，手机扫码才可直接导入。
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="binding-row">
            <span>
              手机方案会把文案和活动汪原图上传到 Supabase 公开发布包；手机扫码后同时显示 3 个上下排列按钮：Step 1 保存图片至手机，Step 2 复制文案，Step 3 打开小红书发布。
            </span>
          </div>
        )}
      </article>
    );
  }

  if (!authChecked) {
    return (
      <main className="login-shell">
        <section className="glass-panel login-card">
          <div className="brand-lockup">
            <div className="brand-mark">X</div>
            <div>
              <p className="eyebrow">Matrix Ops</p>
              <h1>正在校验登录状态</h1>
            </div>
          </div>
          <div className="status-pill bad">
            <ShieldCheck aria-hidden="true" size={15} />
            <span>需要登录</span>
            <small>未检测到登录态时会自动进入注册登录页</small>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar glass-panel" aria-label="功能导航">
        <div className="brand-lockup">
          <div className="brand-mark">X</div>
          <div>
            <p className="eyebrow">Matrix Ops</p>
            <h1>小红书矩阵中控</h1>
          </div>
        </div>

        <nav className="nav-list">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={item.id === activeSection ? "nav-item active" : "nav-item"}
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                type="button"
              >
                <Icon aria-hidden="true" size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

      </aside>

      <section className="workspace">
        <div className="workspace-authbar" aria-label="登录状态">
          <ShieldCheck aria-hidden="true" size={16} />
          <span>{authUser?.email || "未登录"}</span>
          <button type="button" onClick={signOut}>
            退出
          </button>
        </div>

        <section className="content-page" hidden={activeSection !== "section-0"} id="section-0">
          <div className="command-panel glass-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Material Flow</p>
                <h3>素材站到小红书</h3>
              </div>
              <Layers3 aria-hidden="true" size={22} />
            </div>

            <div className="home-command-grid">
              <div className="home-control-stack">
                <div className="mode-switch" aria-label="流程模式">
                  <button className={workflowMode === "review" ? "active" : ""} disabled={taskBusy} onClick={() => setWorkflowMode("review")} type="button">
                    <CheckCircle2 aria-hidden="true" size={16} />
                    分步审核
                  </button>
                  <button className={workflowMode === "auto" ? "active" : ""} disabled={taskBusy} onClick={() => setWorkflowMode("auto")} type="button">
                    <Sparkles aria-hidden="true" size={16} />
                    一键生成
                  </button>
                </div>

                <label className="field-label" htmlFor="contentDomain">
                  领域选择
                </label>
                <select id="contentDomain" value={targetAccountId} disabled={taskBusy} onChange={(event) => changeKeywordAccount(event.target.value)}>
                  {CONTENT_DOMAINS.map((domain) => (
                    <option value={domain.id} key={domain.id}>
                      {domain.id} · {domain.label} · {domain.scenario}
                    </option>
                  ))}
                </select>

                <label className="field-label" htmlFor="keywordSelect">
                  关键词选项
                </label>
                <select
                  id="keywordSelect"
                  value={keywordSelection}
                  disabled={taskBusy}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setKeywordSelection(nextValue);
                    setKeyword(nextValue === DEFAULT_KEYWORD_OPTION ? "" : nextValue);
                  }}
                >
                  <option value={DEFAULT_KEYWORD_OPTION}>默认：从当前领域预设关键词里随机选择</option>
                  {targetKeywordOptions.map((item) => (
                    <option value={item} key={item}>
                      {item}
                    </option>
                  ))}
                </select>
                <div className="binding-row">
                  <span>
                    当前内容领域：{selectedContentDomain.label}。已载入 {targetKeywordOptions.length} 个关键词选项，当前策略：{keywordSelectionLabel}
                    {keyword ? `，本轮实际关键词：${keyword}` : ""}
                  </span>
                </div>

                <section className="account-console" aria-label="采集白号登录状态">
                  <div className="account-health-grid">
                    <button
                      className={`status-pill account-health-card account-login-card ${xhsCollectorStatusPillTone(xhsLoginStatus, xhsCdpStatus)}`}
                      disabled={
                        busyAction === "login-status" ||
                        busyAction === "xhs-login" ||
                        busyAction === "xhs-cdp-status" ||
                        busyAction === "xhs-cdp-start" ||
                        taskBusy
                      }
                      onClick={handleXhsCdpCardClick}
                      title={xhsCdpStatus?.message || xhsLoginStatus?.detail}
                      type="button"
                    >
                      <span>{XHS_COLLECTOR_PROFILE_LABEL}{xhsCollectorStatusHeadline(xhsLoginStatus, xhsCdpStatus)}</span>
                      <small>{xhsCollectorStatusDetail(xhsLoginStatus, xhsCdpStatus, busyAction)}</small>
                    </button>
                    <button
                      className={`status-pill account-health-card account-login-card ${eventwangStatusPillTone(eventwangConnector)}`}
                      disabled={busyAction === "handshake" || busyAction === "eventwang-login" || taskBusy}
                      onClick={handleEventwangLoginCardClick}
                      type="button"
                    >
                      <span>活动汪{eventwangStatusHeadline(eventwangConnector)}</span>
                      <small>{eventwangLoggedIn ? "点击刷新真实状态" : "点击打开登录"}</small>
                    </button>
                  </div>
                </section>

                {workflowMode === "review" ? (
                  <button
                    className="wide-button"
                    onClick={runNextWorkflowStep}
                    disabled={taskBusy || activeWorkflowStep >= workflowSteps.length || !targetKeywordOptions.length}
                  >
                    <Send aria-hidden="true" size={17} />
                    {workflowBusy ? "执行中" : nextWorkflowStep?.label ?? "已完成"}
                  </button>
                ) : (
                  <button className="wide-button" onClick={runMaterialToXhsWorkflow} disabled={taskBusy || !targetKeywordOptions.length}>
                    <Sparkles aria-hidden="true" size={17} />
                    {workflowBusy ? "无人值守生成中" : "一键生成并入库"}
                  </button>
                )}
              </div>

              <div className="home-progress-stack">
                <div className="metric-row">
                  <Metric label="素材参考" value={currentBatch.referenceCount} tone="mint" disabled={taskBusy} onClick={() => setActiveMetricKey("references")} />
                  <Metric label="待审草稿" value={currentBatch.draftCount} tone="amber" disabled={taskBusy} onClick={() => setActiveMetricKey("drafts")} />
                  <Metric label="关键词批次" value={currentBatch.keywordCount} tone="coral" disabled={taskBusy} onClick={() => setActiveMetricKey("keywords")} />
                </div>

                <div className="workflow-progress" aria-label="workflow progress">
                  <div className="workflow-progress-topline">
                    <span>{workflowProgress.label}</span>
                    <strong>{workflowProgress.percent}%</strong>
                  </div>
                  <div
                    aria-valuemax={100}
                    aria-valuemin={0}
                    aria-valuenow={workflowProgress.percent}
                    className={workflowProgress.stalled ? "workflow-progress-track active" : "workflow-progress-track"}
                    role="progressbar"
                  >
                    <i style={{ width: `${workflowProgress.percent}%` }} />
                  </div>
                  <div className="workflow-progress-meta">
                    <span>
                      {workflowProgress.completed}/{workflowProgress.total} 个真实步骤完成
                    </span>
                    <small>{workflowProgress.detail}</small>
                  </div>
                </div>

                <div className="workflow-list">
                  {workflowSteps.map((step) => (
                    <div className={`workflow-step ${step.status}`} key={step.key}>
                      <span>{step.label}</span>
                      <strong>{workflowStatusText(step.status)}</strong>
                      <p>{step.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="content-grid" hidden={activeSection === "section-0"}>
          <Panel hidden={activeSection !== "section-global-check"} id="section-global-check" title="全局检测" eyebrow="Traffic Light Verification" icon={<PlugZap size={20} />}>
            <div className="traffic-grid">
              {globalChecks.map((check) => (
                <article className={`traffic-card ${check.light}`} key={check.key}>
                  <i aria-hidden="true" />
                  <div>
                    <strong>{check.label}</strong>
                    <span>{check.detail}</span>
                  </div>
                </article>
              ))}
            </div>

            <div className="scrape-toolbar">
              <button onClick={runScrapingHandshake} disabled={busyAction === "handshake"}>
                <RefreshCw aria-hidden="true" size={16} />
                {busyAction === "handshake" ? "检测中" : "刷新全局检测"}
              </button>
              <span>{scrapingHandshake?.crawlerBridge.samePort ? "前后端同端口" : "等待检测"}</span>
            </div>

            <div className="connector-grid">
              {(scrapingHandshake?.connectors ?? []).map((connector) => (
                <article className={`connector-card ${connector.status}`} key={connector.key}>
                  <div>
                    <strong>{connector.label}</strong>
                    <span>{connectorStatusText(connector.status)}</span>
                  </div>
                  <p>{connector.message}</p>
                  <ul>
                    {connector.checks.map((check) => (
                      <li key={`${connector.key}-${check.label}`}>
                        <i aria-hidden="true" className={check.ok ? "ok-dot" : "warn-dot"} />
                        <span>{check.label}</span>
                        <small>{check.detail}</small>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
              {!scrapingHandshake && <EmptyState text="未检测" />}
            </div>
          </Panel>

          <Panel hidden={activeSection !== "section-3"} id="section-3" title="草稿库" eyebrow="Draft Queue" icon={<FileText size={20} />}>
            <label className="field-label" htmlFor="draftAccount">
              草稿账号
            </label>
            <select id="draftAccount" value={draftAccountId} disabled={taskBusy} onChange={(event) => changeDraftAccount(event.target.value)}>
              {DRAFT_LIBRARY_ACCOUNT_OPTIONS.map((domain) => (
                <option value={domain.id} key={domain.id}>
                  {domain.optionLabel}
                </option>
              ))}
            </select>
            <div className="binding-row">
              <span>{buildDraftLibrarySummary({ accountId: draftAccountId, draftCount: drafts.length })}</span>
            </div>
            <div className="draft-list">
              {(drafts.length ? drafts.slice(0, 8) : []).map((draft) => {
                const isActiveDraft = draft.id === selectedDraft?.id;
                const isCurrentBatchDraft = Boolean(activeDraftBatchId && draft.batchId === activeDraftBatchId);
                const isUnreadDraft = !draft.readAt;
                const draftImageCount = getDraftPublishImageCount(draft);
                const requestedImageCount = Math.min(IMAGES_PER_DRAFT, draft.imageStructure?.length ?? 0);
                const draftRowGroupClass = [
                  "draft-row-group",
                  isActiveDraft ? "active" : "",
                  isCurrentBatchDraft ? "current-batch" : "history-batch",
                  isUnreadDraft ? "unread" : "read"
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <div className={draftRowGroupClass} key={draft.id}>
                    <div className="draft-row-shell">
                      <button
                        className={isActiveDraft ? "draft-row active" : "draft-row"}
                        onClick={() => void handleDraftRowClick(draft)}
                        type="button"
                      >
                        <div>
                          <span className={isCurrentBatchDraft ? "draft-batch-badge current" : "draft-batch-badge history"}>
                            {isCurrentBatchDraft ? "本批次" : "历史草稿"}
                          </span>
                          <span className={isUnreadDraft ? "draft-read-badge unread" : "draft-read-badge read"}>
                            {isUnreadDraft ? "未读" : "已读"}
                          </span>
                          <span>{draft.accountName}</span>
                          <small>生成时间：{formatDraftTimestamp(draft.batchCreatedAt)}</small>
                          <small>阅读时间：{draft.readAt ? formatDraftTimestamp(draft.readAt) : "未读"}</small>
                          <h4>{draft.title}</h4>
                          <p>{draft.body}</p>
                          <small>{draft.tags.map((tag) => `#${tag}`).join(" ")}</small>
                          {draftImageCount ? (
                            <small>活动汪原图已应用：{draftImageCount}/{IMAGES_PER_DRAFT} 张</small>
                          ) : requestedImageCount ? (
                            <small>配图需求：{requestedImageCount}/{IMAGES_PER_DRAFT} 张，原图待补</small>
                          ) : null}
                        </div>
                      </button>
                      <button
                        aria-label={`删除草稿：${draft.title}`}
                        className="draft-delete-button"
                        disabled={taskBusy || deletingDraftId === draft.id}
                        onClick={() => void deleteDraft(draft)}
                        title="删除草稿"
                        type="button"
                      >
                        <Trash2 aria-hidden="true" size={15} />
                        <span>{deletingDraftId === draft.id ? "删除中" : "删除草稿"}</span>
                      </button>
                    </div>
                    {isActiveDraft ? renderDraftDetail(draft) : null}
                  </div>
                );
              })}
              {!drafts.length && <EmptyState text="暂无草稿" />}
            </div>
          </Panel>

          <Panel hidden={activeSection !== "section-6"} id="section-6" title="关键词库" eyebrow="Domain Keyword Presets" icon={<ListPlus size={20} />}>
            <label className="field-label" htmlFor="keywordAccount">
              内容领域
            </label>
            <select id="keywordAccount" value={keywordAccountId} disabled={taskBusy} onChange={(event) => changeKeywordAccount(event.target.value)}>
              {CONTENT_DOMAINS.map((domain) => (
                <option value={domain.id} key={domain.id}>
                  {domain.id} · {domain.label} · {domain.scenario}
                </option>
              ))}
            </select>
            <div className="binding-row">
              <span>
                关键词会保存到 {getContentDomain(keywordAccountId)?.label} 领域；切换领域会持久化该选择，并加载该领域自己的关键词预设。
              </span>
            </div>

            <label className="field-label" htmlFor="keywordPreset">
              {getContentDomain(keywordAccountId)?.label} 领域关键词预设
            </label>
            <textarea
              id="keywordPreset"
              rows={4}
              value={keywordPresetText}
              onChange={(event) => setKeywordPresetText(event.target.value)}
              placeholder="每行或用顿号输入一个关键词，例如：毕业典礼舞台搭建、校园市集摊位布置"
            />
            <button className="wide-button" onClick={addKeywordPreset} disabled={taskBusy}>
              <Plus aria-hidden="true" size={16} />
              {busyAction === "keyword-preset" ? "鉴定中" : "增加关键词预设"}
            </button>
            <div className="binding-row">
              <span>{status}</span>
            </div>

            <div className="keyword-list">
              {visibleKeywordPresets.map((preset) => (
                <article className="keyword-card" key={preset.id}>
                  <div>
                    <strong>{getContentDomain(preset.accountId)?.label}</strong>
                    <span>{preset.categories.join(" / ")}</span>
                  </div>
                  <p>{preset.keywords.join("、")}</p>
                </article>
              ))}
              {!visibleKeywordPresets.length && <EmptyState text="当前领域暂无关键词预设" />}
            </div>

            <div className="batch-board">
              <div className="lead-stage">
                <span>当前领域预设</span>
                <strong>{visibleKeywordPresets.length}</strong>
              </div>
              <div className="lead-stage">
                <span>关键词合计</span>
                <strong>{visibleKeywordCount}</strong>
              </div>
            </div>
          </Panel>

          <Panel hidden={activeSection !== "section-7"} id="section-7" title="Prompt 微调" eyebrow="Text & Image Remix" icon={<Settings size={20} />}>
            <label className="field-label" htmlFor="textPrompt">
              文案二创 Prompt
            </label>
            <textarea
              id="textPrompt"
              rows={5}
              value={workspaceState.prompts.textRemix}
              onChange={(event) =>
                setWorkspaceState((state) => ({
                  ...state,
                  prompts: { ...state.prompts, textRemix: event.target.value }
                }))
              }
            />

            <label className="field-label" htmlFor="imagePrompt">
              图片二创 Prompt
            </label>
            <textarea
              id="imagePrompt"
              rows={5}
              value={workspaceState.prompts.imageRemix}
              onChange={(event) =>
                setWorkspaceState((state) => ({
                  ...state,
                  prompts: { ...state.prompts, imageRemix: event.target.value }
                }))
              }
            />

            <button className="wide-button" onClick={saveWorkspaceState} disabled={busyAction === "workspace-save"}>
              <Save aria-hidden="true" size={16} />
              {busyAction === "workspace-save" ? "保存中" : "保存 Prompt 微调"}
            </button>
          </Panel>
        </section>
      </section>
      {activeMetricDetails ? (
        <MetricDetailModal details={activeMetricDetails} onClose={() => setActiveMetricKey(null)} />
      ) : null}
    </main>
  );
}

function Metric({
  label,
  value,
  tone,
  disabled,
  onClick
}: {
  label: string;
  value: number | string;
  tone: "mint" | "amber" | "coral";
  disabled?: boolean;
  onClick?: () => void;
}) {
  if (!onClick) {
    return (
      <div className={`metric ${tone}`}>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    );
  }

  return (
    <button className={`metric ${tone}`} disabled={disabled} onClick={onClick} type="button">
      <strong>{value}</strong>
      <span>{label}</span>
    </button>
  );
}

function MetricDetailModal({
  details,
  onClose
}: {
  details: {
    title: string;
    subtitle: string;
    items: Array<{ title: string; meta: string; body?: string }>;
  };
  onClose: () => void;
}) {
  return (
    <div className="metric-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <article className="metric-modal" role="dialog" aria-modal="true" aria-label={details.title} onMouseDown={(event) => event.stopPropagation()}>
        <div className="metric-modal-heading">
          <div>
            <p className="eyebrow">Current Batch</p>
            <h3>{details.title}</h3>
            <span>{details.subtitle}</span>
          </div>
          <button aria-label="关闭详情" onClick={onClose} type="button">
            <XIcon aria-hidden="true" size={18} />
          </button>
        </div>
        <div className="metric-detail-list">
          {details.items.map((item, index) => (
            <article className="metric-detail-row" key={`${item.title}-${index}`}>
              <strong>{item.title}</strong>
              <span>{item.meta}</span>
              {item.body ? <p>{item.body}</p> : null}
            </article>
          ))}
          {!details.items.length ? <EmptyState text="当前批次还没有明细" /> : null}
        </div>
      </article>
    </div>
  );
}

function Panel({
  id,
  title,
  eyebrow,
  icon,
  children,
  hidden
}: {
  id: string;
  title: string;
  eyebrow: string;
  icon: ReactNode;
  children: ReactNode;
  hidden?: boolean;
}) {
  return (
    <section className="glass-panel content-panel" hidden={hidden} id={id}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3>{title}</h3>
        </div>
        {icon}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

function createEmptyBatchState(): CurrentBatchState {
  return {
    batchId: null,
    batchCreatedAt: null,
    keyword: "",
    searchTerms: [],
    referenceCount: 0,
    draftCount: 0,
    keywordCount: 0,
    imageCount: 0,
    status: "等待新批次",
    xhsSkippedReason: null
  };
}

function buildMetricDetails(
  key: MetricKey,
  batch: CurrentBatchState,
  references: XhsReference[],
  drafts: Draft[]
) {
  if (key === "references") {
    return {
      title: "素材参考",
      subtitle: `${batch.status} · ${batch.referenceCount} 条参考 · ${batch.imageCount} 张活动汪原图`,
      items: [
        ...(batch.xhsSkippedReason
          ? [{ title: "小红书参考已跳过", meta: "降级策略", body: batch.xhsSkippedReason }]
          : []),
        ...references.slice(0, batch.referenceCount).map((item) => ({
          title: item.title,
          meta: item.sourceUrl || "采集结果",
          body: item.content
        }))
      ]
    };
  }

  if (key === "drafts") {
    return {
      title: "待审草稿",
      subtitle: `${batch.status} · 当前批次 ${batch.draftCount} 篇`,
      items: drafts.slice(0, batch.draftCount).map((draft) => ({
        title: draft.title,
        meta: `${draft.accountName} · 质量分 ${draft.qualityScore}`,
        body: draft.body
      }))
    };
  }

  return {
    title: "关键词批次",
    subtitle: batch.keyword ? `本轮关键词：${batch.keyword}` : "等待素材采集启动",
    items: batch.searchTerms.map((term, index) => ({
      title: term,
      meta: index === 0 ? "主搜索词" : "核心相关词",
      body: index === 0 ? "用于确定本批次素材方向" : "用于扩大活动汪图库匹配范围"
    }))
  };
}

function connectorStatusText(status: ScrapingConnector["status"]) {
  if (status === "ready") return "就绪";
  if (status === "warning") return "待补齐";
  return "阻断";
}

function xhsStatusHeadline(status: XhsLoginStatus | null) {
  if (!status) return "待检测";
  if (status.verificationMode === "hosted") return "公网不可检测";
  if (status.loggedIn) return "已登录";
  if (status.riskBlocked) return "被风控";
  if (status.savedLogin) return "需重新登录";
  return "未登录";
}

function xhsStatusPillTone(status: XhsLoginStatus | null) {
  if (status?.verificationMode === "hosted") return "neutral";
  if (status?.riskBlocked) return "warn";
  if (status?.loggedIn) return "ok";
  if (status?.savedLogin) return "warn";
  return "bad";
}

function xhsCollectorStatusPillTone(loginStatus: XhsLoginStatus | null, cdpStatus: XhsCdpStatus | null) {
  if (cdpStatus?.available && cdpStatus.loggedIn) return "ok";
  if (cdpStatus?.available && !cdpStatus.loggedIn) return "warn";
  if (loginStatus?.riskBlocked) return "bad";
  if (loginStatus?.loggedIn || loginStatus?.savedLogin) return "warn";
  return "bad";
}

function xhsCollectorStatusHeadline(loginStatus: XhsLoginStatus | null, cdpStatus: XhsCdpStatus | null) {
  if (cdpStatus?.available && cdpStatus.loggedIn) return "浏览器已登录";
  if (cdpStatus?.available) return "浏览器未登录";
  if (loginStatus?.riskBlocked) return "被风控";
  if (loginStatus?.loggedIn || loginStatus?.savedLogin) return "浏览器未启动";
  return "待启动";
}

function xhsCollectorStatusDetail(
  loginStatus: XhsLoginStatus | null,
  cdpStatus: XhsCdpStatus | null,
  busyAction: string | null
) {
  if (busyAction === "xhs-cdp-status" || busyAction === "xhs-cdp-start") return "正在探测 9222 实时状态";
  if (cdpStatus?.available) return `默认 CDP 已连接 · 小红书页 ${cdpStatus.xhsPageCount} · ${cdpStatus.loginDetail}`;
  if (loginStatus?.loggedIn) return "备用登录已在 · 点击启动默认 Edge CDP";
  if (loginStatus?.savedLogin) return "备用登录需刷新 · 点击启动默认 Edge CDP";
  return "点击检测并启动默认 Edge CDP";
}

function xhsCdpStatusPillTone(status: XhsCdpStatus | null) {
  if (!status) return "neutral";
  if (status.available) return "ok";
  return "warn";
}

function xhsCdpStatusHeadline(status: XhsCdpStatus | null) {
  if (!status) return "待检测";
  if (status.available) return "已连接";
  return "未启动";
}

function eventwangHasSavedLogin(connector: ScrapingConnector | null) {
  return Boolean(connector?.checks.some((check) => check.label.includes("登录态文件") && check.ok));
}

function eventwangIsHosted(connector: ScrapingConnector | null) {
  return Boolean(connector?.checks.some((check) => check.detail.includes("公网版无法判定")));
}

function eventwangStatusPillTone(connector: ScrapingConnector | null) {
  if (eventwangIsHosted(connector)) return "neutral";
  if (eventwangIsLiveLoggedIn(connector)) return "ok";
  if (eventwangHasSavedLogin(connector)) return "warn";
  return "bad";
}

function eventwangStatusHeadline(connector: ScrapingConnector | null) {
  if (!connector) return "待检测";
  if (eventwangIsHosted(connector)) return "公网不可检测";
  if (eventwangIsLiveLoggedIn(connector)) return "已登录";
  if (eventwangHasSavedLogin(connector)) return "需重新登录";
  return "未登录";
}

function eventwangIsLiveLoggedIn(connector: ScrapingConnector | null) {
  return Boolean(connector?.checks.some((check) => check.label.includes("真实在线") && check.ok));
}

function isConnectorReady(handshake: ScrapingHandshake | null, key: ScrapingConnector["key"]) {
  return Boolean(handshake?.connectors.some((connector) => connector.key === key && connector.status === "ready"));
}

function resetWorkflowSteps(): WorkflowStep[] {
  return [
    { key: "material", label: "素材采集", status: "waiting", detail: "待执行" },
    { key: "text", label: "文案二创", status: "waiting", detail: "待审核" },
    { key: "image", label: "原图配图", status: "waiting", detail: "待审核" },
    { key: "draft", label: "草稿入库", status: "waiting", detail: "待审核" },
    { key: "send", label: "手机发布", status: "waiting", detail: "不自动发布" }
  ];
}

function mergeKeywordPresetsForAccount(current: KeywordPreset[], nextAccountPresets: KeywordPreset[], accountId: string) {
  const merged = [...nextAccountPresets, ...current.filter((preset) => preset.accountId !== accountId)];
  const seen = new Set<string>();

  return merged.filter((preset) => {
    if (seen.has(preset.id)) return false;
    seen.add(preset.id);
    return true;
  });
}

function workflowStatusText(status: WorkflowStep["status"]) {
  if (status === "running") return "执行中";
  if (status === "done") return "完成";
  if (status === "failed") return "失败";
  return "等待";
}

function formatDraftTimestamp(value?: string | null) {
  if (!value) return "无记录";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const pad = (part: number) => String(part).padStart(2, "0");
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  ].join(" ");
}

function buildEventwangReferences(result: EventwangGalleryResult): XhsReference[] {
  const now = new Date().toISOString();
  return result.items.map((item) => ({
    id: `eventwang-gallery-${item.galleryId}`,
    title: item.tagName || item.styleTag,
    content: [`活动汪图库原图`, `风格：${item.styleTag}`, `本地原图：${item.localPath}`].join(" · "),
    sourceUrl: item.detailUrl,
    imageUrls: item.previewUrl ? [item.previewUrl] : [],
    scrapedAt: now
  }));
}

function buildEventwangImages(result: EventwangGalleryResult): EventwangImage[] {
  return result.items
    .map((item) => ({
      url: buildEventwangMediaUrl(item.localPath) || item.previewUrl || "",
      alt: item.tagName || item.styleTag,
      sourceUrl: item.detailUrl,
      localPath: item.localPath,
      styleTag: item.styleTag,
      styleBucket: item.styleBucket
    }))
    .filter((image) => image.url);
}

function buildDraftPreviewImagesFromCandidates(candidateImages: EventwangImage[], existingImageCount: number, neededImageCount: number): DraftImage[] {
  return candidateImages.slice(0, neededImageCount).map((image, index) => {
    const imageIndex = existingImageCount + index;
    const usageKey = image.localPath ? `preview-local:${image.localPath}` : `preview-url:${image.url}`;
    return {
      prompt: image.styleTag || image.alt || `草稿配图 ${imageIndex + 1}`,
      url: image.url,
      localPath: image.localPath,
      role: imageIndex === 0 ? "cover" : "body",
      usageKey
    };
  });
}

function buildDraftPreviewImagesFromUrls(imageUrls: string[]): DraftImage[] {
  return imageUrls.filter(Boolean).map((url, index) => ({
    prompt: `手机发布图 ${index + 1}`,
    url,
    role: index === 0 ? "cover" : "body",
    usageKey: `package-url:${url}`
  }));
}

function buildEventwangQuotaFallbackStatus(result: EventwangGalleryResult, imageCount: number, targetCount: number) {
  if (!result.quotaFallback && result.source !== "image_pool" && result.source !== "mixed") return null;
  if (!result.quotaFallback) {
    return result.blockingReason || `活动汪本次没抓到足够可用原图，已从本地图片池补图。本次有效原图 ${imageCount}/${targetCount}。`;
  }
  return (
    result.blockingReason ||
    `活动汪下载权益已用完，图片来自本地图片池。本次有效原图 ${imageCount}/${targetCount}。`
  );
}

function buildEventwangSourceLabel(result: EventwangGalleryResult, imageCount: number, targetCount: number) {
  const liveImageCount = result.liveImageCount ?? (result.source === "image_pool" ? 0 : imageCount);
  const poolImageCount = result.poolImageCount ?? (result.source === "image_pool" ? imageCount : 0);

  if (liveImageCount > 0 && poolImageCount > 0) {
    return `图库原图 ${liveImageCount} 张 + 本地图片池 ${poolImageCount} 张 = ${imageCount}/${targetCount} 张`;
  }

  if (poolImageCount > 0) return `本地图片池 ${poolImageCount}/${targetCount} 张`;
  return `图库原图 ${imageCount}/${targetCount} 张`;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const snapshot = await readFreshStoredAuthSession();
  const token = snapshot?.session?.accessToken;
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function getJson<T>(url: string): Promise<ApiEnvelope<T>> {
  return requestJson<T>(url, { headers: await getAuthHeaders() });
}

async function postJson<T>(url: string, body: unknown): Promise<ApiEnvelope<T>> {
  return requestJson<T>(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(await getAuthHeaders())
    },
    body: JSON.stringify(body)
  });
}

async function patchJson<T>(url: string, body: unknown): Promise<ApiEnvelope<T>> {
  return requestJson<T>(url, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      ...(await getAuthHeaders())
    },
    body: JSON.stringify(body)
  });
}

async function deleteJson<T>(url: string, body: unknown): Promise<ApiEnvelope<T>> {
  return requestJson<T>(url, {
    method: "DELETE",
    headers: {
      "content-type": "application/json",
      ...(await getAuthHeaders())
    },
    body: JSON.stringify(body)
  });
}

async function requestJson<T>(url: string, init: RequestInit): Promise<ApiEnvelope<T>> {
  const controller = new AbortController();
  const timeoutMs = resolveRequestTimeoutMs(url);
  const timer = setTimeout(() => controller.abort(`${describeRequest(url)}超时，请重试当前步骤`), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal
    });
    const payload = await response.json().catch(() => null);
    if (payload && typeof payload === "object" && "ok" in payload) return payload as ApiEnvelope<T>;

    return {
      ok: false,
      error: {
        code: `HTTP_${response.status}`,
        message: response.ok ? "接口返回格式异常" : `${describeRequest(url)}失败：HTTP ${response.status}`
      }
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "REQUEST_FAILED",
        message: normalizeRequestError(error, url)
      }
    };
  } finally {
    clearTimeout(timer);
  }
}

function normalizeRequestError(error: unknown, url: string) {
  if (typeof error === "string") return error;
  if (error instanceof DOMException && error.name === "AbortError") return `${describeRequest(url)}超时，请重试当前步骤`;
  if (error instanceof Error) return error.message || `${describeRequest(url)}请求失败`;
  return `${describeRequest(url)}请求失败`;
}

function waitMs(delayMs: number) {
  return new Promise((resolve) => window.setTimeout(resolve, delayMs));
}

function workflowStorageKey(userId?: string) {
  return `${WORKFLOW_STORAGE_PREFIX}${userId || "anonymous"}`;
}

function readPersistedWorkflowJob(userId?: string): PersistedWorkflowJob | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(workflowStorageKey(userId));
    if (!raw) return null;
    const payload = JSON.parse(raw) as Partial<PersistedWorkflowJob>;
    if (payload.version !== WORKFLOW_JOB_VERSION || payload.state !== "active") return null;
    if (!payload.keyword || !payload.accountId) return null;
    if (!Array.isArray(payload.references) || !Array.isArray(payload.images) || !Array.isArray(payload.drafts)) return null;
    return payload as PersistedWorkflowJob;
  } catch {
    return null;
  }
}

function writePersistedWorkflowJob(job: PersistedWorkflowJob) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(workflowStorageKey(job.userId), JSON.stringify(job));
}

function clearPersistedWorkflowJob(userId?: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(workflowStorageKey(userId));
}

function workflowStepsForCheckpoint(activeWorkflowStep: number): WorkflowStep[] {
  const steps = resetWorkflowSteps();
  const boundedStep = Math.max(0, Math.min(activeWorkflowStep, steps.length - 1));
  return steps.map((step, index) => {
    if (index < boundedStep) return { ...step, status: "done", detail: "已完成" };
    if (index === boundedStep) return { ...step, status: "running", detail: "刷新后继续执行" };
    return step;
  });
}

function draftBatchMetadataFromCurrentBatch(batch: CurrentBatchState, keyword: string): DraftBatchMetadata {
  if (batch.batchId && batch.batchCreatedAt) {
    return {
      batchId: batch.batchId,
      batchCreatedAt: batch.batchCreatedAt,
      batchKeyword: batch.keyword || keyword
    };
  }

  return createDraftBatchMetadata({ keyword });
}

function resolveRequestTimeoutMs(url: string) {
  if (url.includes("/api/materials/collect-eventwang-free")) return 780000;
  if (url.includes("/api/xhs/drafts/save")) return 930000;
  if (url.includes("/api/mobile-publish-packages")) return 90000;
  if (url.includes("/api/xhs/scrape")) return 780000;
  if (url.includes("/api/remix/drafts")) return 150000;
  if (url.includes("/api/drafts")) return 30000;
  return 15000;
}

function describeRequest(url: string) {
  if (url.includes("/api/materials/collect-eventwang-free")) return "活动汪图库采集";
  if (url.includes("/api/xhs/drafts/save")) return "小红书网页草稿接口";
  if (url.includes("/api/mobile-publish-packages")) return "手机发布包生成";
  if (url.includes("/api/xhs/scrape")) return "小红书素材采集";
  if (url.includes("/api/remix/drafts")) return "文案生成";
  if (url.includes("/api/drafts")) return "草稿入库";
  return "请求";
}

