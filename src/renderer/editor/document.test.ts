import { describe, expect, it } from 'vitest'
import { EditorDocument, MAX_LAYERS } from './document'
import { History } from './history'
import { getPixel, setPixel, type Rgba } from './pixels'

const RED: Rgba = [255, 0, 0, 255]
const BLUE: Rgba = [0, 0, 255, 255]

describe('EditorDocument compositing', () => {
  it('composites a single opaque layer to an exact copy, semi-transparent pixels included', () => {
    const data = Uint8Array.from([1, 2, 3, 4, 200, 100, 50, 128, 9, 9, 9, 255, 0, 0, 0, 0])
    const doc = new EditorDocument(2, 2, data)
    expect([...doc.composite.data]).toEqual([...data])
  })

  it('draws upper layers over lower ones', () => {
    const doc = new EditorDocument(1, 1, Uint8Array.from(RED))
    doc.addLayer()
    setPixel(doc.active.pixels, 0, 0, BLUE)
    doc.recomposite()
    expect(getPixel(doc.composite, 0, 0)).toEqual(BLUE)
  })

  it('blends with layer opacity and skips hidden layers', () => {
    const doc = new EditorDocument(1, 1, Uint8Array.from(RED))
    doc.addLayer()
    setPixel(doc.active.pixels, 0, 0, BLUE)
    doc.setOpacity(doc.activeId, 0.5)
    expect(getPixel(doc.composite, 0, 0)).toEqual([128, 0, 128, 255])
    doc.setVisible(doc.activeId, false)
    expect(getPixel(doc.composite, 0, 0)).toEqual(RED)
  })

  it('keeps transparency where no layer paints', () => {
    const doc = new EditorDocument(1, 1)
    doc.addLayer()
    expect(getPixel(doc.composite, 0, 0)).toEqual([0, 0, 0, 0])
  })

  it('combines semi-transparent layers with straight alpha', () => {
    const doc = new EditorDocument(1, 1, Uint8Array.from([255, 0, 0, 128]))
    doc.addLayer()
    setPixel(doc.active.pixels, 0, 0, [0, 0, 255, 128])
    doc.recomposite()
    // Alpha: a + a·(1 − a) with a = 128/255 → 191.7 → 192; color weighted 2:1 toward the top.
    expect(getPixel(doc.composite, 0, 0)).toEqual([85, 0, 170, 192])
  })
})

describe('EditorDocument layer commands', () => {
  it('adds a layer above the active one, undoably', () => {
    const doc = new EditorDocument(1, 1)
    const history = new History()
    const first = doc.activeId
    history.push(doc.addLayer())
    expect(doc.layers).toHaveLength(2)
    expect(doc.activeId).not.toBe(first)
    history.undo()
    expect(doc.layers).toHaveLength(1)
    expect(doc.activeId).toBe(first)
    history.redo()
    expect(doc.layers).toHaveLength(2)
  })

  it('never removes the last layer, and restores a removed one in place', () => {
    const doc = new EditorDocument(1, 1, Uint8Array.from(RED))
    expect(doc.removeLayer(doc.activeId)).toBeNull()
    const history = new History()
    history.push(doc.addLayer())
    const top = doc.activeId
    setPixel(doc.active.pixels, 0, 0, BLUE)
    history.push(doc.removeLayer(top))
    expect(getPixel(doc.composite, 0, 0)).toEqual(RED)
    history.undo()
    expect(doc.layers.at(-1)!.id).toBe(top)
    expect(getPixel(doc.composite, 0, 0)).toEqual(BLUE)
  })

  it('moves layers up and down within bounds', () => {
    const doc = new EditorDocument(1, 1, Uint8Array.from(RED))
    const bottom = doc.activeId
    doc.addLayer()
    setPixel(doc.active.pixels, 0, 0, BLUE)
    expect(doc.moveLayer(doc.activeId, 1)).toBeNull()
    const command = doc.moveLayer(doc.activeId, -1)!
    expect(doc.layers.at(-1)!.id).toBe(bottom)
    expect(getPixel(doc.composite, 0, 0)).toEqual(RED)
    command.undo()
    expect(getPixel(doc.composite, 0, 0)).toEqual(BLUE)
  })

  it('records one opacity step for a whole slider drag', () => {
    const doc = new EditorDocument(1, 1)
    const id = doc.activeId
    // The drag applied 0.8 and 0.5 live (no command), then commits with the starting value.
    doc.setOpacity(id, 0.8)
    doc.setOpacity(id, 0.5)
    const command = doc.setOpacity(id, 0.5, 1)!
    command.undo()
    expect(doc.active.opacity).toBe(1)
    command.redo()
    expect(doc.active.opacity).toBe(0.5)
  })

  it('duplicates, renames and merges down', () => {
    const doc = new EditorDocument(1, 1, Uint8Array.from(RED))
    doc.duplicateLayer(doc.activeId)
    expect(doc.active.name).toBe('Livello 1 copia')
    expect(getPixel(doc.active.pixels, 0, 0)).toEqual(RED)
    doc.rename(doc.activeId, '  Ombre  ')
    expect(doc.active.name).toBe('Ombre')
    expect(doc.rename(doc.activeId, '   ')).toBeNull()

    setPixel(doc.active.pixels, 0, 0, BLUE)
    doc.setOpacity(doc.activeId, 0.5)
    const merge = doc.mergeDown(doc.activeId)!
    expect(doc.layers).toHaveLength(1)
    expect(getPixel(doc.active.pixels, 0, 0)).toEqual([128, 0, 128, 255])
    merge.undo()
    expect(doc.layers).toHaveLength(2)
    expect(getPixel(doc.layers[0]!.pixels, 0, 0)).toEqual(RED)
  })

  it('caps the number of layers', () => {
    const doc = new EditorDocument(1, 1)
    for (let i = 1; i < MAX_LAYERS; i++) doc.addLayer()
    expect(doc.addLayer()).toBeNull()
  })
})
