import { apiRequest } from './client';

export type AppIssueKind = 'Crash' | 'Bug' | 'Buffering';

export interface AppIssue {
  id: string;
  kind: AppIssueKind;
  title: string;
  details: string | null;
  screen: string | null;
  appVersion: string | null;
  platform: string | null;
  deviceInfo: string | null;
  isFatal: boolean;
  customerName: string;
  phoneNumber: string;
  createdAt: string;
  isResolved: boolean;
  resolvedAt: string | null;
}

export interface AppHealthSummary {
  openCrashes: number;
  openBugs: number;
  crashesLast7Days: number;
  bugsLast7Days: number;
  openBuffering: number;
  bufferingLast7Days: number;
  totalTaps: number;
}

export interface HeatmapScreen {
  screen: string;
  taps: number;
}

export interface Heatmap {
  screen: string;
  columns: number;
  rows: number;
  totalTaps: number;
  maxCellTaps: number;
  cells: { col: number; row: number; taps: number }[];
}

const BASE = '/api/admin/app-health';

export function getAppHealthSummary(): Promise<AppHealthSummary> {
  return apiRequest<AppHealthSummary>(`${BASE}/summary`);
}

export function listAppIssues(kind?: AppIssueKind, status?: 'open' | 'resolved'): Promise<AppIssue[]> {
  const params = new URLSearchParams();
  if (kind) params.set('kind', kind);
  if (status) params.set('status', status);
  const qs = params.toString();
  return apiRequest<AppIssue[]>(`${BASE}/issues${qs ? `?${qs}` : ''}`);
}

export async function setAppIssueResolved(id: string, resolved: boolean): Promise<void> {
  await apiRequest<void>(`${BASE}/issues/${id}/${resolved ? 'resolve' : 'reopen'}`, { method: 'POST' });
}

export function listHeatmapScreens(): Promise<HeatmapScreen[]> {
  return apiRequest<HeatmapScreen[]>(`${BASE}/heatmap/screens`);
}

export function getHeatmap(screen: string): Promise<Heatmap> {
  return apiRequest<Heatmap>(`${BASE}/heatmap?screen=${encodeURIComponent(screen)}`);
}

export async function resetHeatmap(screen: string): Promise<void> {
  await apiRequest<void>(`${BASE}/heatmap?screen=${encodeURIComponent(screen)}`, { method: 'DELETE' });
}
