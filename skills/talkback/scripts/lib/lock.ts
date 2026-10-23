import fs from "node:fs"
import path from "node:path"

const POLL_MS = 100
// macOS flock-style open: the kernel drops the lock when the holder exits, even on SIGKILL.
const O_EXLOCK = (fs.constants as Record<string, number>).O_EXLOCK ?? 0x20
const LOCK_FLAGS = fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_NONBLOCK | O_EXLOCK

export class AbortedError extends Error {}

// Machine-wide playback lock shared by every session's watcher.
export class PlayLock {
  private fd: number | null = null

  constructor(
    private file: string,
    private waitingDir: string,
    private id: string,
  ) {}

  async acquire(signal: AbortSignal): Promise<void> {
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 })
    fs.mkdirSync(this.waitingDir, { recursive: true, mode: 0o700 })
    const marker = path.join(this.waitingDir, this.id)
    try {
      for (;;) {
        if (signal.aborted) throw new AbortedError()
        if (this.tryOpen()) return
        fs.writeFileSync(marker, "")
        await Bun.sleep(POLL_MS)
      }
    } finally {
      fs.rmSync(marker, { force: true })
    }
  }

  release(): void {
    if (this.fd === null) return
    fs.closeSync(this.fd)
    this.fd = null
  }

  // For a process about to exit: the finally in acquire() never runs after process.exit.
  abandon(): void {
    this.release()
    fs.rmSync(path.join(this.waitingDir, this.id), { force: true })
  }

  othersWaiting(): boolean {
    try {
      return fs.readdirSync(this.waitingDir).some((f) => f !== this.id)
    } catch {
      return false
    }
  }

  private tryOpen(): boolean {
    try {
      this.fd = fs.openSync(this.file, LOCK_FLAGS, 0o600)
      return true
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (code === "EAGAIN" || code === "EWOULDBLOCK") return false
      throw e
    }
  }
}
