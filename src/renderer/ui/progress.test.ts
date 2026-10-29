import { describe, expect, it } from 'vitest'
import { litCells } from './progress'

describe('litCells', () => {
  it('is empty before the job starts or without a total', () => {
    expect(litCells(0, 10, 24)).toBe(0)
    expect(litCells(3, 0, 24)).toBe(0)
    expect(litCells(Number.NaN, 10, 24)).toBe(0)
  })

  it('lights one segment as soon as something is done', () => {
    expect(litCells(1, 1000, 24)).toBe(1)
  })

  it('keeps the last segment for the end', () => {
    expect(litCells(999, 1000, 24)).toBe(23)
    expect(litCells(1000, 1000, 24)).toBe(24)
    expect(litCells(1200, 1000, 24)).toBe(24)
  })

  it('is proportional in between', () => {
    expect(litCells(50, 100, 24)).toBe(12)
  })
})
