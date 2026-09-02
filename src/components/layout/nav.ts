import type { ComponentType, SVGProps } from 'react';
import {
  IconOverview,
  IconEntry,
  IconCycle,
  IconQuery,
  IconExtras,
  IconChart,
  IconStats,
  IconSettings,
} from '../common/Icons';

export type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

/** 导航项：path / label / icon（顺序决定侧边栏和底部导航的排列） */
export interface NavItem {
  path: string;
  label: string;
  icon: IconComponent;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { path: '/overview', label: '概览', icon: IconOverview },
  { path: '/entry', label: '录入', icon: IconEntry },
  { path: '/cycle', label: '全周期', icon: IconCycle },
  { path: '/query', label: '查询', icon: IconQuery },
  { path: '/extras', label: '其他指标', icon: IconExtras },
  { path: '/chart', label: '可视化', icon: IconChart },
  { path: '/stats', label: '统计分析', icon: IconStats },
  { path: '/settings', label: '设置', icon: IconSettings },
];