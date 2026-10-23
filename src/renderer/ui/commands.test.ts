import { describe, expect, it } from 'vitest'
import { dedupe, fold, groupMenus, matchScore, searchCommands, type Command } from './commands'

const cmd = (id: string, label: string, extra: Partial<Command> = {}): Command => ({
  id,
  label,
  area: 'Pack',
  run: () => undefined,
  ...extra
})

describe('command search', () => {
  it('folds accents and case', () => {
    expect(fold('Novità È')).toBe('novita e')
  })

  it('needs every word and prefers word starts', () => {
    expect(matchScore('esp zip', 'Esporta il pack (zip)…')).toBe(5)
    expect(matchScore('porta', 'Esporta il pack')).toBe(1)
    expect(matchScore('salva png', 'Salva')).toBeNull()
    expect(matchScore('', 'anything')).toBe(0)
  })

  it('ranks label matches first, disabled last, keeps order on ties', () => {
    const list = [
      cmd('a', 'Apri cartella…'),
      cmd('b', 'Esporta il pack (zip)…', { area: 'Pubblica' }),
      cmd('c', 'Copia nel gioco ora', { area: 'Pubblica', enabled: false }),
      cmd('d', 'Apri zip…')
    ]
    expect(searchCommands('apri', list).map((c) => c.id)).toEqual(['a', 'd'])
    expect(searchCommands('pubblica', list).map((c) => c.id)).toEqual(['b', 'c'])
    expect(searchCommands('', list, 2).map((c) => c.id)).toEqual(['a', 'b'])
  })
})

describe('menus', () => {
  it('group by menu in the given order and drop empty menus', () => {
    const list = [
      cmd('x', 'Esci', { menu: 'File' }),
      cmd('y', 'Guida', { menu: 'Aiuto' }),
      cmd('z', 'Solo ricerca')
    ]
    expect(
      groupMenus(list, ['File', 'Modifica', 'Aiuto']).map(([m, c]) => [m, c.map((k) => k.id)])
    ).toEqual([
      ['File', ['x']],
      ['Aiuto', ['y']]
    ])
  })

  it('keep the last registration of an id', () => {
    const list = dedupe([cmd('s', 'Salva'), cmd('t', 'Prova'), cmd('s', 'Salva (nuova)')])
    expect(list.map((c) => c.label)).toEqual(['Salva (nuova)', 'Prova'])
  })
})
