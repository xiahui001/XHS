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
  X as XIcon
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { clearStoredAuthSession, readStoredAuthSession, type AuthUser } from "@/lib/auth/session";
import { buildEventwangMediaUrl } from "@/lib/collectors/eventwang-gallery";
import { getEventwangUsabilityError } from "@/lib/collectors/eventwang-usability";
import { assignEventwangImagesToDrafts } from "@/lib/generation/draft-images";
import { buildCoreSearchTerms } from "@/lib/keywords/search-terms";
import { getMaterialHardBlocker } from "@/lib/workflow/material-gate";
import { calculateWorkflowProgress } from "@/lib/workflow/progress";
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
  generatedImages?: Array<{
    prompt: string;
    url: string;
    localPath?: string;
  }>;
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
  bucket: string;
  packageDataUrl?: string;
  storagePath: string;
  phoneScanReady: boolean;
  shareReady: boolean;
  publicAccessWarning: string | null;
  createdAt: string;
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
  keyword: string;
  searchTerms: string[];
  referenceCount: number;
  draftCount: number;
  keywordCount: number;
  imageCount: number;
  status: string;
  xhsSkippedReason: string | null;
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

const TEST_XHS_REFERENCE_LIMIT = 3;
const TEST_EVENTWANG_IMAGE_LIMIT = 4;
const TEST_EVENTWANG_MAX_CANDIDATES = 12;
const TEST_DRAFT_COUNT = 3;

export function MatrixDashboard() {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [keywordSelection, setKeywordSelection] = useState(DEFAULT_KEYWORD_OPTION);
  const [targetAccountId, setTargetAccountId] = useState("A2");
  const [keywordAccountId, setKeywordAccountId] = useState("A2");
  const [message, setMessage] = useState("下周六能搭一个 300 人年会舞台吗，大概多少钱？");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [xhsReferences, setXhsReferences] = useState<XhsReference[]>([]);
  const [images, setImages] = useState<EventwangImage[]>([]);
  const [reply, setReply] = useState<ReplyAnalysis | null>(null);
  const [scrapingHandshake, setScrapingHandshake] = useState<ScrapingHandshake | null>(null);
  const [eventwangGalleryResult, setEventwangGalleryResult] = useState<EventwangGalleryResult | null>(null);
  const [status, setStatus] = useState("待启动");
  const [mobilePublishPackage, setMobilePublishPackage] = useState<MobilePublishPackageResult | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [workflowMode, setWorkflowMode] = useState<"review" | "auto">("review");
  const [activeWorkflowStep, setActiveWorkflowStep] = useState(0);
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStep[]>(resetWorkflowSteps());
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [xhsLoginStatus, setXhsLoginStatus] = useState<XhsLoginStatus | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>(() => createDefaultWorkspaceState("demo-user"));
  const [keywordPresets, setKeywordPresets] = useState<KeywordPreset[]>([]);
  const [keywordPresetText, setKeywordPresetText] = useState("");
  const [keywordDraftBatches, setKeywordDraftBatches] = useState<KeywordDraftBatch[]>([]);
  const [activeSection, setActiveSection] = useState<SectionId>("section-0");
  const [authChecked, setAuthChecked] = useState(false);
  const [localBrowserMode, setLocalBrowserMode] = useState(false);
  const [activeMetricKey, setActiveMetricKey] = useState<MetricKey | null>(null);
  const [currentBatch, setCurrentBatch] = useState<CurrentBatchState>(() => createEmptyBatchState());
  const draftDetailRef = useRef<HTMLElement | null>(null);
  const autoMobilePackageDraftIdsRef = useRef<Set<string>>(new Set());
  const mobilePackageInFlightDraftIdRef = useRef<string | null>(null);
  const selectedDraftIdRef = useRef<string | null>(null);

  useEffect(() => {
    void bootstrapAuthState();
  }, [router]);

  useEffect(() => {
    setLocalBrowserMode(window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
  }, []);

  useEffect(() => {
    if (authUser && authChecked) void loadKeywordPresets(authUser.id, keywordAccountId);
  }, [authChecked, authUser, keywordAccountId]);

  useEffect(() => {
    setMobilePublishPackage(null);
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
    if (autoMobilePackageDraftIdsRef.current.has(selectedDraft.id)) return;
    if (mobilePackageInFlightDraftIdRef.current) return;

    autoMobilePackageDraftIdsRef.current.add(selectedDraft.id);
    void createMobilePublishPackage(selectedDraft);
  }, [activeSection, selectedDraft]);

  const keywordSelectionLabel =
    keywordSelection === DEFAULT_KEYWORD_OPTION ? "默认随机" : keywordSelection || "未选择";
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
        textScrapeReady: isConnectorReady(scrapingHandshake, "xhs-hotspot") || Boolean(xhsLoginStatus?.loggedIn),
        imageScrapeReady:
          isConnectorReady(scrapingHandshake, "eventwang") ||
          Boolean(eventwangGalleryResult?.selectedCount),
        textGenerationReady: Boolean(workspaceState.prompts.textRemix.trim()),
        imageGenerationReady: images.length > 0
      }),
    [authUser, eventwangGalleryResult, scrapingHandshake, workspaceState, xhsLoginStatus]
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

  async function bootstrapAuthState() {
    const snapshot = readStoredAuthSession();
    if (!snapshot?.session?.accessToken) {
      clearStoredAuthSession();
      router.replace("/login");
      return;
    }

    const sessionResponse = await getJson<{ user: AuthUser }>("/api/auth/session");
    if (!sessionResponse.ok || !sessionResponse.data) {
      clearStoredAuthSession();
      router.replace("/login");
      return;
    }

    const verifiedUser = sessionResponse.data.user;
    setAuthUser(verifiedUser);
    const restoredAccountCode = await loadWorkspaceState(verifiedUser.id);
    setTargetAccountId(restoredAccountCode);
    setKeywordAccountId(restoredAccountCode);
    await loadDrafts(restoredAccountCode, verifiedUser.id);
    await loadKeywordPresets(verifiedUser.id, restoredAccountCode);
    setAuthChecked(true);
    void refreshXhsLoginStatus();
    void runScrapingHandshake();
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
    const params = new URLSearchParams({ accountId: accountCode });
    if (userId) params.set("userId", userId);
    const response = await getJson<{ drafts: Draft[]; mode: string }>(
      `/api/drafts?${params.toString()}`
    );

    if (!response.ok || !response.data) {
      setStatus(response.error?.message || "草稿加载失败");
      return [];
    }

    setDrafts(response.data.drafts);
    setSelectedDraftId(response.data.drafts[0]?.id ?? null);
    setStatus(
      response.data.drafts.length
        ? `已加载 ${getContentDomain(accountCode)?.label} 领域草稿 ${response.data.drafts.length} 篇（${draftModeText(response.data.mode)}）`
        : `${getContentDomain(accountCode)?.label} 领域暂无草稿`
    );
    return response.data.drafts;
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

  async function runMaterialToXhsWorkflow() {
    const workflowKeyword = resolveKeywordForRun(true);
    setWorkflowMode("auto");
    setBusyAction("workflow");
    setStatus(`一键生成中，本次关键词：${workflowKeyword}`);
    setActiveWorkflowStep(0);
    setWorkflowSteps(resetWorkflowSteps());

    try {
      const materialResult = await runMaterialStep(workflowKeyword);
      const nextDrafts = await runTextStep(materialResult.references, workflowKeyword);
      const draftsWithImages = await runImageStep(nextDrafts, materialResult.eventwangImages);
      const insertedCount = await runDraftStep(draftsWithImages);
      runSendStep(insertedCount);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "流程执行失败");
      markRunningStepFailed(error instanceof Error ? error.message : "执行失败");
    } finally {
      setBusyAction(null);
    }
  }

  async function runNextWorkflowStep() {
    setWorkflowMode("review");
    setBusyAction("workflow-step");

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
    setDrafts([]);
    setSelectedDraftId(null);
    setEventwangGalleryResult(null);
    setMobilePublishPackage(null);
    const handshake = await ensureScrapeConnectorsReady();
    if (!handshake) throw new Error("全局检测失败，请先刷新全局检测");

    const xhsConnector = handshake.connectors.find((connector) => connector.key === "xhs-hotspot");
    const eventwangConnector = handshake.connectors.find((connector) => connector.key === "eventwang");
    const blocker = getMaterialHardBlocker(handshake.connectors);
    if (blocker) {
      updateWorkflowStep("material", "failed", blocker);
      throw new Error(blocker);
    }

    const searchTerms = buildCoreSearchTerms(currentKeyword, 3);
    setCurrentBatch({
      keyword: currentKeyword,
      searchTerms,
      referenceCount: 0,
      draftCount: 0,
      keywordCount: searchTerms.length,
      imageCount: 0,
      status: "素材采集中",
      xhsSkippedReason: null
    });

    let xhsItems: XhsReference[] = [];
    let xhsItemCount = 0;
    let xhsSkippedReason: string | null = null;

    if (xhsConnector?.status === "ready") {
      updateWorkflowStep("material", "running", `小红书低频采集中：${searchTerms.join(" / ")}`);
      setStatus(`正在按核心搜索词采集小红书参考素材：${searchTerms.join(" / ")}`);

      const xhsResponse = await postJson<{ items: XhsReference[]; itemCount: number }>("/api/xhs/scrape", {
        keyword: currentKeyword,
        keywordAlternates: searchTerms.slice(1),
        limit: TEST_XHS_REFERENCE_LIMIT
      });

      if (xhsResponse.ok && xhsResponse.data) {
        xhsItems = xhsResponse.data.items;
        xhsItemCount = xhsResponse.data.itemCount;
      } else {
        xhsSkippedReason = xhsResponse.error?.message || "小红书参考采集失败，已降级使用活动汪素材";
      }
    } else {
      xhsSkippedReason = `${xhsConnector?.label || "小红书热点参考"}：${xhsConnector?.message || "未就绪"}，已降级跳过`;
    }

    updateWorkflowStep("material", "running", `${xhsSkippedReason ? "小红书参考已跳过" : `小红书 ${xhsItemCount} 条`}，活动汪核心词采集中`);
    setStatus(`正在按核心搜索词采集活动汪图库原图：${searchTerms.join(" / ")}`);
    const eventwangResponse = await postJson<EventwangGalleryResult>("/api/materials/collect-eventwang-free", {
      keyword: currentKeyword,
      keywordAlternates: searchTerms.slice(1),
      limit: TEST_EVENTWANG_IMAGE_LIMIT,
      maxCandidates: TEST_EVENTWANG_MAX_CANDIDATES,
      quickMode: true
    });

    if (!eventwangResponse.ok || !eventwangResponse.data) {
      throw new Error(eventwangResponse.error?.message || "活动汪图库采集失败");
    }

    const usabilityError = getEventwangUsabilityError(eventwangResponse.data);
    if (usabilityError) {
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
    if (!eventwangImages.length) {
      const detail = "活动汪原图可用地址为空，请重新采集";
      updateWorkflowStep("material", "failed", detail);
      throw new Error(detail);
    }
    const references = [...xhsItems, ...buildEventwangReferences(eventwangResponse.data)];

    setImages(eventwangImages);
    setXhsReferences(references);
    setEventwangGalleryResult(eventwangResponse.data);
    setCurrentBatch((batch) => ({
      ...batch,
      referenceCount: references.length,
      imageCount: eventwangImages.length,
      status: "素材采集完成",
      xhsSkippedReason
    }));
    updateWorkflowStep(
      "material",
      "done",
      `${xhsSkippedReason ? "小红书参考跳过" : `小红书 ${xhsItemCount} 条`} / 图库原图 ${eventwangImages.length}/${TEST_EVENTWANG_IMAGE_LIMIT} 张 / 搜索词 ${eventwangResponse.data.keyword}`
    );
    if (eventwangResponse.data.blockingReason && eventwangResponse.data.selectedCount === 0) {
      setStatus(`活动汪已阻断：${eventwangResponse.data.blockingReason}`);
    } else {
      setStatus(`素材采集完成：实际活动汪搜索词“${eventwangResponse.data.keyword}”，准备二创测试`);
    }
    setActiveWorkflowStep(1);
    return { references, eventwangImages };
  }

  async function runTextStep(references: XhsReference[], currentKeyword: string) {
    if (!references.length) throw new Error("请先采集素材");

    updateWorkflowStep("text", "running", "请求已提交，等待模型返回");
    setStatus(`大模型文案生成中，当前关键词：${currentKeyword}`);
    const remix = await postJson<{ drafts: Draft[]; model: string }>("/api/remix/drafts", {
      keyword: currentKeyword,
      references,
      accountId: targetAccountId,
      customPrompt: workspaceState.prompts.textRemix,
      keywordCategory: keywordDraftBatches[0]?.category,
      keywordCategories: keywordDraftBatches.map((batch) => batch.category),
      count: TEST_DRAFT_COUNT
    });

    if (!remix.ok || !remix.data) throw new Error(remix.error?.message || "文案二创失败");
    const remixData = remix.data;

    updateWorkflowStep("text", "running", "模型已返回，正在写入草稿状态");
    setDrafts(remixData.drafts);
    setSelectedDraftId(remixData.drafts[0]?.id ?? null);
    setCurrentBatch((batch) => ({
      ...batch,
      draftCount: remixData.drafts.length,
      status: "文案生成完成"
    }));
    updateWorkflowStep("text", "done", `${remixData.drafts.length} 篇`);
    setActiveWorkflowStep(2);
    setStatus("文案已生成");
    return remixData.drafts;
  }

  async function runImageStep(nextDrafts: Draft[], imagePool = images) {
    if (!nextDrafts.length) throw new Error("请先生成文案");

    if (!imagePool.length) throw new Error("请先采集活动汪图库原图");

    updateWorkflowStep("image", "running", "活动汪原图应用中");
    setStatus("正在把活动汪原图应用到草稿配图");
    const imagePlacements = assignEventwangImagesToDrafts(nextDrafts, imagePool, 10);
    const draftsWithImages = nextDrafts.map((draft) => ({
      ...draft,
      generatedImages: imagePlacements.find((result) => result.draftId === draft.id)?.images ?? []
    }));
    setDrafts(draftsWithImages);
    setSelectedDraftId(draftsWithImages[0]?.id ?? null);
    setCurrentBatch((batch) => ({
      ...batch,
      draftCount: draftsWithImages.length,
      status: "原图配图完成"
    }));
    updateWorkflowStep("image", "done", `${imagePlacements.length} 篇草稿已配图`);
    setActiveWorkflowStep(3);
    setStatus("活动汪原图已应用到草稿");
    return draftsWithImages;
  }

  async function runDraftStep(nextDrafts: Draft[]) {
    if (!nextDrafts.length) throw new Error("请先生成草稿");

    updateWorkflowStep("draft", "running", "草稿入库中");
    setStatus("草稿库入库中，等待存储返回");
    const saved = await postJson<{ insertedCount: number; drafts: Draft[] }>("/api/drafts", {
      drafts: nextDrafts,
      userId: authUser?.id,
      accountId: targetAccountId
    });

    if (!saved.ok || !saved.data) throw new Error(saved.error?.message || "草稿保存失败");
    const savedData = saved.data;

    setDrafts(savedData.drafts);
    setSelectedDraftId(savedData.drafts[0]?.id ?? null);
    setCurrentBatch((batch) => ({
      ...batch,
      draftCount: savedData.drafts.length,
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

  async function createMobilePublishPackage(draftForRequest = selectedDraft) {
    if (!draftForRequest) {
      setStatus("\u8bf7\u5148\u9009\u62e9\u4e00\u7bc7\u8349\u7a3f");
      return;
    }
    if (mobilePackageInFlightDraftIdRef.current) return;

    mobilePackageInFlightDraftIdRef.current = draftForRequest.id;
    setBusyAction("mobile-publish-package");
    setMobilePublishPackage(null);
    setStatus(`\u6b63\u5728\u540e\u53f0\u751f\u6210\u624b\u673a\u53d1\u5e03\u5305\uff1a\u5f53\u524d\u8349\u7a3f ${draftForRequest.generatedImages?.length ?? 0} \u5f20\u56fe`);

    try {
      const response = await postJson<MobilePublishPackageResult>("/api/mobile-publish-packages", {
        draft: draftForRequest
      });

      if (!response.ok || !response.data) {
        throw new Error(response.error?.message || "\u624b\u673a\u53d1\u5e03\u5305\u751f\u6210\u5931\u8d25");
      }

      if (selectedDraftIdRef.current === draftForRequest.id) {
        setMobilePublishPackage(response.data);
        setSelectedDraftId(draftForRequest.id);
        setActiveSection("section-3");
        setStatus(
          response.data.publicAccessWarning ||
            `\u624b\u673a\u4e09\u6b65\u53d1\u5e03\u7801\u5df2\u751f\u6210\uff1a${response.data.imageCount} \u5f20\u56fe\uff1b\u626b\u7801\u540e\u6309 Step 1 \u4fdd\u5b58\u56fe\u7247\u3001Step 2 \u590d\u5236\u6587\u6848\u3001Step 3 \u6253\u5f00\u5c0f\u7ea2\u4e66\u53d1\u5e03`
        );
      }
    } catch (error) {
      if (selectedDraftIdRef.current === draftForRequest.id) {
        setStatus(error instanceof Error ? error.message : "\u624b\u673a\u53d1\u5e03\u5305\u751f\u6210\u5931\u8d25");
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

      const usabilityError = getEventwangUsabilityError(response.data);
      if (usabilityError) {
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
        setStatus("活动汪原图可用地址为空，请重新采集");
        return;
      }
      setImages(nextImages);
      setEventwangGalleryResult(response.data);
      setXhsReferences(buildEventwangReferences(response.data));
      setStatus(`图库已采集 ${nextImages.length}/${TEST_EVENTWANG_IMAGE_LIMIT} 张原图，实际搜索词：${response.data.keyword}`);
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
                  <button className={workflowMode === "review" ? "active" : ""} onClick={() => setWorkflowMode("review")} type="button">
                    <CheckCircle2 aria-hidden="true" size={16} />
                    分步审核
                  </button>
                  <button className={workflowMode === "auto" ? "active" : ""} onClick={() => setWorkflowMode("auto")} type="button">
                    <Sparkles aria-hidden="true" size={16} />
                    一键生成
                  </button>
                </div>

                <label className="field-label" htmlFor="contentDomain">
                  领域选择
                </label>
                <select id="contentDomain" value={targetAccountId} onChange={(event) => changeKeywordAccount(event.target.value)}>
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
                      className={`status-pill account-health-card account-login-card ${xhsStatusPillTone(xhsLoginStatus)}`}
                      disabled={busyAction === "login-status" || busyAction === "xhs-login"}
                      onClick={handleXhsLoginCardClick}
                      type="button"
                    >
                      <span>{XHS_COLLECTOR_PROFILE_LABEL}{xhsStatusHeadline(xhsLoginStatus)}</span>
                      <small>{xhsLoginStatus?.loggedIn ? "点击刷新真实状态" : "点击打开登录"}</small>
                    </button>
                    <button
                      className={`status-pill account-health-card account-login-card ${eventwangStatusPillTone(eventwangConnector)}`}
                      disabled={busyAction === "handshake" || busyAction === "eventwang-login"}
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
                    disabled={workflowBusy || activeWorkflowStep >= workflowSteps.length || !targetKeywordOptions.length}
                  >
                    <Send aria-hidden="true" size={17} />
                    {workflowBusy ? "执行中" : nextWorkflowStep?.label ?? "已完成"}
                  </button>
                ) : (
                  <button className="wide-button" onClick={runMaterialToXhsWorkflow} disabled={workflowBusy || !targetKeywordOptions.length}>
                    <Sparkles aria-hidden="true" size={17} />
                    {workflowBusy ? "生成中" : "素材采集并入库"}
                  </button>
                )}
              </div>

              <div className="home-progress-stack">
                <div className="metric-row">
                  <Metric label="素材参考" value={currentBatch.referenceCount} tone="mint" onClick={() => setActiveMetricKey("references")} />
                  <Metric label="待审草稿" value={currentBatch.draftCount} tone="amber" onClick={() => setActiveMetricKey("drafts")} />
                  <Metric label="关键词批次" value={currentBatch.keywordCount} tone="coral" onClick={() => setActiveMetricKey("keywords")} />
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
            <div className="draft-list">
              {(drafts.length ? drafts.slice(0, 8) : []).map((draft) => (
                <button
                  className={draft.id === selectedDraft?.id ? "draft-row active" : "draft-row"}
                  key={draft.id}
                  onClick={() => setSelectedDraftId(draft.id)}
                  type="button"
                >
                  <div>
                    <span>{draft.accountName}</span>
                    <h4>{draft.title}</h4>
                    <p>{draft.body}</p>
                    <small>{draft.tags.map((tag) => `#${tag}`).join(" ")}</small>
                    {draft.generatedImages?.length ? <small>活动汪原图已应用：{draft.generatedImages.length} 张</small> : null}
                  </div>
                  <strong>{draft.qualityScore}</strong>
                </button>
              ))}
              {!drafts.length && <EmptyState text="暂无草稿" />}
            </div>

            {selectedDraft ? (
              <article className="draft-detail" ref={draftDetailRef}>
                <div>
                  <span>{selectedDraft.accountName}</span>
                  <strong>{selectedDraft.title}</strong>
                </div>
                <p>{selectedDraft.body}</p>
                <small>{selectedDraft.tags.map((tag) => `#${tag}`).join(" ")}</small>
                {selectedDraft.generatedImages?.length ? (
                  <div className="draft-image-strip">
                    {selectedDraft.generatedImages.map((image) => (
                      <a href={image.url} key={image.url} rel="noreferrer" target="_blank" title="打开原图">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={image.url} alt={image.prompt} />
                      </a>
                    ))}
                  </div>
                ) : null}
                <button
                  className="wide-button"
                  disabled={busyAction === "mobile-publish-package"}
                  onClick={() => void createMobilePublishPackage()}
                  type="button"
                >
                  <QrCode aria-hidden="true" size={16} />
                  {busyAction === "mobile-publish-package" ? "发布码生成中" : "生成手机三步发布码"}
                </button>
                {mobilePublishPackage ? (
                  <div className="mobile-package-card">
                    <div className="mobile-package-qr-stack">
                      <div className={mobilePublishPackage.phoneScanReady ? "qr-preview" : "qr-preview warn"}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          alt="手机三步发布二维码"
                          src={`/api/mobile-publish-packages/qr?url=${encodeURIComponent(mobilePublishPackage.packageUrl)}`}
                        />
                        <span>{mobilePublishPackage.phoneScanReady ? "扫码打开三步发布页" : "仅电脑本机可用"}</span>
                      </div>
                    </div>
                    <div className="mobile-package-copy">
                      <strong>手机三步发布码</strong>
                      <span>
                        {mobilePublishPackage.imageCount} 张图 · 手机端 Step 1-3 发布
                        {mobilePublishPackage.skippedImageCount ? ` · 跳过 ${mobilePublishPackage.skippedImageCount} 张` : ""}
                      </span>
                      {mobilePublishPackage.publicAccessWarning ? (
                        <p className="mobile-package-warning">{mobilePublishPackage.publicAccessWarning}</p>
                      ) : null}
                      {!mobilePublishPackage.shareReady ? (
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
            ) : null}
          </Panel>

          <Panel hidden={activeSection !== "section-6"} id="section-6" title="关键词库" eyebrow="Domain Keyword Presets" icon={<ListPlus size={20} />}>
            <label className="field-label" htmlFor="keywordAccount">
              内容领域
            </label>
            <select id="keywordAccount" value={keywordAccountId} onChange={(event) => changeKeywordAccount(event.target.value)}>
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
            <button className="wide-button" onClick={addKeywordPreset} disabled={busyAction === "keyword-preset"}>
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
  onClick
}: {
  label: string;
  value: number | string;
  tone: "mint" | "amber" | "coral";
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
    <button className={`metric ${tone}`} onClick={onClick} type="button">
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

function draftModeText(mode: string) {
  if (mode === "supabase_storage") return "Supabase";
  if (mode === "supabase_seeded_from_local") return "已同步到 Supabase";
  if (mode === "local_store_fallback") return "本地备份";
  return "本地";
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

function getAuthHeaders(): Record<string, string> {
  const snapshot = readStoredAuthSession();
  const token = snapshot?.session?.accessToken;
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function getJson<T>(url: string): Promise<ApiEnvelope<T>> {
  return requestJson<T>(url, { headers: getAuthHeaders() });
}

async function postJson<T>(url: string, body: unknown): Promise<ApiEnvelope<T>> {
  return requestJson<T>(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...getAuthHeaders()
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

function resolveRequestTimeoutMs(url: string) {
  if (url.includes("/api/materials/collect-eventwang-free")) return 520000;
  if (url.includes("/api/xhs/drafts/save")) return 930000;
  if (url.includes("/api/mobile-publish-packages")) return 90000;
  if (url.includes("/api/xhs/scrape")) return 330000;
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

