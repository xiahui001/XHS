"use client";

import { useEffect, useMemo, useState } from "react";

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
  const [sharing, setSharing] = useState(false);
  const [showFallback, setShowFallback] = useState(false);

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

  async function loadPackage(nextDataUrl: string) {
    try {
      const response = await fetch(nextDataUrl, { cache: "no-store" });
      if (!response.ok) throw new Error(`发布包数据加载失败：HTTP ${response.status}`);
      const payload = (await response.json()) as MobilePackageData;
      setPackageData(payload);
      setStatus("发布包已就绪");
      setShowFallback(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "发布包数据加载失败");
    }
  }

  async function shareToXhs() {
    if (!packageData) return;
    setSharing(true);
    setShowFallback(false);
    setStatus("正在准备图片文件");

    try {
      const files = await buildShareFiles(packageData.imageUrls);
      if (!navigator.share) {
        throw new Error("当前浏览器不支持系统分享，请用手机系统浏览器重新扫码");
      }
      if (!files.length) {
        throw new Error("图片文件未能加载，无法导入小红书");
      }
      if (navigator.canShare && !navigator.canShare({ files })) {
        throw new Error("当前浏览器不支持多图分享，请换用手机系统浏览器扫码");
      }

      await navigator.share({
        title: packageData.title,
        text: packageData.shareText,
        files
      });
      setStatus("系统分享已打开，请选择小红书并在发布页确认内容");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "系统分享失败");
      setShowFallback(true);
    } finally {
      setSharing(false);
    }
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
            <div className="mobile-publish-actions">
              <button type="button" onClick={shareToXhs} disabled={sharing}>
                {sharing ? "正在导入" : "一键导入小红书"}
              </button>
            </div>
            {showFallback ? (
              <a className="mobile-publish-fallback" href={packageData.deeplinkUrl}>
                仅打开小红书发布入口
              </a>
            ) : null}
            <div className="mobile-publish-status">{status}</div>
          </header>

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
