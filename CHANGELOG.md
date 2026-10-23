# Changelog

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

NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.
