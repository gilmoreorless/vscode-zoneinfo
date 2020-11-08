import { performance } from 'perf_hooks';

export function timer(): (label: string) => void {
  const start = performance.now();
  let prevMark: number;
  return (label: string) => {
    let mark = performance.now();
    let logLabel = `  {time ${label}}`;
    if (prevMark) {
      console.log(logLabel, mark - prevMark, mark - start);
    } else {
      console.log(logLabel, mark - start);
    }
    prevMark = mark;
  }
}
