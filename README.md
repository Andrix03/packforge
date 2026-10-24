<p align="center">
  <img src=".github/assets/packforge.gif" width="128" alt="PackForge logo: a block on an anvil">
</p>

<h1 align="center">PackForge</h1>

<p align="center">
  A workshop for Minecraft: Java Edition resource packs.<br>
  Paint a texture, give it relief and shine, see it under shader light, drop it in the game.
</p>

<p align="center">
  <img alt="Status: prototype" src="https://img.shields.io/badge/status-prototype-c0392b">
  <img alt="Windows and Linux" src="https://img.shields.io/badge/platform-Windows%20%7C%20Linux-3b6ea5">
  <img alt="Licence GPL-3.0" src="https://img.shields.io/badge/licence-GPL--3.0-5a9e32">
  <img alt="Minecraft Java" src="https://img.shields.io/badge/Minecraft-Java%20Edition-6b4a2b">
  <img alt="LabPBR 1.3" src="https://img.shields.io/badge/LabPBR-1.3-8a5cc2">
</p>

> [!CAUTION]
> **This is a prototype, not a finished tool.**
> PackForge is an experiment in what an app that makes resource packs easier _could_ look like.
> It is not in a state where you should use it for a real pack: things are missing, things break,
> and files, menus and formats can change from one commit to the next without warning.
> If you try it anyway, work on a copy of your pack, never on the only one you have.

## Why this exists

Making a resource pack with PBR maps today means four programs open at once: something to draw
in, something to generate normal maps, a text editor for `pack.mcmeta`, and Minecraft itself,
restarted again and again to see if the stone finally looks right under a shader. Half of the
work is moving files around.

PackForge is my attempt to put all of that in one window. You paint a pixel and the 3D block next
to it changes, with the shadows, relief and reflections it will have with a LabPBR shader. When it
looks right, the pack is already in your `resourcepacks` folder and F3 + T does the rest.

<p align="center">
  <img src=".github/assets/demo.gif" width="880" alt="Painting gold into stone, generating its relief, changing the light and testing it in a wall and a cave">
</p>

## What works so far

The app is split into five workspaces, one tab each:

| Workspace   | What you do there                                                                                                                                                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pack**    | Open a folder (or a zip, read-only) or start a new pack. Browse your textures next to the vanilla ones from your own game install, check which maps are missing, keep backups.                                                      |
| **Paint**   | A pixel editor built around Minecraft textures: pencil, bucket, shade along a colour ramp, noise, shapes, selections, symmetry, seamless edges, layers and frame animations. Beginner mode hides the advanced tools and gives tips. |
| **Test**    | Put the texture in a small world before opening the game: a wall, a floor, farmland, a house corner, a cave where an ore sits in its own rock, a path. Day, sunset, torchlight, Nether, rain.                                       |
| **Effects** | Paint the LabPBR `_n` and `_s` maps channel by channel, or generate them from the colours and a material preset (stone, wood, metal, glass, ore, leaves…). Parallax, reflections, bloom.                                            |
| **Publish** | Export a zip with version, credits and changelog, a no-PBR or other-resolution variant, and a ready description for Modrinth and CurseForge. Or copy the pack into the game and let it update while you work.                       |

Also: batch-apply a material to dozens of textures with a before/after view, connected textures
for Continuity and OptiFine, resizing with sharp pixels, colour variants for the 16 dyes, and an
interface in **English or Italian**.

New in 0.2: the game's **GUI** (nine-slice editor, mock screens, title and loading screen),
**armour and trims** on a 3D player, **items** through their definitions (3D in hand, variants by
anvil name, positions in hand), **3D block models** (raised pixels, bushy leaves, 3D rails, an
element editor), and pack tools: a pack doctor with porting between versions, emissive `_e`
textures, random mob textures, Polytone biome colours and the game's texts.

<table>
  <tr>
    <td><img src=".github/assets/paint.png" alt="The Paint workspace: pixel editor, 3D preview, colours"></td>
    <td><img src=".github/assets/effects.png" alt="The Effects workspace: painting the height map, light presets"></td>
  </tr>
  <tr>
    <td align="center"><sub>Paint</sub></td>
    <td align="center"><sub>Effects</sub></td>
  </tr>
</table>

## Coming next

Roughly in this order, if the prototype survives:

- [x] Game GUI textures: inventory, buttons, the title screen and the loading screen (0.2)
- [x] Armour, armour trims and the new item definitions (0.2)
- [x] Simple block and item models (0.2)
- [ ] A painting engine with pressure brushes and bigger canvases
- [ ] macOS (the Linux build is new and has had very little testing)
- [ ] A signed Windows installer: free signing through SignPath is being set up, see below

## Trying it anyway

You read the warning above. If you still want to poke at it:

**Windows.** Grab `PackForge-Setup-<version>.exe` or the portable zip from
[Releases](https://github.com/Andrix03/packforge/releases). Until the signing is in place,
SmartScreen will say it protected your PC: **More info → Run anyway**.

**Linux.** Take the AppImage, make it executable and run it:

```sh
chmod +x PackForge-<version>.AppImage
./PackForge-<version>.AppImage
```

On Debian or Ubuntu the `.deb` works too: `sudo apt install ./packforge_<version>_amd64.deb`.

Then open a copy of a pack, or make a new one from the start screen.

You need Windows 10 or 11 or a 64-bit Linux, and a graphics card with WebGL 2. For the vanilla reference
textures, Minecraft Java installed with the official launcher. To see the PBR maps in game, a
LabPBR shader pack (for example with Fabric and Iris).

Bugs and ideas are welcome in [Issues](https://github.com/Andrix03/packforge/issues). At this stage
an issue that says "this screen confused me" is just as useful as a crash report.

## A few rules PackForge keeps

- **Vanilla textures stay Mojang's.** They are read from _your_ game, only to look at, trace or
  pick colours from. They are never copied into your pack or an export, and the export check
  refuses textures identical to the game's.
- **It never overwrites without asking.** Writes are atomic, and anything that replaces files
  takes a backup first.
- **The right `pack_format` is picked for you** from the Minecraft version, overlays included.

## Building from source

Electron, React, TypeScript and Three.js, with hand-written GLSL for the LabPBR preview.

```sh
npm ci
npm run dev       # the app with hot reload
npm run check     # format, types, lint, tests
npm run dist:zip  # portable Windows build
```

## Credits

Interface fonts: Pixel Operator (CC0) and [Tiny5](https://github.com/Gissio/font_tiny5) (OFL).
Material format: [LabPBR](https://shaderlabs.org/wiki/LabPBR_Material_Standard) by shaderLABS.

PackForge writes files for formats other people designed and documented. Thank you to:

- **[Polytone](https://github.com/MehVahdJukaar/polytone)** by
  [MehVahdJukaar](https://github.com/MehVahdJukaar): the custom biome colormaps, and a
  [wiki](https://github.com/MehVahdJukaar/polytone/wiki) clear enough to build a tool on. Thank you
  for the chance to make PackForge better.
- **[OptiFine](https://optifine.net)** and its
  [documentation](https://optifine.readthedocs.io): connected textures, emissive textures and
  random entity textures.
- **[Continuity](https://modrinth.com/mod/continuity)** by PepperCode1 and
  **[Entity Texture Features](https://github.com/Traben-0/Entity_Texture_Features)** by Traben,
  which bring those formats to Fabric.
- **[Iris](https://irisshaders.dev)** and the shader pack authors, whose LabPBR packs the Effects
  preview tries to approximate.
- The **[Minecraft Wiki](https://minecraft.wiki)** editors: pack formats, models, item definitions
  and the rest of the game's formats, version by version.

Built with [Electron](https://www.electronjs.org), [React](https://react.dev),
[Three.js](https://threejs.org), [fflate](https://github.com/101arrowz/fflate) and
[chokidar](https://github.com/paulmillr/chokidar).

PackForge is free software under the [GNU General Public License v3.0](LICENSE): you can use,
study, share and change it, and anything built from it stays under the same licence. Packs you
make with PackForge are yours, under whatever licence you choose.

## Code signing policy

Windows releases are going to be signed through SignPath. Once the signing is active:

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by
[SignPath Foundation](https://signpath.org).

- Committers and reviewers: [Andrix03](https://github.com/Andrix03)
- Approvers: [Andrix03](https://github.com/Andrix03)

Every signed file is built by the GitHub Actions workflow of this repository from the tagged
source, and each signing request is approved by hand.

**Privacy.** This program will not transfer any information to other networked systems unless
specifically requested by the user or the person installing or operating it. (The only request it
can make is asking GitHub for the latest release at start, and only after you turn on the update
check in Settings.)

<sub>NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.</sub>
