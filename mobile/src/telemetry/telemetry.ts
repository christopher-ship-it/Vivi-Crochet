import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { apiRequest } from '../api/client';

/** Heatmap grid; must match ScreenTapCell.GridColumns / GridRows on the API. */
export const GRID_COLUMNS = 10;
export const GRID_ROWS = 20;

const PENDING_CRASH_KEY = 'vivi.telemetry.pendingCrash';
const MAX_ISSUES_PER_SESSION = 5;
const FLUSH_INTERVAL_MS = 30_000;

export type IssueKind = 'Crash' | 'Bug' | 'Buffering';

interface IssuePayload {
  kind: IssueKind;
  title: string;
  details?: string;
  screen?: string;
  isFatal?: boolean;
}

let currentScreen = 'unknown';
const issuesSent: Partial<Record<IssueKind, number>> = {};
const tapBuffer = new Map<string, Map<string, number>>();
let flushTimer: ReturnType<typeof setInterval> | null = null;

export function setCurrentScreen(screen: string): void {
  currentScreen = screen || 'unknown';
}

function truncate(value: string | undefined, max: number): string | undefined {
  return value && value.length > max ? value.slice(0, max) : value;
}

function withContext(payload: IssuePayload) {
  return {
    kind: payload.kind,
    title: truncate(payload.title, 300) ?? 'Unknown error',
    details: truncate(payload.details, 8000),
    screen: truncate(payload.screen ?? currentScreen, 200),
    isFatal: payload.isFatal ?? false,
    appVersion: truncate(Constants.expoConfig?.version, 40),
    platform: Platform.OS,
    deviceInfo: truncate(
      [Device.modelName, Device.osVersion ? `${Platform.OS} ${Device.osVersion}` : null]
        .filter(Boolean)
        .join(', '),
      300,
    ),
  };
}

async function postIssue(body: ReturnType<typeof withContext>): Promise<void> {
  await apiRequest<void>('/api/app-telemetry/issues', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** Sends a crash/bug report. Never throws — telemetry must not cause errors of its own. */
export async function reportIssue(payload: IssuePayload): Promise<void> {
  // Capped per kind so a buffering storm can't use up the crash quota.
  if ((issuesSent[payload.kind] ?? 0) >= MAX_ISSUES_PER_SESSION) return;
  issuesSent[payload.kind] = (issuesSent[payload.kind] ?? 0) + 1;
  const body = withContext(payload);
  try {
    await postIssue(body);
  } catch {
    // Offline or server down: keep fatal crashes to retry on next launch.
    if (payload.isFatal) await savePendingCrash(body);
  }
}

export function errorToPayload(error: unknown, isFatal: boolean): IssuePayload {
  const err = error instanceof Error ? error : new Error(String(error));
  return {
    kind: 'Crash',
    title: `${err.name}: ${err.message}`,
    details: err.stack,
    isFatal,
  };
}

async function savePendingCrash(body: ReturnType<typeof withContext>): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_CRASH_KEY, JSON.stringify(body));
  } catch {
    // ignore
  }
}

/**
 * A fatal JS error usually kills the process before the network call finishes, so the
 * crash is stored first and sent on the next launch.
 */
export async function recordFatalCrash(error: unknown): Promise<void> {
  await savePendingCrash(withContext(errorToPayload(error, true)));
}

async function sendPendingCrash(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_CRASH_KEY);
    if (!raw) return;
    await postIssue(JSON.parse(raw));
    await AsyncStorage.removeItem(PENDING_CRASH_KEY);
  } catch {
    // Keep it for the next launch.
  }
}

/** Counts a tap for the heatmap. x/y are page coordinates in dp. */
export function recordTap(x: number, y: number, width: number, height: number): void {
  if (width <= 0 || height <= 0) return;
  const col = Math.min(GRID_COLUMNS - 1, Math.max(0, Math.floor((x / width) * GRID_COLUMNS)));
  const row = Math.min(GRID_ROWS - 1, Math.max(0, Math.floor((y / height) * GRID_ROWS)));
  let cells = tapBuffer.get(currentScreen);
  if (!cells) {
    cells = new Map();
    tapBuffer.set(currentScreen, cells);
  }
  const key = `${col}:${row}`;
  cells.set(key, (cells.get(key) ?? 0) + 1);
}

export async function flushTaps(): Promise<void> {
  const batches = [...tapBuffer.entries()];
  tapBuffer.clear();
  for (const [screen, cells] of batches) {
    const payload = {
      screen,
      cells: [...cells.entries()].map(([key, taps]) => {
        const [col, row] = key.split(':').map(Number);
        return { col, row, taps: Math.min(taps, 500) };
      }),
    };
    if (payload.cells.length === 0) continue;
    try {
      await apiRequest<void>('/api/app-telemetry/taps', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch {
      // Heatmap is best-effort; drop the batch.
    }
  }
}

/** Call once at startup: sends any crash saved last run and starts periodic tap flushing. */
export function startTelemetry(): void {
  void sendPendingCrash();
  if (!flushTimer) flushTimer = setInterval(() => void flushTaps(), FLUSH_INTERVAL_MS);
}
