import { performance } from 'perf_hooks';

const shouldLog = 'ZONEINFO_DEBUG' in process.env;

export function log(...msgs: unknown[]): void {
  if (shouldLog) {
    console.log(...msgs);
  }
}

function round(n: number): number {
  return Math.round(n * 1e3) / 1e3;
}

export function timer(): (label: string) => void {
  if (!shouldLog) {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    return () => {};
  }

  const start = performance.now();
  let prevMark: number;
  return (label: string) => {
    let mark = performance.now();
    let logLabel = `  {time ${label}}`;
    if (prevMark) {
      console.log(logLabel, round(mark - prevMark), round(mark - start));
    } else {
      console.log(logLabel, round(mark - start));
    }
    prevMark = mark;
  };
}
