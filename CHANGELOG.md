# Changelog

## 0.2.0 alpha — 2026-10-24

Still a prototype: work on a copy of your pack. This release adds the game's GUI, armour, items,
3D models and a set of pack tools.

### GUI

- A preview for GUI textures at GUI scale 1–4, with the nine-slice editor (drag the borders) and a
  warning when a sprite would lose vanilla's scaling.
- A GUI tab with mock screens (title, HUD, inventory) built from your pack or vanilla.
- Title screen: panorama (rotating preview), logo, Java Edition line and splash texts; the loading
  screen on its red or black background.
- Recolour many textures at once: the GUI, or any texture folder of the pack.

### Armour and trims

- Armour textures open on a 3D player wearing them, both layers, leather with its dye, and a map
  of where to paint each piece.
- Trims: paint the armour, a trim pattern or a material palette and see the result live.

### Items

- Items are previewed through their definition (`items/`): inventory, first and third person,
  ground, head, frame; bow pulling, compass, crossbow states; tints.
- "3D in hand": flat in the inventory, a 3D model of its pixels in hand.
- Variants by anvil name (1.21.5+), without OptiFine.
- Convert old `overrides` (custom model data, bow pulling…) to `items/` definitions.
- Definition editor with live checks, and an item positions editor (how it sits in hand, on the
  head…), first person drawn where the game puts it.

### 3D models

- Raised pixels: chosen colours (or a selection) stand out of the block, like 3D ores.
- Ready-made shapes: bushy leaves, grass on the sides, 3D ladder, 3D rails.
- A block model element editor with a live 3D view, move arrows and checks for your pack's
  versions.

### Pack tools

- Pack doctor: files the game ignores, models pointing to missing files (purple and black), game
  textures you haven't replaced, and porting between two installed versions (renamed textures
  moved for you).
- Emissive `_e` textures from your LabPBR maps (OptiFine / Continuity), shown lit in the 3D view.
- Random mob textures with rules by biome, height or name (OptiFine / ETF).
- Biome colours: a preview for colormaps, and Polytone colormaps for leaves and grass.
- Game texts: rename items and change messages for one language.
- Palette files (.gpl, .hex, .txt) in and out; colour adjustments (hue, saturation, levels) in the
  editor; exports with losslessly smaller PNGs.

## 0.1.1 alpha — 2026-10-24

- English is now the default language; Italian is one click away in Settings.
- The update check is off until you turn it on in Settings: PackForge makes no network request on
  its own.
- Checkboxes and radio buttons in lists (colour variants, batch apply) now look like the rest of the
  pixel interface.
- No more native Electron menu bar on Windows and Linux (it sat above PackForge's own).
- Settings no longer say the system's default editor is "Windows'" on Linux.

## 0.1.0 alpha — 2026-10-23

The first public build of PackForge. **It is a prototype**: an experiment in what a resource pack
studio could look like, not a tool for real packs yet. Things are missing and things break; work on
a copy of your pack.

### Pack

- Open a pack (a folder, or a zip read-only) or create one: name, description with the game's
  colours and styles, Minecraft version (the right `pack_format` is picked for you), icon.
- Browse the pack's textures next to the vanilla ones of your game version (read from your own
  game jar, reference only: they never end up in the pack).
- Pack tools: map coverage, map check, resize with sharp pixels, colour variants, backups.

### Paint

- Pixel editor with pencil, eraser, bucket, shade, noise, colour picker, lines, rectangles,
  ellipses, selection, magic wand and move; pixel-perfect, symmetry, seamless edges.
- Colour ramps with hue shifting, saved palettes and the texture's colours; layers; frame
  animations with onion skin; tips for beginners.
- Beginner mode (fewer tools, a six-step tutorial) and Pro mode, on the same editor.

### Effects (LabPBR)

- Paint the `_n` maps (height, occlusion, normals) and `_s` maps (smoothness, metals, porosity,
  emission) channel by channel, or generate them from the colours.
- Material presets (stone, wood, metal, glass, ore, leaves, crops, glowing…).
- A 3D preview lit like a shader: day, sunset, cave, Nether; POM, rain, reflections, pixelated
  shadows, bloom.

### Test

- See the texture in a scene: wall, floor, field, farmland, house corner, cave (an ore sits in its
  own rock), path; distance and mipmaps as in the game, wind on plants, comparison with vanilla,
  free flight, items in hand and in the inventory.

### Batch and connected textures

- Batch apply: material and relief on many textures at once, with a 3D before/after and the list
  of files that will be written, before writing.
- Connected textures (Continuity / OptiFine): full 47-tile method, or horizontal and vertical with
  4 tiles, with a before/after wall.

### Publish

- Export the zip with version, licence, credits and changelog; a no-PBR or other-resolution
  variant; a ready page for Modrinth / CurseForge.
- Copy the pack into the game, kept up to date automatically, with the keys to reload (F3 + T).

### Interface

- Menu bar, command search (Ctrl+K), workspaces Pack, Paint, Test, Effects and Publish, pixel
  icons and pixel fonts (Pixel Operator, Tiny5).
- English and Italian: the language follows the system and can be changed in Settings.

### Platforms and licence

- Windows: installer and portable zip. Linux: AppImage and .deb (new, very little tested).
- Free software under the GNU GPL v3.0.

NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.
