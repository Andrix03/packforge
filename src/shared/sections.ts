// The v3 sections of the app (one per hotbar slot): which pack files each one shows, and the
// groups its browser lists. Pure: the renderer translates the ids.

export const SECTION_IDS = [
  'pack',
  'blocks',
  'items',
  'armor',
  'entities',
  'gui',
  'screens',
  'world',
  'texts'
] as const
export type SectionId = (typeof SECTION_IDS)[number]

/** A path inside one namespace: `assets/<ns>/<rest>`. */
const ASSET = /^assets\/[^/]+\/(.+)$/

/**
 * The section that edits a pack path, or null for files no section shows (fonts, shaders,
 * sounds, atlases, pack.mcmeta...): those stay in the Pack section's file explorer.
 */
export function sectionOf(path: string): Exclude<SectionId, 'pack'> | null {
  const rest = ASSET.exec(path)?.[1]
  if (!rest) return null
  const [top = '', sub = '', third = ''] = rest.split('/')
  if (top === 'lang') return 'texts'
  if (top === 'texts') return 'screens'
  if (top === 'blockstates') return 'blocks'
  if (top === 'items') return 'items'
  if (top === 'equipment') return 'armor'
  if (top === 'polytone' || top === 'particles') return 'world'
  if (top === 'models') {
    if (sub === 'block') return 'blocks'
    if (sub === 'item') return 'items'
    return null
  }
  if (top !== 'textures') return null
  switch (sub) {
    case 'block':
      return 'blocks'
    case 'item':
    case 'map':
      return 'items'
    case 'trims':
    case 'palettes':
      return 'armor'
    case 'entity':
      return third === 'equipment' ? 'armor' : 'entities'
    case 'gui':
      return third === 'title' ? 'screens' : 'gui'
    case 'mob_effect':
      return 'gui'
    case 'colormap':
    case 'environment':
    case 'particle':
    case 'painting':
    case 'misc':
    case 'effect':
      return 'world'
    default:
      return null
  }
}

/** The folder a section opens on, under assets/minecraft/. */
export const SECTION_FOLDER: Readonly<Record<SectionId, string>> = {
  pack: 'assets/minecraft',
  blocks: 'assets/minecraft/textures/block',
  items: 'assets/minecraft/textures/item',
  armor: 'assets/minecraft/textures/entity/equipment',
  entities: 'assets/minecraft/textures/entity',
  gui: 'assets/minecraft/textures/gui/sprites/widget',
  screens: 'assets/minecraft/textures/gui/title',
  world: 'assets/minecraft/textures/colormap',
  texts: 'assets/minecraft/lang'
}

const DYES =
  'white|light_gray|gray|black|brown|red|orange|yellow|lime|green|cyan|light_blue|blue|purple|magenta|pink'

const BLOCK_GROUPS: readonly [string, RegExp][] = [
  [
    'ores',
    /(^|_)ore$|^ancient_debris|^raw_\w+_block|^(iron|gold|diamond|emerald|lapis|redstone|coal|netherite|amethyst|copper)_block|^amethyst|^budding_amethyst/
  ],
  ['glass', /glass/],
  [
    'utility',
    /furnace|smoker|anvil|barrel|beacon|brewing|cauldron|crafting|smithing|loom|cartography|fletching|lectern|composter|bookshelf|campfire|command_block|rail|piston|observer|repeater|comparator|hopper|dropper|dispenser|lever|button|pressure_plate|sculk|daylight|target|note_block|jukebox|crafter|trial_spawner|vault|spawner|enchanting|grindstone|stonecutter|respawn_anchor|lodestone|bell|beehive|bee_nest|tnt|redstone_(lamp|torch|wire)|copper_bulb|lightning_rod/
  ],
  [
    'dyed',
    new RegExp(
      `^(${DYES})_(wool|carpet|concrete|concrete_powder|terracotta|glazed_terracotta|stained_glass|bed|candle|shulker_box|banner)`
    )
  ],
  [
    'plants',
    /leaves|sapling|coral|flower|tulip|grass|fern|vine|mushroom|wheat|carrots|potatoes|beetroots|kelp|seagrass|cactus|sugar_cane|moss|azalea|lily|dandelion|poppy|orchid|allium|bluet|daisy|rose|lilac|peony|sunflower|berry|bush|roots|sprouts|dripleaf|spore|torchflower|pitcher|bamboo|cocoa|nether_wart|chorus|stem$|propagule/
  ],
  [
    'wood',
    /planks|_log|_wood|hyphae|_door|trapdoor|^(oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry|pale_oak|crimson|warped)_/
  ],
  [
    'earth',
    /dirt|sand(?!stone)|gravel|clay|mud(?!_bricks)|soul_soil|podzol|mycelium|farmland|snow|ice$|^ice|powder_snow/
  ],
  [
    'stone',
    /(?<!glow|lode|redstone_)stone|cobble|brick|andesite|diorite|granite|deepslate|tuff|basalt|calcite|dripstone|obsidian|prismarine|purpur|quartz|terracotta|netherrack|bedrock|end_stone|resin/
  ]
]

const ITEM_GROUPS: readonly [string, RegExp][] = [
  ['eggs', /spawn_egg/],
  [
    'tools',
    /sword|_axe|pickaxe|shovel|_hoe|^bow|crossbow|trident|^mace|shield|arrow|fishing_rod|shears|flint_and_steel|brush|spyglass/
  ],
  ['armor', /helmet|chestplate|leggings|boots|horse_armor|wolf_armor|elytra|turtle_scute/],
  [
    'food',
    /apple|bread|beef|porkchop|chicken|mutton|rabbit|cod|salmon|cookie|cake|stew|soup|melon_slice|berries|carrot|potato|beetroot|pie|tropical_fish|pufferfish|dried_kelp|honey_bottle|chorus_fruit/
  ],
  ['potions', /potion|bottle|tipped/],
  ['records', /music_disc|disc_fragment|_map$|^map|filled_map|compass|clock|recovery/],
  [
    'decor',
    /_door$|_sign$|_boat$|_raft$|bundle|candle|banner_pattern|pottery_sherd|bucket|_dye$|harness|cushion|armor_stand|item_frame|painting|_bed$|minecart/
  ],
  [
    'materials',
    /ingot|nugget|^diamond$|^emerald$|lapis|quartz|dust|shard|scrap|^raw_|stick|string|leather|feather|bone|slime_ball|gunpowder|blaze|ender_pearl|ghast_tear|paper|^book|brick$|^coal$|charcoal|flint|prismarine|nautilus|scute|amethyst|echo|template/
  ]
]

const ENTITY_GROUPS: readonly [string, RegExp][] = [
  [
    'special',
    /^(chest|bed|signs|banner|shulker|decorated_pot|conduit|bell|enchantment|lectern_book|shield|banner_base|armorstand|cushion|end_portal|beacon)/
  ],
  ['vehicles', /^(boat|chest_boat|minecart)/],
  ['bosses', /^(enderdragon|wither|elder_guardian)/],
  ['villagers', /^(villager|zombie_villager|wandering_trader|illager)/],
  [
    'water',
    /^(fish|squid|glow_squid|dolphin|axolotl|turtle|guardian|frog|tadpole|cod|salmon|pufferfish|tropical_fish|nautilus)/
  ],
  [
    'hostile',
    /^(zombie|skeleton|creeper|spider|enderman|slime|blaze|ghast|witch|phantom|piglin|hoglin|zoglin|warden|breeze|bogged|husk|drowned|stray|vex|evoker|pillager|ravager|silverfish|endermite|shulker_bullet|magmacube|creaking|illusioner|vindicator)/
  ],
  [
    'passive',
    /^(cow|pig|sheep|chicken|horse|donkey|mule|cat|wolf|fox|rabbit|bee|llama|parrot|panda|polar_bear|goat|camel|sniffer|armadillo|bat|mooshroom|strider|ocelot|allay|happy_ghast|iron_golem|snow_golem|copper_golem|bear|player)/
  ]
]

/** GUI folders of menus and screens (title, realms, world list, toasts...). */
const MENU_FOLDERS =
  /^(realms|presets|sprites\/(friends|dialog|world_list|server_list|social_interactions|toast|notification|popup|pending_invite|player_list|statistics|spectator|gamemode_switcher|pause_menu|realm_status|transferable_list|tooltip|realm|backup))\//

/** First match wins; anything else is `other`. */
function byName(groups: readonly [string, RegExp][], name: string): string {
  return groups.find(([, pattern]) => pattern.test(name))?.[0] ?? 'other'
}

/**
 * The browser group of a texture inside its section (an id the renderer translates). The name is
 * the file name without .png; `path` is the full pack path.
 */
export function groupOf(section: SectionId, path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1).replace(/\.png$/i, '')
  const rest = ASSET.exec(path)?.[1] ?? path
  const parts = rest.split('/')
  switch (section) {
    case 'blocks':
      return byName(BLOCK_GROUPS, name)
    case 'items':
      return parts[1] === 'map' ? 'records' : byName(ITEM_GROUPS, name)
    case 'entities':
      // textures/entity/<folder>/...: the folder names the mob (zombie/zombie.png, cow/cold_cow.png).
      return byName(ENTITY_GROUPS, parts.length > 3 ? (parts[2] ?? name) : name)
    case 'armor':
      return parts[1] === 'entity'
        ? (parts[3] ?? 'other')
        : parts[1] === 'palettes'
          ? 'trim_materials'
          : 'trims'
    case 'gui': {
      const inGui = parts.slice(2).join('/')
      if (parts[1] === 'mob_effect' || /^sprites\/(mob_effect|icon)\//.test(inGui)) return 'icons'
      if (/^sprites\/widget\//.test(inGui)) return 'widgets'
      if (/^(container|sprites\/container)\//.test(inGui)) return 'containers'
      if (/^sprites\/(hud|boss_bar)\//.test(inGui)) return 'hud'
      if (/^(advancements|sprites\/advancements)\//.test(inGui)) return 'advancements'
      if (/^(hanging_signs|signs|book)/.test(inGui) || /^sprites\/(book|recipe_book)/.test(inGui))
        return 'signs'
      if (MENU_FOLDERS.test(inGui) || !inGui.includes('/')) return 'menus'
      return 'other'
    }
    case 'world': {
      if (parts[0] === 'polytone') return 'polytone'
      if (parts[0] === 'particles' || parts[1] === 'particle') return 'particles'
      if (parts[1] === 'colormap') return 'biomes'
      if (parts[1] === 'painting') return 'paintings'
      if (parts[1] === 'environment') return /cloud|rain|snow/.test(name) ? 'weather' : 'sky'
      return 'screen_effects'
    }
    default:
      return 'all'
  }
}

/**
 * Group ids in the order a section's browser lists them. Armor groups are the equipment folders
 * (humanoid, horse_body, pig_saddle...): ids not listed here go after the listed ones.
 */
export const SECTION_GROUPS: Readonly<Record<SectionId, readonly string[]>> = {
  pack: ['all'],
  blocks: ['stone', 'ores', 'wood', 'glass', 'plants', 'dyed', 'earth', 'utility', 'other'],
  items: ['tools', 'armor', 'food', 'materials', 'potions', 'records', 'decor', 'eggs', 'other'],
  armor: ['humanoid', 'humanoid_leggings', 'trims', 'trim_materials'],
  entities: ['hostile', 'passive', 'water', 'bosses', 'villagers', 'special', 'vehicles', 'other'],
  gui: ['widgets', 'containers', 'hud', 'icons', 'menus', 'advancements', 'signs', 'other'],
  screens: ['all'],
  world: ['biomes', 'polytone', 'sky', 'weather', 'particles', 'paintings', 'screen_effects'],
  texts: ['all']
}
