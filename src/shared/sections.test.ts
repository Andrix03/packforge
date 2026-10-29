import { describe, expect, it } from 'vitest'
import { SECTION_GROUPS, SECTION_IDS, groupOf, sectionOf } from './sections'

const T = 'assets/minecraft/textures/'

describe('sectionOf', () => {
  it.each([
    [`${T}block/stone.png`, 'blocks'],
    ['assets/minecraft/blockstates/stone.json', 'blocks'],
    ['assets/minecraft/models/block/stone.json', 'blocks'],
    [`${T}item/apple.png`, 'items'],
    ['assets/minecraft/items/apple.json', 'items'],
    ['assets/minecraft/models/item/apple.json', 'items'],
    [`${T}map/map_background.png`, 'items'],
    [`${T}entity/equipment/humanoid/iron.png`, 'armor'],
    [`${T}trims/entity/humanoid/coast.png`, 'armor'],
    [`${T}palettes/trim/gold.png`, 'armor'],
    ['assets/minecraft/equipment/iron.json', 'armor'],
    [`${T}entity/zombie/zombie.png`, 'entities'],
    [`${T}entity/chest/normal.png`, 'entities'],
    [`${T}gui/sprites/widget/button.png`, 'gui'],
    [`${T}mob_effect/speed.png`, 'gui'],
    [`${T}gui/title/minecraft.png`, 'screens'],
    [`${T}gui/title/background/panorama_0.png`, 'screens'],
    ['assets/minecraft/texts/splashes.txt', 'screens'],
    [`${T}colormap/foliage.png`, 'world'],
    ['assets/minecraft/polytone/colormaps/autumn.png', 'world'],
    [`${T}environment/sun.png`, 'world'],
    [`${T}particle/flame.png`, 'world'],
    [`${T}painting/kebab.png`, 'world'],
    ['assets/minecraft/lang/it_it.json', 'texts'],
    ['assets/mymod/textures/block/ruby_ore.png', 'blocks']
  ])('%s is in %s', (path, section) => {
    expect(sectionOf(path)).toBe(section)
  })

  it.each([
    'pack.mcmeta',
    'pack.png',
    'assets/minecraft/font/default.json',
    `${T}font/ascii.png`,
    'assets/minecraft/shaders/core/terrain.vsh',
    'assets/minecraft/atlases/blocks.json',
    'assets/minecraft/models/entity/thing.json',
    'assets/minecraft/sounds.json'
  ])('%s has no section', (path) => {
    expect(sectionOf(path)).toBeNull()
  })
})

describe('groupOf', () => {
  it.each([
    [`${T}block/stone.png`, 'stone'],
    [`${T}block/deepslate_diamond_ore.png`, 'ores'],
    [`${T}block/iron_block.png`, 'ores'],
    [`${T}block/oak_planks.png`, 'wood'],
    [`${T}block/spruce_log_top.png`, 'wood'],
    [`${T}block/red_stained_glass.png`, 'glass'],
    [`${T}block/oak_leaves.png`, 'plants'],
    [`${T}block/wheat_stage3.png`, 'plants'],
    [`${T}block/red_wool.png`, 'dyed'],
    [`${T}block/sand.png`, 'earth'],
    [`${T}block/red_sand.png`, 'earth'],
    [`${T}block/sandstone.png`, 'stone'],
    [`${T}block/furnace_front.png`, 'utility'],
    [`${T}block/sponge.png`, 'other'],
    [`${T}block/glowstone.png`, 'other']
  ])('block %s is in %s', (path, group) => {
    expect(groupOf('blocks', path)).toBe(group)
  })

  it.each([
    [`${T}item/diamond_sword.png`, 'tools'],
    [`${T}item/iron_chestplate.png`, 'armor'],
    [`${T}item/apple.png`, 'food'],
    [`${T}item/iron_ingot.png`, 'materials'],
    [`${T}item/potion.png`, 'potions'],
    [`${T}item/music_disc_cat.png`, 'records'],
    [`${T}map/map_background.png`, 'records'],
    [`${T}item/oak_door.png`, 'decor'],
    [`${T}item/zombie_spawn_egg.png`, 'eggs']
  ])('item %s is in %s', (path, group) => {
    expect(groupOf('items', path)).toBe(group)
  })

  it('names entity groups from the mob folder', () => {
    expect(groupOf('entities', `${T}entity/zombie/husk.png`)).toBe('hostile')
    expect(groupOf('entities', `${T}entity/cow/cold_cow.png`)).toBe('passive')
    expect(groupOf('entities', `${T}entity/chest/normal.png`)).toBe('special')
    expect(groupOf('entities', `${T}entity/signs/oak.png`)).toBe('special')
    expect(groupOf('entities', `${T}entity/boat/oak.png`)).toBe('vehicles')
    expect(groupOf('entities', `${T}entity/enderdragon/dragon.png`)).toBe('bosses')
  })

  it('names armor groups from the equipment folder', () => {
    expect(groupOf('armor', `${T}entity/equipment/humanoid/iron.png`)).toBe('humanoid')
    expect(groupOf('armor', `${T}entity/equipment/horse_body/gold.png`)).toBe('horse_body')
    expect(groupOf('armor', `${T}trims/entity/humanoid/coast.png`)).toBe('trims')
    expect(groupOf('armor', `${T}palettes/trim/gold.png`)).toBe('trim_materials')
  })

  it('splits the GUI by what it draws', () => {
    expect(groupOf('gui', `${T}gui/sprites/widget/button.png`)).toBe('widgets')
    expect(groupOf('gui', `${T}gui/container/inventory.png`)).toBe('containers')
    expect(groupOf('gui', `${T}gui/sprites/hud/heart/full.png`)).toBe('hud')
    expect(groupOf('gui', `${T}gui/sprites/boss_bar/red_progress.png`)).toBe('hud')
    expect(groupOf('gui', `${T}mob_effect/speed.png`)).toBe('icons')
    expect(groupOf('gui', `${T}gui/menu_background.png`)).toBe('menus')
    expect(groupOf('gui', `${T}gui/advancements/backgrounds/stone.png`)).toBe('advancements')
  })

  it('splits the world', () => {
    expect(groupOf('world', `${T}colormap/grass.png`)).toBe('biomes')
    expect(groupOf('world', 'assets/minecraft/polytone/colormaps/autumn.png')).toBe('polytone')
    expect(groupOf('world', `${T}environment/moon_phases.png`)).toBe('sky')
    expect(groupOf('world', `${T}environment/clouds.png`)).toBe('weather')
    expect(groupOf('world', `${T}particle/flame.png`)).toBe('particles')
    expect(groupOf('world', `${T}painting/kebab.png`)).toBe('paintings')
    expect(groupOf('world', `${T}misc/vignette.png`)).toBe('screen_effects')
  })

  it('lists groups for every section', () => {
    for (const id of SECTION_IDS) expect(SECTION_GROUPS[id].length).toBeGreaterThan(0)
  })
})
