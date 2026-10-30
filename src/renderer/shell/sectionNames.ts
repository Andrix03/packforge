// Names of the sections and of their browser groups, in the interface language.
import { tr } from '../../shared/i18n'
import type { SectionId } from '../../shared/sections'

const SECTION_NAMES: Readonly<Record<SectionId, string>> = {
  pack: tr('Pack'),
  blocks: tr('Blocchi'),
  items: tr('Oggetti'),
  armor: tr('Armature'),
  entities: tr('Entità'),
  gui: tr('GUI'),
  screens: tr('Schermate'),
  world: tr('Mondo'),
  texts: tr('Testi')
}

export const sectionName = (id: SectionId): string => SECTION_NAMES[id]

const GROUP_NAMES: Readonly<Record<string, string>> = {
  all: tr('Tutte'),
  other: tr('Altro'),
  stone: tr('Pietre'),
  ores: tr('Minerali'),
  wood: tr('Legni'),
  glass: tr('Vetri'),
  plants: tr('Piante e foglie'),
  dyed: tr('Colorati (16 tinte)'),
  earth: tr('Terra, sabbia, neve'),
  utility: tr('Blocchi da lavoro e redstone'),
  tools: tr('Armi e strumenti'),
  armor: tr('Armature'),
  food: tr('Cibo'),
  materials: tr('Materiali e gemme'),
  potions: tr('Pozioni'),
  records: tr('Dischi, mappe, bussole'),
  decor: tr('Decorazioni e blocchi'),
  eggs: tr('Uova dei mob'),
  humanoid: tr('Giocatore'),
  humanoid_leggings: tr('Gambali'),
  humanoid_baby: tr('Mob piccoli'),
  horse_body: tr('Cavallo'),
  wolf_body: tr('Lupo'),
  llama_body: tr('Lama (tappeti)'),
  happy_ghast_body: tr('Ghast felice'),
  nautilus_body: tr('Nautilus'),
  wings: tr('Elitre'),
  trims: tr('Motivi delle finiture'),
  trim_materials: tr('Materiali delle finiture'),
  hostile: tr('Mob ostili'),
  passive: tr('Mob passivi'),
  water: tr('Acquatici'),
  bosses: tr('Boss'),
  villagers: tr('Villici e mercanti'),
  special: tr('Blocchi speciali (forzieri, letti, cartelli)'),
  vehicles: tr('Barche e carrelli'),
  widgets: tr('Pulsanti e widget'),
  containers: tr('Inventari e contenitori'),
  hud: tr('HUD (cuori, fame, hotbar)'),
  icons: tr('Icone ed effetti'),
  menus: tr('Menu e finestre'),
  advancements: tr('Progressi'),
  signs: tr('Cartelli e libri'),
  biomes: tr('Colori dei biomi'),
  polytone: tr('Polytone'),
  sky: tr('Cielo, sole e luna'),
  weather: tr('Nuvole e meteo'),
  particles: tr('Particelle'),
  paintings: tr('Quadri'),
  screen_effects: tr('Effetti dello schermo')
}

/** A group's name; equipment folders without a name (pig_saddle...) show as written. */
export const groupName = (id: string): string =>
  GROUP_NAMES[id] ?? (id.endsWith('_saddle') ? tr('Sella: {0}', id.slice(0, -7)) : id)
