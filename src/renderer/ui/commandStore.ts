// Registry where screens publish their commands for the shell (menus, Ctrl+K, hotbar).
// Listeners are told only when something visible changes; new `run` closures are swapped in
// silently, so re-registering on every render cannot loop.
import { dedupe, type Command } from './commands'

type Listener = () => void

/** What the shell shows of a list of commands (everything but the functions). */
export function commandSignature(commands: readonly Command[]): string {
  return commands
    .map((c) =>
      [
        c.id,
        c.label,
        c.menu ?? '',
        c.area,
        c.keys ?? '',
        c.enabled === false ? 0 : 1,
        c.why ?? ''
      ].join('\u0001')
    )
    .join('\u0002')
}

export class CommandStore {
  private readonly owners = new Map<symbol, readonly Command[]>()
  private readonly listeners = new Set<Listener>()
  private snapshot: Command[] = []
  private signature = ''

  /** Publishes (or replaces) the commands of one owner. */
  set(owner: symbol, commands: readonly Command[]): void {
    this.owners.set(owner, commands)
    this.refresh()
  }

  remove(owner: symbol): void {
    if (this.owners.delete(owner)) this.refresh()
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** The current list (a stable array until something visible changes). */
  getSnapshot = (): Command[] => this.snapshot

  /** Runs a command by id (with the latest closure); false when missing or disabled. */
  run(id: string): boolean {
    const command = this.find(id)
    if (!command || command.enabled === false) return false
    command.run()
    return true
  }

  find(id: string): Command | undefined {
    let found: Command | undefined
    for (const list of this.owners.values()) for (const c of list) if (c.id === id) found = c
    return found
  }

  private refresh(): void {
    const all = dedupe([...this.owners.values()].flat())
    const signature = commandSignature(all)
    if (signature === this.signature) return
    this.signature = signature
    this.snapshot = all
    for (const listener of this.listeners) listener()
  }
}
