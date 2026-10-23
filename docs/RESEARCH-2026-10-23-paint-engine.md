# Paint engine research (2026-10-22/23)

Goal set by Andrea: make packs entirely inside PackForge, with painting quality beyond GIMP,
Photoshop and Krita **for Minecraft textures**. This collects the research and the measurements
the plan rests on. "✔ measured" = run in PackForge itself; "✔ code" = checked in our code.

## 1. GPU and input in Electron 44 (Chromium 152)

Measured on Andrea's PC (Intel Gen12 integrated) through a drive probe ✔ measured:

| What               | Result                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| WebGPU             | on by default, `navigator.gpu` + high-performance adapter                                                           |
| Max texture        | 16384 (WebGPU and WebGL2)                                                                                           |
| Half/float targets | `rgba16float` render + blend OK; `float32-filterable`, `float32-blendable`, `shader-f16`, `texture-formats-tier1/2` |
| Speed              | 200 full-screen passes on 4096² in 773 ms (~4 ms each); a dab touches a tiny area                                   |
| Readback           | 1024² `rgba16float` in 7 ms                                                                                         |
| WebGL2 fallback    | `EXT_color_buffer_float`, `EXT_color_buffer_half_float`, `EXT_float_blend`, `OES_texture_float_linear`              |
| Pen                | `pressure`, `getCoalescedEvents`, `getPredictedEvents`, `pointerrawupdate` present                                  |

- Low latency: `desynchronized` exists only for 2D/WebGL canvases, nothing equivalent for a WebGPU
  canvas or as a Chromium flag. Plan: paint in WebGPU, present the visible canvas through a
  desynchronized WebGL/2D canvas if latency needs it — to be measured in the spike.
- Draw from `pointermove` using all coalesced events; predicted events only on a throw-away overlay.
- Pen on Windows: Chromium reads pens through Windows Ink (WM_POINTER), not Wintab. With Wacom,
  "Use Windows Ink" must stay on, or pressure is lost → help hint + constant pressure fallback.
- Electron risk: fallback-adapter requests crashed the GPU process in Electron 42+ (PR #53174, fixed
  Aug 2026): never request `forceFallbackAdapter`; null adapter → WebGL2 path.
- Work in 16-bit float, export 8-bit sRGB PNG with dithering; straight alpha stays the source of
  truth (CLAUDE.md), the WebGPU canvas is configured premultiplied for display only.

Sources: releases.electronjs.org (v44.0.0, PR 53174), developer.chrome.com (WebGPU 142/144,
troubleshooting, desynchronized, aligned input events), w3.org/TR/webgpu, MDN getContext /
getPredictedEvents, support.wacom.com, support.syncsketch.com.

## 2. Brush engine

- **libmypaint (ISC — usable as reference and code)**: dab stamping; number of dabs per segment =
  distance/actual_radius·dabs_per_actual_radius + distance/base_radius·dabs_per_basic_radius +
  time·dabs_per_second, fractional remainder carried to the next event (spacing independent of
  event rate). Each setting = base value + piecewise-linear curves per input (pressure, speed fine/
  gross, random, stroke progress, direction, tilt). Dab shape: rotated/aspect-scaled squared
  distance, opacity two linear segments split at `hardness`, sub-3 px radii anti-aliased by coverage.
  Smudge: canvas colour resampled now and then into a smudge colour, brush colour blended toward it.
  Brush presets (mypaint-brushes) are **CC0** → usable as a starting set.
- **Krita (GPLv3 — docs and behaviour only, no code)**: engines (Pixel, Color Smudge, Bristle, Clone,
  Filter, Tangent Normal…); smoothing modes Basic / Weighted / Stabilizer (sample count by speed,
  delay dead-zone, finish line) / **Pixel** (1 px lines stay 1 px, no L corners — essential for us);
  Color Smudge = smearing vs dulling.
- Stroke pipeline: coalesced events → smoother → spline (Catmull-Rom) → arc-length resampling.
- Flow vs opacity: dabs accumulate in a per-stroke buffer at `flow`, the buffer is composited on the
  layer at `opacity` (max-alpha mode for a hard cap). Blending in sRGB (what painters and the game
  expect) and linear (physical) as a per-brush option.
- Heal brush: Poisson image editing (Pérez et al. 2003) — Jacobi ping-pong passes on the GPU; brush-size
  regions converge in tens of iterations (Jeschke et al. 2009 GPU solver as reference).
- GPU stamping: one instanced quad per dab, falloff in the fragment shader, into the stroke texture.

Sources: github.com/mypaint/libmypaint (brushsettings.json, mypaint-brush.c, mypaint-tiled-surface.c),
github.com/mypaint/mypaint-brushes, docs.krita.org (freehand brush, color smudge, engines),
cg.tuwien.ac.at (Jeschke 2009), web.dev pixiv case study.

## 3. Tileable textures, photo → material, material graphs

- **Tileable**: stochastic textures (stone, dirt, grass) → Heitz–Neyret histogram-preserving blending
  (GPU-cheap, Burley's per-channel LUT variant); structured ones (planks, bricks) → roll by half +
  seam-cut / PatchMatch fill of the seam band with wrap-around patches. Small textures: wrap-aware
  min-cut is enough. PatchMatch (Barnes 2009): random search + propagation, ~4–5 iterations.
- **Photo → material**: Materialize is GPL-3.0 → reimplement, don't copy. Chain: delight (divide by a
  heavy blur / high-pass), height from luminance at several blur scales, normal from height (we have
  it), AO from height, smoothness from inverted local contrast.
- **Material graph** (Material Maker is MIT — reference allowed): each node a GPU pass into a cached
  texture, only dirty downstream nodes re-run. ~25 nodes cover most work: Perlin/simplex, Worley,
  fBm, gradient, Voronoi, shape, tile sampler, transform, warp, blur, sharpen, levels, curves,
  gradient map, blend modes, threshold, invert, flood fill, edge detect, height→normal, normal
  combine, AO, slope blur, mix by mask. Periodic (tileable) noises via wrapped lattice coordinates.
- **CC0 libraries**: ambientCG (CC0, no obligations; API `ambientcg.com/api/v2/full_json`, zips with
  both NormalGL and NormalDX) and Poly Haven (CC0; API needs a "Powered by Poly Haven"-style credit
  and an app User-Agent; scraping the site is not allowed). **LabPBR normals are DirectX (Y−)**
  ✔ code (`shared/labpbr.ts`, verified in Phases 6–8): take NormalDX, or flip green of NormalGL.

Sources: cs.princeton.edu (PatchMatch), arxiv 2005.06278, eheitzresearch (2018/2019), jcgt.org
(Burley 2019), cpl.cc.gatech.edu (graph-cut textures), github.com/BoundingBoxSoftware/Materialize,
github.com/RodZill4/material-maker, docs.ambientcg.com (license, API), polyhaven.com/license,
Poly-Haven Public-API ToS.

## 4. Licences — what we may reuse

| Source                       | Licence     | Use                                                     |
| ---------------------------- | ----------- | ------------------------------------------------------- |
| libmypaint                   | ISC         | algorithms and code (keep the notice)                   |
| mypaint-brushes presets      | CC0         | presets as a starting set                               |
| Material Maker               | MIT         | reference / code with notice                            |
| Krita, GIMP, Materialize     | GPL         | docs and behaviour only                                 |
| Photoshop                    | proprietary | observed behaviour only, never decompiled               |
| ambientCG, Poly Haven assets | CC0         | import into packs (Poly Haven API: credit + User-Agent) |

## 5. Plan consequences

1. Spike: WebGPU 2048² canvas, libmypaint-style dab brush with pressure, stroke buffer, coalesced
   events; measure input→pixel latency and decide WebGPU-only vs WebGL presentation.
2. Pixel-perfect mode stays first-class (16× packs are most of Modrinth).
3. Tileability, photo → material and CC0 import are pure logic first (shared/, tested).
