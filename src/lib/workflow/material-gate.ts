export type MaterialConnectorGate = {
  key: string;
  label: string;
  status: string;
  message?: string;
};

export function getMaterialHardBlocker(connectors: MaterialConnectorGate[]) {
  const eventwangConnector = connectors.find((connector) => connector.key === "eventwang");
  if (eventwangConnector?.status === "ready") return null;

  return `${eventwangConnector?.label || "活动汪图库采集"}：${eventwangConnector?.message || "真实在线检测未通过"}`;
}
