/** 保留旧 pane 标识：connect 直达 API 分组，settings 仍打开原有外观偏好。 */
export const SETTINGS_GROUPS = [
  { pane: "connect", title: "模型与 API", hint: "服务商、模型、密钥与连接测试" },
  { pane: "settings", title: "外观与排版", hint: "主题、配色、字体、字号与行距" },
] as const;

export function isSettingsPane(pane: string): boolean {
  return SETTINGS_GROUPS.some((group) => group.pane === pane);
}
