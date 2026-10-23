import { afterEach, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import { AbortedError, PlayLock } from "../scripts/lib/lock"
import { tempHome, waitFor } from "./helpers"

const children: Bun.Subprocess[] = []
afterEach(() => children.splice(0).forEach((c) => c.kill("SIGKILL")))

function setup() {
  const dir = tempHome()
  return { file: path.join(dir, "play.lock"), waiting: path.join(dir, "waiting") }
}

// Another watcher holding the lock: a separate process, since the lock belongs to the open file.
async function holder(file: string, waiting: string) {
  const script = `import { PlayLock } from ${JSON.stringify(path.resolve(import.meta.dir, "../scripts/lib/lock"))}
await new PlayLock(${JSON.stringify(file)}, ${JSON.stringify(waiting)}, "holder").acquire(new AbortController().signal)
console.log("locked")
await Bun.sleep(60_000)`
  const p = Bun.spawn([process.execPath, "-e", script], { stdout: "pipe" })
  children.push(p)
  const reader = p.stdout.getReader()
  await reader.read()
  return p
}

test("waits while another process holds the lock and marks itself as waiting", async () => {
  const { file, waiting } = setup()
  const other = await holder(file, waiting)
  const lock = new PlayLock(file, waiting, "me")
  let acquired = false
  const pending = lock.acquire(new AbortController().signal).then(() => (acquired = true))
  await waitFor(() => fs.existsSync(path.join(waiting, "me")), 2000, "waiting marker")
  expect(acquired).toBe(false)
  other.kill("SIGTERM")
  await pending
  expect(fs.existsSync(path.join(waiting, "me"))).toBe(false)
  lock.release()
})

// The holder dying without cleanup must not leave the machine silent.
test("takes the lock once a holder is killed with SIGKILL", async () => {
  const { file, waiting } = setup()
  const other = await holder(file, waiting)
  other.kill("SIGKILL")
  await other.exited
  const lock = new PlayLock(file, waiting, "me")
  await lock.acquire(new AbortController().signal)
  lock.release()
})

test("stops waiting when aborted", async () => {
  const { file, waiting } = setup()
  await holder(file, waiting)
  const ac = new AbortController()
  const pending = new PlayLock(file, waiting, "me").acquire(ac.signal)
  setTimeout(() => ac.abort(), 200)
  await expect(pending).rejects.toBeInstanceOf(AbortedError)
  expect(fs.existsSync(path.join(waiting, "me"))).toBe(false)
})

// A watcher exits with process.exit, so acquire()'s own cleanup never runs; a leftover marker would slow every session.
test("abandon releases the lock and removes the waiting marker", async () => {
  const { file, waiting } = setup()
  await holder(file, waiting)
  const lock = new PlayLock(file, waiting, "me")
  const ac = new AbortController()
  const pending = lock.acquire(ac.signal).catch(() => {})
  await waitFor(() => fs.existsSync(path.join(waiting, "me")), 2000, "waiting marker")
  lock.abandon()
  expect(fs.existsSync(path.join(waiting, "me"))).toBe(false)
  ac.abort()
  await pending
})

test("sees other sessions waiting, but not itself", () => {
  const { file, waiting } = setup()
  fs.mkdirSync(waiting, { recursive: true })
  const lock = new PlayLock(file, waiting, "me")
  fs.writeFileSync(path.join(waiting, "me"), "")
  expect(lock.othersWaiting()).toBe(false)
  fs.writeFileSync(path.join(waiting, "other"), "")
  expect(lock.othersWaiting()).toBe(true)
})
