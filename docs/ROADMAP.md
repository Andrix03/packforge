# PackForge Roadmap

## Phase 0 — Setup

- [x] Scaffold Electron + electron-vite + React + TypeScript (strict)
- [x] ESLint, Prettier, Vitest, `typecheck` / `test` scripts
- [x] Typed IPC bridge in the preload script
- [x] Git repo and first commit
- [x] Push to GitHub

## Phase 1 — Pack management

- [x] Create a new pack (name, description, target version → pack format), versions 1.20 → 26.3
- [x] Open an existing pack (folder or zip) and validate its `pack.mcmeta`
- [ ] File tree and texture thumbnail grid
- [ ] Import vanilla textures from my own client jar (reference only, never exported)
- [ ] Settings: `.minecraft` path, external editor
- [ ] Recent packs list on the start screen
- [ ] Pack icon (`pack.png`): pick, crop and preview
- [ ] Multi-version support: version ranges and overlay folders in `pack.mcmeta`
- [ ] Description editor with Minecraft color/formatting codes and live preview

## Phase 2 — Basic 3D preview

- [ ] Three.js viewer with a textured cube (nearest filtering)
- [ ] Orbit camera, directional light, day/night cycle
- [ ] Live update when a texture file changes
- [ ] Render real block models from model JSON (`cube_all`, `cube_column`, slabs, stairs…)
- [ ] Animated textures (`.png.mcmeta` animation: frametime, interpolation)
- [ ] 3×3 tiling view to spot seams on repeating textures
- [ ] Preview scenes: single block, small wall, flat floor

## Phase 3 — LabPBR shader

- [ ] Decode `_n` (normal, AO, height) and `_s` (smoothness, F0/metals, porosity/SSS, emission)
- [ ] PBR lighting (GGX) and predefined metals
- [ ] Single-channel view and debug modes
- [ ] Unit tests for encode/decode in `shared/labpbr.ts`
- [ ] Tone mapping and exposure controls
- [ ] Emission bloom
- [ ] Environment lighting presets (overworld noon, sunset, cave, nether)

## Phase 4 — POM

- [ ] Parallax occlusion mapping using height from `_n.a`
- [ ] Depth/sample count sliders, self-shadowing
- [ ] Side-by-side comparison with and without POM

## Phase 5 — PBR tools

- [ ] Height and normal generator from albedo (strength, blur, invert)
- [ ] Material presets → `_s` (stone, wood, metal, ore, glass, emissive)
- [ ] Channel painting and masks
- [ ] Validator (sizes, emissive alpha, orphan files)
- [ ] Batch apply a preset or generator to many textures at once
- [ ] Coverage report: which textures still miss `_n` / `_s` maps
- [ ] Compare my texture against the vanilla one (side by side, diff)
- [ ] Nearest-neighbour resize for different resolutions (16×, 32×, 64×…)

## Phase 6 — Hot reload and in-game testing

- [ ] Watch the pack folder
- [ ] Automatic sync into `resourcepacks` (copy or link)
- [ ] "Open in external editor" (Aseprite / Photoshop)
- [ ] Reminder / shortcut panel for testing in game (F3+T, Iris shader reload)
- [ ] Undo history and automatic backups before destructive operations

## Phase 7 — Patreon export

- [ ] Versioned zip
- [ ] Free/premium variants (e.g. base vs PBR, different resolutions)
- [ ] Screenshots rendered from the preview
- [ ] Changelog
- [ ] Check the Minecraft Usage Guidelines for monetization
- [ ] License and credits file included in every export
- [ ] Export checklist: no vanilla files, valid `pack.mcmeta`, no stray files (e.g. `.psd`, `Thumbs.db`)
- [ ] Optional builds for Modrinth / CurseForge

## Phase 8 — Polish

- [ ] UI/UX pass, keyboard shortcuts
- [ ] Windows installer
- [ ] Bug fixing
- [ ] GitHub Actions CI (typecheck, lint, tests on every push)
- [ ] End-to-end tests of the Electron app (Playwright)
- [ ] Auto-update for new releases

## Ideas for later

- Connected textures (CTM) preview for OptiFine/Continuity-style packs
- Custom item models and item model definitions
- Font and GUI texture editing
- Sound replacement with an in-app player
- Multiple language files (`lang/*.json`) editor
- English UI option
