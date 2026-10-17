# Roadmap — PackForge

## Fase 0 — Setup

- [x] Scaffold Electron + electron-vite + React + TS (strict)
- [x] ESLint, Prettier, Vitest, script `typecheck` / `test`
- [x] Bridge IPC tipizzato in preload
- [x] Repo Git + primo commit
- [ ] Push su GitHub (manuale, da Andrea)

## Fase 1 — Gestione pack

- [ ] Crea nuovo pack (nome, descrizione, versione target → pack_format)
- [ ] Apri pack esistente (cartella o zip)
- [ ] Albero file + griglia miniature texture
- [ ] Import texture vanilla dal jar del client (solo riferimento)
- [ ] Impostazioni: percorso `.minecraft`, editor esterno

## Fase 2 — Anteprima 3D base

- [ ] Viewer Three.js con cubo texturizzato (filtro nearest)
- [ ] Camera orbitale, luce direzionale, ciclo giorno/notte
- [ ] Aggiornamento live quando il file cambia

## Fase 3 — Shader LabPBR

- [ ] Decodifica `_n` (normal, AO, height) e `_s` (smoothness, F0/metalli, porosity/SSS, emissive)
- [ ] Illuminazione PBR (GGX), metalli predefiniti
- [ ] Vista singolo canale + debug
- [ ] Test unitari encode/decode in `shared/labpbr.ts`

## Fase 4 — POM

- [ ] Parallax occlusion mapping con height da `_n.a`
- [ ] Slider profondità/campioni, self-shadowing
- [ ] Confronto affiancato con/senza POM

## Fase 5 — Strumenti PBR

- [ ] Generatore height e normal da albedo (intensità, blur, inversione)
- [ ] Preset materiali → `_s` (pietra, legno, metallo, minerale, vetro, emissivo)
- [ ] Pittura/maschera canali
- [ ] Validatore (dimensioni, alfa emissive, file orfani)

## Fase 6 — Hot reload e test in gioco

- [ ] Watcher cartella pack
- [ ] Sync automatico in `resourcepacks` (copia o link)
- [ ] "Apri in editor esterno" (Aseprite/Photoshop)

## Fase 7 — Export Patreon

- [ ] Zip versionato
- [ ] Varianti free/premium (es. base vs PBR, risoluzioni)
- [ ] Screenshot renderizzati dall'anteprima
- [ ] Changelog
- [ ] Verifica Minecraft Usage Guidelines per la monetizzazione

## Fase 8 — Rifinitura

- [ ] UI/UX, scorciatoie
- [ ] Installer Windows
- [ ] Bugfix
