import { describe, expect, it } from "vitest";
import { getMaterialHardBlocker } from "./material-gate";

describe("getMaterialHardBlocker", () => {
  it("allows material collection when Eventwang is ready even if XHS is warning", () => {
    expect(
      getMaterialHardBlocker([
        { key: "eventwang", label: "活动汪图库采集", status: "ready", message: "可用" },
        { key: "xhs-hotspot", label: "小红书热点参考", status: "warning", message: "真实在线检测未通过" }
      ])
    ).toBeNull();
  });

  it("blocks material collection when Eventwang is not ready", () => {
    expect(
      getMaterialHardBlocker([
        { key: "eventwang", label: "活动汪图库采集", status: "warning", message: "需要登录" },
        { key: "xhs-hotspot", label: "小红书热点参考", status: "ready", message: "可用" }
      ])
    ).toBe("活动汪图库采集：需要登录");
  });
});
