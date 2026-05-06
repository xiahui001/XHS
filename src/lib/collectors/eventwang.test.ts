import { describe, expect, it } from "vitest";
import { extractEventwangImagesFromHtml, isAllowedEventwangUrl } from "./eventwang";

describe("eventwang collector", () => {
  it("accepts eventwang pages and rejects other domains", () => {
    expect(isAllowedEventwangUrl("https://eventwang.cn/case/123")).toBe(true);
    expect(isAllowedEventwangUrl("https://www.eventwang.cn/case/123")).toBe(true);
    expect(isAllowedEventwangUrl("https://evil.example/case/123")).toBe(false);
  });

  it("extracts absolute image urls from a public eventwang html page", () => {
    const html = `
      <html>
        <body>
          <img src="/images/a.jpg" alt="舞台主图" />
          <img data-src="https://eventwang.cn/uploads/b.png" alt="灯光" />
          <img src="data:image/png;base64,abc" alt="inline" />
          <img src="/images/a.jpg" alt="duplicate" />
        </body>
      </html>
    `;

    const result = extractEventwangImagesFromHtml(html, "https://eventwang.cn/cases/demo", 10);

    expect(result).toEqual([
      {
        url: "https://eventwang.cn/images/a.jpg",
        alt: "舞台主图",
        sourceUrl: "https://eventwang.cn/cases/demo"
      },
      {
        url: "https://eventwang.cn/uploads/b.png",
        alt: "灯光",
        sourceUrl: "https://eventwang.cn/cases/demo"
      }
    ]);
  });
});
