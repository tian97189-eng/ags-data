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
  IconUsers,
  IconNote,
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
  { path: '/cycle', label: '周期', icon: IconCycle },
  { path: '/query', label: '查询', icon: IconQuery },
  { path: '/extras', label: '指标', icon: IconExtras },
  { path: '/chart', label: '可视', icon: IconChart },
  { path: '/stats', label: '统计', icon: IconStats },
  { path: '/experiment', label: '实验', icon: IconNote },
  { path: '/other', label: '他人', icon: IconUsers },
  { path: '/settings', label: '设置', icon: IconSettings },
];