import writeXlsxFile from 'write-excel-file/browser';
import type { OtpHistory, OtpStats } from '../types';
import { parseApiDate } from './format';

const bold = (value: string) => ({ value, fontWeight: 'bold' as const });

function rate(part: number, whole: number): number | null {
  return whole === 0 ? null : part / whole;
}

function monthName(month: string): string {
  const [year, m] = month.split('-').map(Number);
  return new Date(year, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

/** Builds the OTP workbook (Summary, Day wise, Monthly, All requests) and downloads it. */
export async function downloadOtpExcel(stats: OtpStats, history: OtpHistory): Promise<void> {
  const percentCell = (part: number, whole: number) => {
    const r = rate(part, whole);
    return r === null ? null : { value: r, format: '0%' };
  };

  const busiest = history.daily.reduce<(typeof history.daily)[number] | null>(
    (best, d) => (best === null || d.requested > best.requested ? d : best),
    null,
  );

  const summary = [
    [bold('Phone OTP summary'), null, null, null],
    [bold('Period'), bold('OTPs requested'), bold('Used to sign in'), bold('Used %')],
    ['Today', stats.today, stats.verifiedToday, percentCell(stats.verifiedToday, stats.today)],
    ['Last 7 days', stats.last7Days, stats.verifiedLast7Days, percentCell(stats.verifiedLast7Days, stats.last7Days)],
    ['Last 30 days', stats.last30Days, stats.verifiedLast30Days, percentCell(stats.verifiedLast30Days, stats.last30Days)],
    ['All time', stats.totalAllTime, stats.verifiedAllTime, percentCell(stats.verifiedAllTime, stats.totalAllTime)],
    [null, null, null, null],
    ['Different phones, last 30 days', stats.uniquePhonesLast30Days, null, null],
    ['Busiest day', busiest ? `${busiest.date} (${busiest.requested} OTPs)` : null, null, null],
    [
      'Tracked since',
      stats.firstRequestedAt ? { value: parseApiDate(stats.firstRequestedAt), format: 'dd mmm yyyy hh:mm' } : null,
      null,
      null,
    ],
    ['Report created', { value: new Date(), format: 'dd mmm yyyy hh:mm' }, null, null],
    [null, null, null, null],
    ['Days are India calendar days. "Used" means the code was entered correctly and the person signed in.', null, null, null],
  ];

  const dayWise = [
    [bold('Date'), bold('OTPs requested'), bold('Used to sign in'), bold('Used %'), bold('Different phones')],
    ...[...history.daily].reverse().map((d) => [
      d.date,
      d.requested,
      d.verified,
      percentCell(d.verified, d.requested),
      d.uniquePhones,
    ]),
  ];

  const monthly = [
    [bold('Month'), bold('OTPs requested'), bold('Used to sign in'), bold('Used %'), bold('Different phones'), bold('Days with OTPs')],
    ...[...history.monthly].reverse().map((m) => [
      monthName(m.month),
      m.requested,
      m.verified,
      percentCell(m.verified, m.requested),
      m.uniquePhones,
      m.activeDays,
    ]),
  ];

  const requests = [
    [bold('Requested at'), bold('Phone'), bold('Status'), bold('Attempts')],
    ...history.requests.map((r) => [
      { value: parseApiDate(r.requestedAt), format: 'dd mmm yyyy hh:mm' },
      r.phone,
      r.status,
      r.attempts,
    ]),
  ];

  const stamp = new Date().toISOString().slice(0, 10);
  await writeXlsxFile([
    { data: summary, sheet: 'Summary', columns: [{ width: 34 }, { width: 22 }, { width: 18 }, { width: 10 }] },
    { data: dayWise, sheet: 'Day wise', columns: [{ width: 14 }, { width: 16 }, { width: 16 }, { width: 10 }, { width: 18 }], stickyRowsCount: 1 },
    { data: monthly, sheet: 'Monthly', columns: [{ width: 20 }, { width: 16 }, { width: 16 }, { width: 10 }, { width: 18 }, { width: 16 }], stickyRowsCount: 1 },
    { data: requests, sheet: 'All requests', columns: [{ width: 22 }, { width: 16 }, { width: 12 }, { width: 10 }], stickyRowsCount: 1 },
  ]).toFile(`phone-otps-${stamp}.xlsx`);
}
