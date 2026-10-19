# PackForge Roadmap

PackForge is meant to be distributed to everyone, from first-time texture makers to pros.
The workflow is split into three sections, and the user can jump between them at any time:

1. **Draw** — the texture editor (Phases 3–4), with a Beginner and a Pro mode.
2. **Test** — the block in action: scenes, distance, vanilla comparison (Phase 5).
3. **Effects** — making it realistic: LabPBR, POM, CTM (Phases 6–9).

Beginner and Pro are ONE editor on the same files: the mode only decides which tools are visible
and how much guidance is shown. Switching mode never loses work.

## Phase 0 — Setup

- [x] Scaffold Electron + electron-vite + React + TypeScript (strict)
- [x] ESLint, Prettier, Vitest, `typecheck` / `test` scripts
- [x] Typed IPC bridge in the preload script
- [x] Git repo and first commit
- [x] Push to GitHub

## Phase 1 — Pack management

- [x] Create a new pack (name, description, target version → pack format), versions 1.20 → 26.3
- [x] Open an existing pack (folder or zip) and validate its `pack.mcmeta`
- [x] File tree and texture thumbnail grid
- [x] Import vanilla textures from my own client jar (reference only, never exported)
- [x] Settings: `.minecraft` path, external editor
- [x] Recent packs list on the start screen
- [x] Pack icon (`pack.png`): pick, crop and preview
- [x] Multi-version support: version ranges and overlay folders in `pack.mcmeta`
- [x] Description editor with Minecraft color/formatting codes and live preview

## Phase 2 — Basic 3D preview

- [x] Three.js viewer with a textured cube (nearest filtering)
- [x] Orbit camera, directional light, day/night cycle
- [x] Live update when a texture file changes
- [x] Render real block models from model JSON (`cube_all`, `cube_column`, slabs, stairs…), including biome tint for grass/leaves
- [x] Animated textures (`.png.mcmeta` animation: frametime, interpolation)
- [x] 3×3 tiling view to spot seams on repeating textures
- [x] Preview scenes: single block, small wall, flat floor

## Phase 3 — Draw: texture editor (basics + Beginner mode)

So anyone can draw textures from start to finish inside PackForge, seeing them on the 3D block while
painting. It opens as a dedicated screen (double-click a texture in the grid), with the canvas in the
middle, tools on the left and colors, live 3D and the vanilla reference on the right.

Beginner mode shows only the essential tools (pencil, eraser, fill, picker, shade, noise), the guided
ramp palette, a one-line tip per tool and soft warnings. Pro mode shows everything.

- [x] Pixel canvas with zoom, pan and pixel grid
- [x] Pencil (optional pixel-perfect stroke) and eraser
- [x] Fill bucket (contiguous or global) and color picker (also Alt + click with any tool)
- [x] Hard-pixel brush only (no soft edges / anti-aliasing), size 1–3 px in Beginner, free in Pro (1–8, [ and ])
- [x] Primary/secondary color on left/right click (secondary defaults to transparent), X swaps them
- [x] Color picker panel: hex/RGB/HSV input, alpha, recent colors (full panel in Pro)
- [x] Ramp generator: 5 shades from a base color with hue shifting (cool shadows, warm highlights)
- [x] Shade tool: left click one step darker, right click one step lighter along the ramp
- [x] Noise fill: fill an area with random shades of the ramp (base for stone, dirt, gravel)
- [x] Replace color: swap one color for another across the whole texture (fill bucket, Globale mode)
- [x] Texture palette: the colors already used, sorted by brightness, with a color counter
- [x] Soft warnings in Beginner mode: too many colors (> ~10), darkest next to lightest, too much contrast
- [x] Beginner / Pro mode switch (remembered in settings), tool tips with shortcut and one-line advice
- [x] Undo/redo history (100+ steps), unsaved-changes indicator
- [x] Draft autosave and recovery after a crash
- [x] Block-centric editing: open a block and switch between its textures (top / side / bottom) as tabs
- [x] Save edited textures into the pack (Ctrl+S), exact PNG decode/encode
- [x] New texture wizard (pick the block, size 16×/32×/64×…, start empty / base color / noise)
- [x] Vanilla texture as a side-by-side or traced reference (color picking allowed, pixels never copied into the pack)
- [x] Live 3D preview and 3×3 tiling preview of the texture being edited
- [x] Keyboard shortcuts for the basic tools (B, E, G, I, S, N, X, [ ], Ctrl+S, Ctrl+Z / Ctrl+Y)

## Phase 4 — Draw: Pro tools

- [x] Layers (add, reorder, hide, opacity, duplicate, merge, rename), flattened on save
- [x] Selections: rectangle, magic wand; move, copy, paste, flip, rotate (+ cut, delete, paint inside the selection)
- [x] Lines, rectangles, ellipses; mirror (symmetry) drawing
- [x] Seamless tiling mode: paint across the edges of a repeating texture
- [x] Custom ramps and saved palettes
- [x] Animation frames editor that writes the strip and `.png.mcmeta` (onion skin, preview, frame time, interpolation)
- [x] Keyboard shortcuts for every tool (+ shortcuts window: ? or F1)

## Phase 5 — Test: the block in action

A dedicated screen to judge a finished texture as it will look in game, one click away from the editor
("back to drawing" opens the same texture).

- [x] Test screen reusing the Phase 2 preview (scenes, day/night, biomes, animations)
- [x] Distance view: the block seen from far away, to spot noise that turns into a blur
- [x] Side-by-side comparison with the vanilla block
- [x] Mixed scene: my block next to other blocks (pack first, then vanilla) to check colors fit together
- [x] Small built scenes (house corner, cave, path) with a free-fly camera
- [x] Held item / inventory slot view for item textures

## Phase 6 — Effects: LabPBR shader

- [x] Decode `_n` (normal, AO, height) and `_s` (smoothness, F0/metals, porosity/SSS, emission)
- [x] PBR lighting (GGX) and predefined metals
- [x] Single-channel view and debug modes
- [x] Unit tests for encode/decode in `shared/labpbr.ts`
- [x] Tone mapping and exposure controls
- [x] Emission bloom
- [x] Environment lighting presets (overworld noon, sunset, cave, nether)

## Phase 6b — Effects: closer to the shader packs

Overcoming the Phase 6 approximations (research 2026-10-18: Photon source, 0fps, Bedrock Vibrant Visuals).

- [x] Game-like light levels (sky light and block light flood fill) and vanilla smooth-lighting AO between blocks
- [x] Sun shadows (shadow map, pixel-snapped to 1/16 block like the shader packs)
- [x] Reflections of the real scene (cubemap prefiltered by roughness; the sun stays the GGX highlight)
- [x] Metal interpretation switch (spec / 230–255 read as 255 / no albedo tint)
- [x] Threshold-free bloom (progressive downsample/upsample, mixed like Photon)
- [x] Rain and wetness driven by porosity (darkening, puddles on top faces)

## Phase 7 — Effects: POM

- [x] Parallax occlusion mapping using height from `_n.a`
- [x] Depth/sample count sliders, self-shadowing
- [x] Side-by-side comparison with and without POM

## Phase 8 — Effects: PBR tools

- [x] Height and normal generator from albedo (depth, blur, steps, invert; normals Sobel/Scharr + strength; AO from height; tiling edges)
- [x] Material presets → `_s` (stone, polished, wood, soil, wool, leaves SSS, glass, ice, metal, ore with gem pixels found by color, emissive from lightness; selection = mask; one undo step)
- [x] Channel painting with the editor brushes (`_n` / `_s` channels in gray, values and typical presets; selections act as masks; live in the 3D preview and Test)
- [x] Validator (sizes and animation as Iris reads them, emission/height values, orphan maps and .mcmeta; "Controlla mappe" in the workspace) — also: saving an animated texture now writes the maps' own .png.mcmeta
- [x] Batch apply a preset or generator to many textures at once ("⚙ Applica in blocco": filter + select, material and/or relief, existing maps skipped unless overwrite is confirmed)
- [x] Batch hue variants (e.g. all wool colors from one texture) — "🎨 Varianti di colore": 16 dyes, OKLab recolor, game colors when the jar has the variant, maps and .mcmeta copied
- [x] Coverage report: which textures still miss `_n` / `_s` maps ("📊 Copertura": per folder, gui/font/… not counted, filters, "Crea le mappe mancanti" → batch preselected)
- [x] Compare my texture against the vanilla one (side by side, diff) — "⇆ Confronta con vanilla" in the editor: side by side, heat map, wipe, changed pixels / colors / mean shift / size ratio
- [x] Nearest-neighbour resize for different resolutions (16×, 32×, 64×…) — "↔ Ridimensiona": resolution histogram, integer ratios, maps + .mcmeta frame sizes, lossy shrink named before writing

## Phase 9 — Effects: connected textures (CTM)

- [x] Research the formats (OptiFine CTM properties, Continuity) and which loaders read them — `shared/ctm.ts` (47-tile table, properties, methods)
- [ ] CTM preview on walls and floors in the Test scenes
- [ ] CTM template generator (full set of connection tiles from one texture)

## Phase 10 — Hot reload and in-game testing

- [x] Watch the pack folder (done with the Phase 2 live update)
- [ ] Automatic sync into `resourcepacks` (copy or link)
- [ ] "Open in external editor" (Aseprite / Photoshop)
- [ ] Reminder / shortcut panel for testing in game (F3+T, Iris shader reload)
- [ ] Undo history and automatic backups before destructive operations

## Phase 11 — Export (Patreon and public)

- [ ] Versioned zip
- [ ] Free/premium variants (e.g. base vs PBR, different resolutions)
- [ ] Screenshots rendered from the preview
- [ ] Changelog
- [ ] Check the Minecraft Usage Guidelines for monetization
- [ ] License and credits file included in every export
- [ ] Export checklist: no vanilla files, valid `pack.mcmeta`, no stray files (e.g. `.psd`, `Thumbs.db`)
- [ ] Optional builds for Modrinth / CurseForge

## Phase 12 — Polish and public release

- [ ] UI/UX pass, keyboard shortcuts
- [ ] First-run guided tutorial (draw your first block) for Beginner mode
- [ ] English UI option
- [ ] Windows installer
- [ ] Bug fixing
- [ ] GitHub Actions CI (typecheck, lint, tests on every push)
- [ ] End-to-end tests of the Electron app (Playwright)
- [ ] Auto-update for new releases

## Ideas for later

- Paint directly on the 3D block (click a face in the preview)
- Custom item models and item model definitions
- Font and GUI texture editing
- Sound replacement with an in-app player
- Multiple language files (`lang/*.json`) editor
