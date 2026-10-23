// A PID alone can be reused by an unrelated process, so processes are tracked as PID + start time.
export interface ProcRef {
  pid: number
  start: string
}

function ps(pid: number, field: string): string | null {
  const r = Bun.spawnSync(["ps", "-o", `${field}=`, "-p", String(pid)], { stderr: "ignore" })
  const out = r.exitCode === 0 ? r.stdout.toString().trim() : ""
  return out || null
}

export function procRef(pid: number): ProcRef | null {
  const start = ps(pid, "lstart")
  return start ? { pid, start } : null
}

export function isAlive(p: ProcRef): boolean {
  try {
    process.kill(p.pid, 0)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EPERM") return false
  }
  return ps(p.pid, "lstart") === p.start
}

export function commandLine(pid: number): string {
  return ps(pid, "command") ?? ""
}

// The watcher leads its own process group, so this also stops its say and afplay children.
export function killGroup(p: ProcRef, signal: NodeJS.Signals): void {
  try {
    process.kill(-p.pid, signal)
  } catch {
    process.kill(p.pid, signal)
  }
}
