export class Timer {
  private startTime: number | null = null;
  private endTime: number | null = null;

  start(): void {
    this.startTime = Date.now();
    this.endTime = null;
  }

  stop(): void {
    if (this.startTime !== null) {
      this.endTime = Date.now();
    }
  }

  getElapsed(): number {
    if (this.startTime === null) {
      return 0;
    }
    if (this.endTime !== null) {
      return this.endTime - this.startTime;
    }
    return Date.now() - this.startTime;
  }
}
