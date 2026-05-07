"use client";

import { useEffect, useMemo, useState } from "react";
import { buildMobilePublishActionSteps, type MobilePublishActionStep } from "@/lib/publish/mobile-actions";

type MobilePackageData = {
  packageId: string;
  draftId: string;
  accountName: string;
  title: string;
  body: string;
  tags: string[];
  shareText: string;
  deeplinkUrl: string;
  imageUrls: string[];
};

export default function MobilePublishPage() {
  const [packageData, setPackageData] = useState<MobilePackageData | null>(null);
  const [status, setStatus] = useState("正在加载发布包");
  const [busyAction, setBusyAction] = useState<MobilePublishActionStep["key"] | null>(null);

  useEffect(() => {
    const currentUrl = new URL(window.location.href);
    const nextDataUrl = currentUrl.searchParams.get("data")?.trim() ?? "";

    if (!nextDataUrl) {
      setStatus("缺少发布包数据链接");
      return;
    }

    void loadPackage(nextDataUrl);
  }, []);

  const tagText = useMemo(() => packageData?.tags.map((tag) => `#${tag}`).join(" ") ?? "", [packageData]);
  const steps = useMemo(
    () => buildMobilePublishActionSteps(packageData?.imageUrls.length ?? 0),
    [packageData?.imageUrls.length]
  );

  async function loadPackage(nextDataUrl: string) {
    try {
      const response = await fetch(nextDataUrl, { cache: "no-store" });
      if (!response.ok) throw new Error(`发布包数据加载失败：HTTP ${response.status}`);
      const payload = (await response.json()) as MobilePackageData;
      setPackageData(payload);
      setStatus("发布包已就绪，请按顺序完成 3 步");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "发布包数据加载失败");
    }
  }

  async function saveImagesToPhone() {
    if (!packageData) return;
    setBusyAction("save-images");
    setStatus(`正在准备 ${packageData.imageUrls.length} 张图片`);

    try {
      const files = await buildShareFiles(packageData.imageUrls);
      if (!navigator.share) {
        throw new Error("当前浏览器不支持系统分享，请用手机系统浏览器重新扫码");
      }
      if (!files.length) {
        throw new Error("图片文件未能加载，无法保存到本机");
      }
      if (navigator.canShare && !navigator.canShare({ files })) {
        throw new Error("当前浏览器不支持多图保存，请换用手机系统浏览器扫码");
      }

      await navigator.share({
        title: packageData.title,
        files
      });
      setStatus("系统菜单已打开，请选择保存图片或存储到照片");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "保存图片失败");
    } finally {
      setBusyAction(null);
    }
  }

  async function copyText() {
    if (!packageData) return;
    setBusyAction("copy-text");

    try {
      await navigator.clipboard.writeText(packageData.shareText);
      setStatus("文案已复制，可以粘贴到小红书发布页");
    } catch {
      setStatus("当前浏览器未授权复制，请长按下方文案手动复制");
    } finally {
      setBusyAction(null);
    }
  }

  function openXhsPostEntry() {
    if (!packageData) return;
    setStatus("正在打开小红书发布入口");
    window.location.href = packageData.deeplinkUrl;
  }

  function runStep(stepKey: MobilePublishActionStep["key"]) {
    if (stepKey === "save-images") void saveImagesToPhone();
    if (stepKey === "copy-text") void copyText();
    if (stepKey === "open-xhs") openXhsPostEntry();
  }

  return (
    <main className="mobile-publish-shell">
      {packageData ? (
        <>
          <header className="mobile-publish-hero">
            <div className="mobile-publish-meta">
              <span>{packageData.accountName || "未绑定账号"}</span>
              <span>{packageData.imageUrls.length} 张图</span>
              <span>{packageData.packageId}</span>
            </div>
            <h1>{packageData.title}</h1>
            <p>{packageData.body}</p>
            <small>{tagText}</small>
            <div className="mobile-publish-status">{status}</div>
          </header>

          <section className="mobile-publish-panel mobile-publish-steps">
            {steps.map((step) => (
              <button
                className="mobile-step-button"
                disabled={busyAction !== null}
                key={step.key}
                onClick={() => runStep(step.key)}
                type="button"
              >
                <span>{step.stepLabel}</span>
                <strong>{busyAction === step.key ? "处理中" : step.label}</strong>
                <small>{step.detail}</small>
              </button>
            ))}
          </section>

          <section className="mobile-publish-panel">
            <h2>文案</h2>
            <pre>{packageData.shareText}</pre>
          </section>

          <section className="mobile-publish-panel">
            <h2>图片</h2>
            <div className="mobile-publish-images">
              {packageData.imageUrls.map((imageUrl, index) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt={`发布图 ${index + 1}`} key={imageUrl} src={imageUrl} />
              ))}
            </div>
          </section>
        </>
      ) : (
        <section className="mobile-publish-panel">
          <h1>手机发布包</h1>
          <p>{status}</p>
        </section>
      )}
    </main>
  );
}

async function buildShareFiles(imageUrls: string[]) {
  const files: File[] = [];

  for (let index = 0; index < imageUrls.length; index += 1) {
    const imageUrl = imageUrls[index];
    const response = await fetch(imageUrl);
    if (!response.ok) continue;

    const blob = await response.blob();
    const mime = blob.type || "image/jpeg";
    const extension = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
    files.push(new File([blob], `xhs-${index + 1}.${extension}`, { type: mime }));
  }

  return files;
}
