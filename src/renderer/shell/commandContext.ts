// React side of the command registry: screens publish with useCommands, the shell reads with
// useCommandList. One store for the whole window.
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react'
import type { Command } from '../ui/commands'
import { CommandStore } from '../ui/commandStore'

export const CommandContext = createContext<CommandStore>(new CommandStore())

/** Publishes this component's commands while it is mounted (re-published after every render). */
export function useCommands(commands: readonly Command[]): void {
  const store = useContext(CommandContext)
  const [owner] = useState(() => Symbol('commands'))
  useEffect(() => {
    store.set(owner, commands)
  })
  useEffect(() => () => store.remove(owner), [store, owner])
}

/** Every published command (re-renders when something visible changes). */
export function useCommandList(): Command[] {
  const store = useContext(CommandContext)
  return useSyncExternalStore(store.subscribe, store.getSnapshot)
}

export function useCommandStore(): CommandStore {
  return useContext(CommandContext)
}
