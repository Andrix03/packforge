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
- [x] CTM preview on walls and floors in the Test scenes — "Texture connesse" in Prova (ctm / horizontal / vertical; faces between same blocks culled like the game)
- [x] CTM template generator (full set of connection tiles from one texture) — "🧩 Texture connesse": 47 tiles from a framed texture (+ optional center), _n/_s tiles, .properties, wall preview

## Phase 10 — Hot reload and in-game testing

- [x] Watch the pack folder (done with the Phase 2 live update)
- [x] Automatic sync into `resourcepacks` (copy or link) — copy (links are ignored by the game unless allowed): "🎮 In gioco", copy now + automatic after every change, only into its own marked folder
- [x] "Open in external editor" (Aseprite / Photoshop) — "✎" in the editor (saves first); files changed outside reload the editor, or ask when there is unsaved work
- [x] Reminder / shortcut panel for testing in game (F3+T, Iris shader reload) — in the same dialog (steps, F3 hotkeys, Iris R/K/O)
- [x] Undo history and automatic backups before destructive operations — backups before saves, batch, variants, resize, CTM; "🕘 Backup" lists and restores them (a restore can be undone too)

## Phase 11 — Export (Patreon and public)

- [x] Versioned zip — "📦 Esporta": `<pack>-<version>[-variant].zip` next to the pack (or a chosen folder), never overwritten without asking
- [x] Free/premium variants (e.g. base vs PBR, different resolutions) — full / base (no _n/_s) / another resolution; named neutrally (see the EULA note)
- [x] Screenshots rendered from the preview — "📷 Screenshot" in Prova → `<pack> - export/screenshots/`
- [x] Changelog — notes per version in packforge.json → CHANGELOG.md
- [x] Check the Minecraft Usage Guidelines for monetization — EULA: no selling / making money from mods; donations OK without exclusive rewards; disclaimer in CREDITS.txt; shown in the export dialog
- [x] License and credits file included in every export — LICENSE.txt (7 licenses), CREDITS.txt
- [x] Export checklist: no vanilla files, valid `pack.mcmeta`, no stray files (e.g. `.psd`, `Thumbs.db`) — vanilla copies by pixels, stray files kept out of the zip
- [x] Optional builds for Modrinth / CurseForge — same zip + `listing/<version>/` (EN/IT descriptions, summary, game versions, Modrinth tags from its API, CurseForge categories)

## Phase 11b — Crops (growing plants)

Added 2026-10-19. Crops have one texture per growth stage (`wheat_stage0…7`,
`carrots_stage0…3`, potatoes, beetroots, nether wart, cocoa, sweet berries, torchflower, pitcher,
pumpkin/melon stems). Research 2026-10-19: the popular crop packs (Vanilla+ Crops, Crops 3D, Bushy
Crops) add custom 3D models, random variants at harvest and taller ripe plants.

- [x] Stage textures recognised: the preview finds the crop and shows the stage of the open texture
- [x] Growth stage tabs in the editor (thumbnails); a missing stage starts as a copy of the previous one
- [x] "🌱 Crescita": the preview plays the stages in age order, slider to pick one
- [x] Stem tint by age (pumpkin/melon: green → yellow, wiki values), attached stems
- [x] "Campo coltivato" scene in Prova: moist farmland, rows from seed (front) to ripe (back)
- [x] LabPBR "Coltura" material preset: leaves SSS, dry/ripe parts less SSS, fruit smooth (by hue,
      checked on the vanilla crops); works in the editor and in batch apply
- [x] Plant shape generator ("🌿 Forma della pianta"): vanilla 4 planes, cross, bushy (4 planes
      leaning out 22.5° + 2 diagonals), tall (a second block drawn by `<name>_top`), for this stage
      or all stages; written as the stage models (vanilla format, no mods); variants follow
- [x] Random variants ("🎲 Varianti casuali" in the editor, any block texture): copies
      `<name>_v2…` with maps/animation, a model each, the block state picking one per block (weights,
      optional Y rotations); Prova picks per position like the game (vanilla grass rotations too)
- [x] Wind sway in the preview, like the waving plants of shader packs (not something a pack can do):
      "Vento sulle piante" in Prova, "Vento" next to Crescita in the editor; thin planes only, the
      top moves, one phase per block, shadows follow

## Phase 12 — Polish and public release

Infrastructure done in 2026-10. Order decided with Andrea on 2026-10-23: 12a fix pass (done) →
12b new interface → 12c release 1.0 → interfaces of Phases 13–19 → Phase 20 paint engine.

- [ ] UI/UX pass, keyboard shortcuts — superseded by Phase 12b (new interface)
- [x] First-run guided tutorial (draw your first block) for Beginner mode — six steps that tick by themselves; compact bar in the editor / Prova; "Rifai il tutorial" in the settings
- [ ] English UI option — done inside Phase 12b: strings move to a dictionary while the screens are rebuilt (~1500–2500 strings; decide library vs own dictionary, who reviews the English)
- [x] Windows installer — electron-builder: NSIS installer (per-user, IT/EN) built by the GitHub "Release" workflow, portable zip locally (`npm run dist:zip`); unsigned: a code-signing certificate is needed before a public release
- [ ] Bug fixing — ongoing; audit findings done in Phase 12a (2026-10-22)
- [x] GitHub Actions CI (typecheck, lint, tests on every push) — `.github/workflows/ci.yml`: windows-latest, Node 24, `npm ci` + `npm run check` (UI scenarios stay local)
- [x] End-to-end tests of the Electron app (Playwright) — done with our own CDP driver (`scripts/drive`, 42 scenarios, `npm run drive:all`) instead of Playwright
- [x] Auto-update for new releases — notify-only update check (GitHub latest release, banner + link, setting to turn it off); real auto-install needs signed builds

## How the next phases are built (decided 2026-10-19)

Audit + research: `docs/RESEARCH-2026-10-19.md`. Mockup of the new interface: design canvas
"PackForge — nuova interfaccia" (sources kept locally).

- Every new feature is split in two: **format logic** (`shared/`, pure, tested; research on
  minecraft.wiki first) and **its interface**. The logic of Phases 13–18 may start any time, even
  before Phase 12b; their interface is built only inside the new interface (never twice).
- The canvas gets a low-fidelity screen for each new area before Phase 12b starts, so the new
  window already has a place for them.

## Phase 12a — Fix pass (audit findings)

- [x] Backup restore: the "before restoring" backup must not prune the backup being restored
- [x] Atomic writes: unique temp names + one write at a time per file; `pack.mcmeta` edits serialized; `renameRetrying` everywhere — `main/atomicWrite.ts`
- [x] Editor shortcuts off while the editor is hidden (Prova) or a dialog is open
- [x] Editor reload (tall plant, whole/half toggle) never drops unsaved work; History/state reset with it; map surface reset in tall mode, tall drafts + external-change watch
- [x] SSR feedback loop (screen-space reflections dead after the first frame) — drive scenarios now fail on any WebGL error (found a second one: live textures that change size)
- [x] Plant shape models: `"shade": false` for packs before 26.3 (`shade_direction_override` from 26.3) — both written (26.3 ignores `shade`, checked with javap)
- [x] Auto-sync: cancel the pending sync on pack switch, one sync at a time, case-only renames on Windows; serialized pack open/watch
- [x] PNG decode with an output cap; non-integer frame sizes in resize; vanilla-copy check enforced in the exporter
- [x] Editor: merge-down with lower layer opacity, frame ops restructure `_n`/`_s`, "Togli animazione" undoable, drafts with maps
- [x] Animation frame size with only `width` or `height`: verify against the game code, then fix if needed — 26.3 `calculateFrameSize`: the other side is the image's own
- [x] Smaller items of the report (ignored IPC results, double-submit, WebGL context loss, dialogs re-scanning the pack, 128×+ painting speed) — 512×512 stroke ~41 → ~8 ms per move

## Phase 12b — New interface

One window like Photoshop/GIMP/Aseprite: menu bar + command search (Ctrl+K), workspaces
Pack / Disegna / Prova / Effetti / Pubblica as a "hotbar", icon tool rail, tool options bar,
document tabs, collapsible panels in a two-column dock, status bar. Beginner = a layout preset of
the same editor.

Style (decided 2026-10-23): the Disegna screen of the design canvas "PackForge — nuova
interfaccia" is the reference: first every other screen is redrawn in that style on the canvas
(Andrea reviews it there), then the whole design is implemented in code. An Ore-UI-_inspired_ look drawn by us: neutral greys, raised/sunken 1 px bevels, light
bevelled "ore" buttons and green active state, I/O switches, segmented sliders, Tiny5 pixel font
(OFL, bundled), our own 16×16 pixel icons. Never Mojang's font, textures, logo or an official look
(Minecraft usage guidelines).

- [x] Style approved (Disegna on the canvas)
- [ ] Canvas: Pack, Prova, Effetti, Pubblica redrawn in the Disegna style; start screen, settings, dialogs, Beginner layout added
- [ ] Design system in code: tokens, Tiny5 bundled, pixel icons, ore buttons, I/O switch, segmented slider, select, panels
- [ ] Shell: menu bar, Ctrl+K, workspace hotbar, status bar
- [ ] Disegna: tool rail, options bar, document tabs, floating view bar, two-column dock, timeline
- [ ] Pack, Prova, Effetti, Pubblica in the same style (every current feature kept)
- [ ] Start screen, settings and every dialog restyled
- [ ] Beginner layout + tutorial updated; drive scenarios updated
- [ ] Strings into a dictionary (Italian; English when Andrea decides)

## Phase 12c — Release 1.0

- [ ] Small fixes from the self-test (Esc on the description editor, pack.png counted as a texture, Prova cave for ores)
- [ ] Version 1.0.0, changelog, user guide, download page; installer tested on a clean PC (also without Minecraft)
- [ ] "Not affiliated with Mojang/Microsoft" notice in the app
- [ ] Andrea decides: code signing, English, PackForge licence and price, distribution channel, beta testers

## Phase 13 — Modelli 3D

The biggest theme in popular packs (Modrinth top 300: "models" on 124 packs; "3d" 1401 projects).
Vanilla model JSON, no mods.

- [x] Logic: element limits per pack format (coordinates, multi-axis rotation from 1.21.11, `light_emission`, shade), element/face cost — `shared/modelRules.ts` (4192 vanilla 26.3 models pass)
- [ ] Extrude a texture into a thick 3D item/block model (greedy-merged cuboids, element budget) — logic done (`shared/extrude.ts`); UI in 12b
- [ ] "Pixels that pop out" (ores, details): pick pixels by color/selection → raised cuboids with UVs
- [ ] Parametric presets: torch, lantern/chain, ladder, rails, bushy leaves, grass sides
- [ ] Element editor (list + from/to/rotation/per-face UV, gizmo in the preview)
- [ ] Display transforms (gui, hands, ground, head, fixed, on_shelf) with the held / slot views

## Phase 14 — Items

- [x] Logic: read/validate `items/*.json` (all model types, tints, `oversized_in_gui`, `transformation`…) per pack format — `shared/itemDefinition.ts` (+ evaluation for previews; 1658 vanilla definitions pass)
- [ ] Preview items through their definition (display context, condition, range_dispatch: bow pull, compass…)
- [ ] Definition editor; "2D in the inventory, 3D in hand" in one click
- [ ] Migrate old `overrides` / custom_model_data to `items/`

## Phase 15 — GUI

- [x] Logic: GUI sprites, `.png.mcmeta` `gui.scaling` (stretch / tile / nine_slice), research which sprites exist per version — `shared/guiScaling.ts` (layout as the 26.3 code); sprite lists only from the client jar
- [ ] Nine-slice editor (border handles) with a preview at GUI scale 1–4
- [ ] Batch recolor (e.g. dark mode) across GUI sprites

## Phase 16 — Armature e trim

- [x] Logic: `equipment/*.json`, humanoid layers, 26.3 trim palettes (`textures/palettes/`, `palette` mcmeta) — `shared/equipment.ts` (palette swap matches all vanilla trims)
- [ ] Armor painting on the layer template with a 3D player preview
- [ ] Trim palettes and patterns preview

## Phase 17 — Diagnosi del pack e porting

- [ ] Version diff from two client jars: textures added / renamed (pixel hash) / removed — logic done (`shared/packDoctor.ts`); jar reading in main + UI to do
- [ ] "Missing in my pack" for the target version, migrate renamed files
- [ ] Lint for what the game silently ignores (names, case, paths, nested zip folder, purple-black) — names/case/old folders in `packDoctor.ts`; purple-black + UI to do

## Phase 18 — Emissive and mod extras

- [ ] Emissive `_e` textures from the LabPBR emission channel (Continuity / ETF), preview toggle — logic done (`shared/emissive.ts`); UI to do
- [ ] Random textures naming for OptiFine/ETF; colormaps / Polytone biome colors; custom sky (later)

## Phase 19 — Small extras

- [ ] Palette import/export (.gpl, .hex, Lospec), adjustment filters (hue/sat, levels) per layer and in batch — palette files logic done (`shared/paletteFiles.ts`: .gpl, .hex, Paint.NET .txt)
- [ ] PNG optimizer on export; sounds and lang files (low demand)

## Phase 20 — Paint engine

Painting inside PackForge beyond GIMP/Photoshop/Krita for Minecraft textures (research:
`docs/RESEARCH-2026-10-23-paint-engine.md`): WebGPU canvas (16-bit, up to 4096), MyPaint-style brush
engine with pen pressure and pixel-perfect mode, pro layers (blend modes, masks, adjustment layers),
filters (curves, procedural noises, content-aware fill, tileable synthesis), material node graph
producing every LabPBR map, photo → material and CC0 import (ambientCG, Poly Haven).

- [x] Research and GPU/pen measurements on Andrea's PC
- [ ] Spike: 2048² WebGPU canvas + pressure brush, latency measured

## Ideas for later

- Paint directly on the 3D block (click a face in the preview)
- Font editing
- Entity textures painted on the model UV template (vanilla entities; CEM/EMF stays with Blockbench)
- Sound replacement with an in-app player
- Multiple language files (`lang/*.json`) editor
