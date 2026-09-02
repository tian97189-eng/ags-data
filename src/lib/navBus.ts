/**
 * 轻量跨页跳转（模块级待消费状态）
 * 用于：录入页指标卡「方法」→ 其他指标-实验方法详情（按名称匹配后打开）
 *      方法详情「去录入」→ 回到录入页
 * 不依赖路由 query 传参，避免 HashRouter/useSearchParams 的上下文要求。
 */

let pendingMethod: string | null = null;

/** 请求打开某个实验方法文档并跳到方法库 */
export function gotoMethod(methodName: string): void {
  pendingMethod = methodName;
  window.location.hash = '#/extras';
}

/** 跳回数据录入页 */
export function gotoEntry(): void {
  window.location.hash = '#/entry';
}

/** 消费一次待打开的 method（由目标页挂载时调用） */
export function consumePendingMethod(): string | null {
  const m = pendingMethod;
  pendingMethod = null;
  return m;
}
