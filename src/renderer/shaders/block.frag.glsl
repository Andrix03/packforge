// Block preview fragment shader. Two modes:
// - vanilla look (pbr off): albedo with sun/moon diffuse + ambient, written straight to the screen;
// - LabPBR (pbr on): `_n` / `_s` maps decoded like shared/labpbr.ts, GGX lighting, sky reflections
//   and emission, written as linear HDR for the bloom / tone mapping passes.
// BlockPreview prepends the predefined metals table (METAL_N, METAL_K, METAL_F0) from labpbr.ts.

uniform sampler2D albedoMap;
// LabPBR maps; a texture without them gets a flat normal / empty specular 1×1 map.
uniform sampler2D normalMap;
uniform sampler2D specularMap;
// Animation frames as (x, y, width, height) fractions of the image, y from the
// top. frameBlend fades from frameA to frameB (interpolated animations).
uniform vec4 frameA;
uniform vec4 frameB;
uniform float frameBlend;
// Mipmap levels like the game's setting (0 = off), and the most this texture allows without
// mixing its animation frames. The level is chosen here because frames are sub-rectangles.
uniform float mipLevels;
uniform float maxLod;
// Translucent textures (model "force_translucent", e.g. glass) keep their alpha;
// others are cutout like vanilla leaves and plants.
uniform bool translucent;
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform vec3 moonDirection;
uniform vec3 moonColor;
uniform vec3 ambientColor;

uniform bool pbr;
// 0 = final image; 1–9 = one material channel alone; 10 = lighting on a gray material.
uniform int debugView;
// How metals are read (shared/labpbr.ts MetalMode): 0 = spec, 1 = 230–255 as 255 (albedo as F0),
// 2 = predefined metals without the albedo tint.
uniform int metalMode;
// Sky gradient reflected by smooth surfaces (linear), and the ground color below the horizon.
uniform vec3 skyZenith;
uniform vec3 skyHorizon;
uniform vec3 skyGround;
// Light held by the viewer (at the camera), black when off.
uniform vec3 torchColor;
uniform float emissionStrength;
// Rain: how wet things are (0–1) and seconds, for the ripples in puddles.
uniform float wetness;
uniform float rainTime;
// Parallax occlusion mapping from the height in _n.a (Photon / Complementary): depth multiplier
// (1 = the spec's 25% of a block, 0 = off), most pixels crossed, self-shadowing, "slope normals" (the
// sides of the steps between pixels get their own normal, the blocky look of PBR packs).
uniform float pomDepth;
uniform int pomSamples;
uniform bool pomShadows;
uniform bool pomSlopes;
// Sun/moon shadow map: 0 = off, 1 = soft, 2 = snapped to the texture's pixels (Photon's
// PIXELATED_SHADOWS). shadowMatrix maps world positions to the map's clip space.
uniform int shadowMode;
uniform sampler2D shadowMap;
uniform mat4 shadowMatrix;
uniform bool shadowFromSun;
uniform float shadowTexel;
// Depth covered by the map, in blocks (to turn the bias into map depth).
uniform float shadowRange;
// Reflections: 0 = the sky gradient below, 1 = the captured scene (PMREM, read with textureCubeUV).
uniform int envMode;
uniform sampler2D envMap;

#include <cube_uv_reflection_fragment>

// Screen-space reflections (like the shader packs' SSR): march the reflected ray in this frame's
// depth, take the color it hits from the same view rendered without SSR (BlockPreview.prepareSsr).
// ssrPrevViewProj maps the hit into that image (the same camera today). ssrClip = near, far.
uniform bool ssrOn;
uniform sampler2D ssrDepth;
uniform sampler2D ssrColor;
uniform mat4 ssrViewProj;
uniform mat4 ssrPrevViewProj;
uniform vec2 ssrClip;

// Distance from the camera plane of a depth buffer value (perspective).
float viewDistance(float depth) {
  float n = ssrClip.x;
  float f = ssrClip.y;
  return n * f / (f - depth * (f - n));
}

vec2 screenOf(vec4 clip) {
  return clip.xy / clip.w * 0.5 + 0.5;
}

bool onScreen(vec2 uv) {
  return all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)));
}

// Reflected color (rgb) and how much to trust it (a, 0 = use the capture instead).
vec4 traceReflection(vec3 origin, vec3 dir, vec3 toCamera, float roughness) {
  if (!ssrOn || roughness > 0.6) return vec4(0.0);
  vec3 previous = origin;
  // Per-pixel jitter of the first step (interleaved gradient noise, Jimenez 2014): steps fall at
  // different depths on neighbouring pixels, so step bands become fine noise.
  float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  float stepLength = 0.06;
  vec3 p = origin + dir * stepLength * jitter;
  // How far in front of the depth buffer the previous sample was (negative = behind it).
  float previousGap = 1.0;
  float previousDistance = (ssrViewProj * vec4(p, 1.0)).w;
  // Steps grow but stay short (max 0.25 block, ~20 blocks in all): long steps accept false hits
  // behind thin geometry and smear streaks.
  for (int i = 0; i < 96; i++) {
    previous = p;
    p += dir * stepLength;
    stepLength = min(stepLength * 1.06, 0.25);
    vec4 clip = ssrViewProj * vec4(p, 1.0);
    if (clip.w <= ssrClip.x) break;
    vec2 uv = screenOf(clip);
    if (!onScreen(uv)) break;
    float scene = viewDistance(texture(ssrDepth, uv).r);
    // clip.w is the ray's distance from the camera plane. A hit is where the ray goes from in
    // front of the depth buffer to behind it, by no more than its own depth step (seen edge-on, a
    // surface's depth jumps between pixels): deeper means it passed behind an object.
    float gap = scene - clip.w;
    float depthStep = abs(clip.w - previousDistance);
    bool crossed = gap < 0.0 && previousGap >= 0.0;
    previousGap = gap;
    previousDistance = clip.w;
    if (crossed && -gap < max(0.15, depthStep * 4.0)) {
      vec3 a = previous;
      vec3 b = p;
      for (int j = 0; j < 6; j++) {
        vec3 m = 0.5 * (a + b);
        vec4 c = ssrViewProj * vec4(m, 1.0);
        if (c.w > viewDistance(texture(ssrDepth, screenOf(c)).r)) b = m;
        else a = m;
      }
      vec2 hit = screenOf(ssrPrevViewProj * vec4(b, 1.0));
      if (!onScreen(hit)) return vec4(0.0);
      vec2 edge = smoothstep(vec2(0.0), vec2(0.06), hit) * smoothstep(vec2(0.0), vec2(0.06), 1.0 - hit);
      // Rays coming back towards the camera hit surfaces seen edge-on: unreliable.
      float facing = 1.0 - smoothstep(0.3, 0.7, dot(dir, toCamera));
      float trust = edge.x * edge.y * facing * (1.0 - smoothstep(0.3, 0.6, roughness));
      vec3 color = textureLod(ssrColor, hit, roughness * 8.0).rgb;
      return vec4(color, trust);
    }
  }
  return vec4(0.0);
}

in vec2 vUv;
in vec3 vNormal;
in vec3 vTint;
in vec3 vTexRight;
in vec3 vTexDown;
in vec3 vWorldPosition;
in vec3 vLight;

const float PI = 3.14159265359;
// Blocks reached by the torch light (like a torch's light level 14).
const float TORCH_RANGE = 14.0;
// Warm color of block light at middle levels (the game fades it to white at 0 and 15). Its exact
// default is in the game's code, not in its data: this is an approximation.
const vec3 BLOCK_LIGHT_TINT = vec3(1.0, 0.8, 0.6);

// The game's lightmap curve (shaders/core/lightmap.fsh): level 0–1 to brightness.
float lightBrightness(float level) {
  return level / (4.0 - 3.0 * level);
}

// Color of block light at a level, mixed towards white at the ends like the game.
vec3 blockLight(float level) {
  float edge = (2.0 * level - 1.0) * (2.0 * level - 1.0);
  return mix(BLOCK_LIGHT_TINT, vec3(1.0), 0.9 * edge) * lightBrightness(level);
}

// UVs are relative to one frame (0–1); v = 1 is the top of the image
// (textures are flipped on upload).
vec2 frameUv(vec4 frame) {
  return vec2(frame.x + vUv.x * frame.z, 1.0 - (frame.y + (1.0 - vUv.y) * frame.w));
}

// Screen derivatives of the face UVs, taken once in main() (uniform control flow): the mip level
// of a sample comes from these even when POM moves the sample point (like textureGrad).
vec2 uvDx;
vec2 uvDy;

// A point of the frame in texture-local coordinates: x right, y DOWN (image rows), 0–1.
vec2 localUv() {
  return vec2(vUv.x, 1.0 - vUv.y);
}

vec4 sampleFrameAt(sampler2D map, vec4 frame, vec2 local) {
  vec2 uv = vec2(frame.x + local.x * frame.z, 1.0 - (frame.y + local.y * frame.w));
  float levels = min(mipLevels, maxLod);
  if (levels <= 0.0) return textureLod(map, uv, 0.0);
  vec2 size = vec2(textureSize(map, 0)) * frame.zw;
  vec2 dx = uvDx * size;
  vec2 dy = uvDy * size;
  float lod = 0.5 * log2(max(dot(dx, dx), dot(dy, dy)));
  return textureLod(map, uv, clamp(lod, 0.0, levels));
}

vec4 sampleFrame(sampler2D map, vec4 frame) {
  return sampleFrameAt(map, frame, localUv());
}

vec4 sampleMap(sampler2D map) {
  return mix(sampleFrame(map, frameA), sampleFrame(map, frameB), frameBlend);
}

vec4 sampleMapAt(sampler2D map, vec2 local) {
  return mix(sampleFrameAt(map, frameA, local), sampleFrameAt(map, frameB, local), frameBlend);
}

const int POM_MAX_SAMPLES = 128;

// Depth of the pixel (texel cell) `cell` of the frame's height map, sampled at its center.
float pomCellDepth(vec2 cell, vec2 res) {
  vec2 local = fract((cell + 0.5) / res);
  vec2 uv = vec2(frameA.x + local.x * frameA.z, 1.0 - (frameA.y + local.y * frameA.w));
  return 1.0 - textureLod(normalMap, uv, 0.0).a;
}

// Walks the view ray (dir, tangent space: x right, y down, z out of the surface) pixel by pixel
// through the height map (2D DDA, Amanatides & Woo): the height is constant inside a pixel, so the
// hit on a pixel's top or side is exact, with no stepping bands or dither noise (shader packs hide
// those with TAA, which the preview doesn't have). Up to pomSamples pixels are crossed.
// Returns the local point hit; `hit` = (local, depth 0–1); `slope` = the tangent normal of the pixel
// side it ran into (when slope normals are on), else 0.
vec2 parallax(vec3 dir, float scale, out vec3 hit, out vec3 slope) {
  vec2 start = localUv();
  hit = vec3(start, 0.0);
  slope = vec3(0.0);
  vec2 res = vec2(textureSize(normalMap, 0)) * frameA.zw;
  vec2 cell = floor(start * res);
  // At the surface already (or no height map): nothing to do.
  if (scale <= 0.0 || pomCellDepth(cell, res) < 1.0 / 255.0) return start;
  // Local offset per unit of depth: full depth = 25% of a block, one block = one frame (16-pixel UVs).
  vec2 offset = dir.xy / max(-dir.z, 0.1) * MAX_DEPTH * scale;
  vec2 stepCell = vec2(offset.x > 0.0 ? 1.0 : -1.0, offset.y > 0.0 ? 1.0 : -1.0);
  // Depth at which the ray crosses the next pixel edge on each axis, and the depth per pixel.
  vec2 perCell = vec2(
    abs(offset.x) > 1e-6 ? 1.0 / (abs(offset.x) * res.x) : 1e9,
    abs(offset.y) > 1e-6 ? 1.0 / (abs(offset.y) * res.y) : 1e9
  );
  vec2 nextEdge = (cell + max(stepCell, 0.0)) / res;
  vec2 tNext = vec2(
    abs(offset.x) > 1e-6 ? (nextEdge.x - start.x) / offset.x : 1e9,
    abs(offset.y) > 1e-6 ? (nextEdge.y - start.y) / offset.y : 1e9
  );
  float tEnter = 0.0;
  int axis = -1;
  int cells = clamp(pomSamples, 1, POM_MAX_SAMPLES);
  for (int i = 0; i < POM_MAX_SAMPLES; i++) {
    float depth = pomCellDepth(cell, res);
    float tExit = min(min(tNext.x, tNext.y), 1.0);
    if (depth <= tEnter) {
      // The pixel's top is above where the ray came in: it hit the pixel's side.
      if (pomSlopes && axis == 0) slope = vec3(-stepCell.x, 0.0, 0.0);
      if (pomSlopes && axis == 1) slope = vec3(0.0, -stepCell.y, 0.0);
      // The entry point lies exactly on the edge with the pixel the ray came from: keep it a hair
      // inside this one, or rounding reads either pixel's maps (speckled walls).
      vec2 side = clamp(start + offset * tEnter, (cell + 0.001) / res, (cell + 0.999) / res);
      hit = vec3(side, tEnter);
      return fract(hit.xy);
    }
    if (depth <= tExit || tExit >= 1.0 || i + 1 >= cells) {
      // The ray reaches this pixel's top inside it (or the deepest level).
      float t = min(depth, 1.0);
      hit = vec3(start + offset * t, t);
      return fract(hit.xy);
    }
    tEnter = tExit;
    if (tNext.x < tNext.y) {
      cell.x += stepCell.x;
      tNext.x += perCell.x;
      axis = 0;
    } else {
      cell.y += stepCell.y;
      tNext.y += perCell.y;
      axis = 1;
    }
  }
  return fract(hit.xy);
}

// How much of a light (tangent direction l) reaches the POM hit point past the height field: the
// same pixel walk from the hit towards the light while it rises to the surface; any pixel whose top
// is above the ray when the ray leaves it blocks the light.
float parallaxShadow(vec3 hit, vec3 l, float scale) {
  if (!pomShadows || scale <= 0.0 || hit.z <= 1.0 / 255.0 || l.z <= 0.0) return 1.0;
  vec2 res = vec2(textureSize(normalMap, 0)) * frameA.zw;
  vec2 offset = l.xy / max(l.z, 0.1) * MAX_DEPTH * scale;
  // A hit on a pixel's side lies exactly on the edge between two pixels: floor() would pick either
  // one by rounding (salt-and-pepper shadows). Start a hair towards the light instead, in the pixel
  // the light ray really leaves through, and check that pixel too: a side facing away from the
  // light is inside its own (taller) pixel.
  float offsetLength = length(offset);
  vec2 start = hit.xy;
  if (offsetLength > 1e-6) start += offset / offsetLength * (0.01 / max(res.x, res.y));
  vec2 cell = floor(start * res);
  if (pomCellDepth(cell, res) < hit.z - 1e-3) return 0.0;
  vec2 stepCell = vec2(offset.x > 0.0 ? 1.0 : -1.0, offset.y > 0.0 ? 1.0 : -1.0);
  vec2 perCell = vec2(
    abs(offset.x) > 1e-6 ? 1.0 / (abs(offset.x) * res.x) : 1e9,
    abs(offset.y) > 1e-6 ? 1.0 / (abs(offset.y) * res.y) : 1e9
  );
  vec2 nextEdge = (cell + max(stepCell, 0.0)) / res;
  vec2 tNext = vec2(
    abs(offset.x) > 1e-6 ? (nextEdge.x - start.x) / offset.x : 1e9,
    abs(offset.y) > 1e-6 ? (nextEdge.y - start.y) / offset.y : 1e9
  );
  // t = how much the ray has risen; it reaches the surface at t = hit depth.
  for (int i = 0; i < POM_MAX_SAMPLES; i++) {
    float tExit = min(tNext.x, tNext.y);
    if (tExit >= hit.z) return 1.0;
    if (tNext.x < tNext.y) {
      cell.x += stepCell.x;
      tNext.x += perCell.x;
    } else {
      cell.y += stepCell.y;
      tNext.y += perCell.y;
    }
    // Entering this pixel at depth hit.z - tExit: blocked if its top is above that.
    if (pomCellDepth(cell, res) < hit.z - tExit - 1e-3) return 0.0;
  }
  return 1.0;
}

vec3 toLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

// A raw 0–1 channel value shown as that gray on screen (the output is sRGB-encoded later).
vec3 gray(float value) {
  return toLinear(vec3(value));
}

float distributionGgx(float NoH, float alpha) {
  float a2 = alpha * alpha;
  float d = NoH * NoH * (a2 - 1.0) + 1.0;
  return a2 / (PI * d * d);
}

float visibilitySmithGgx(float NoV, float NoL, float alpha) {
  float a2 = alpha * alpha;
  float v = NoL * sqrt(NoV * NoV * (1.0 - a2) + a2);
  float l = NoV * sqrt(NoL * NoL * (1.0 - a2) + a2);
  return 0.5 / max(v + l, 1e-5);
}

vec3 fresnelSchlick(float cosTheta, vec3 f0) {
  return f0 + (1.0 - f0) * pow(1.0 - cosTheta, 5.0);
}

// Exact Fresnel of a conductor with complex IOR eta + ik, from air (S. Lagarde, "Memo on Fresnel
// equations", 2013).
vec3 fresnelConductor(float cosTheta, vec3 eta, vec3 k) {
  float c2 = cosTheta * cosTheta;
  float s2 = 1.0 - c2;
  vec3 eta2 = eta * eta;
  vec3 k2 = k * k;
  vec3 t0 = eta2 - k2 - s2;
  vec3 a2b2 = sqrt(t0 * t0 + 4.0 * eta2 * k2);
  vec3 t1 = a2b2 + c2;
  vec3 a = sqrt(max(0.5 * (a2b2 + t0), 0.0));
  vec3 t2 = 2.0 * a * cosTheta;
  vec3 rs = (t1 - t2) / (t1 + t2);
  vec3 t3 = c2 * a2b2 + s2 * s2;
  vec3 t4 = t2 * s2;
  vec3 rp = rs * (t3 - t4) / (t3 + t4);
  return 0.5 * (rp + rs);
}

// Split-sum environment BRDF, analytic fit (B. Karis, "Physically Based Shading on Mobile").
vec3 environmentBrdf(vec3 f0, float perceptualRoughness, float NoV) {
  const vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022);
  const vec4 c1 = vec4(1.0, 0.0425, 1.04, -0.04);
  vec4 r = perceptualRoughness * c0 + c1;
  float a004 = min(r.x * r.x, exp2(-9.28 * NoV)) * r.x + r.y;
  vec2 ab = vec2(-1.04, 1.04) * a004 + r.zw;
  return f0 * ab.x + ab.y;
}

vec3 skyRadiance(vec3 dir) {
  if (dir.y >= 0.0) return mix(skyHorizon, skyZenith, sqrt(dir.y));
  return mix(skyHorizon, skyGround, smoothstep(0.0, 0.25, -dir.y));
}

// How much of the shadowed light (sun or moon) reaches this point: 1 = lit, 0 = in shadow.
float lightVisibility(vec3 face, vec3 lightDir) {
  if (shadowMode == 0) return 1.0;
  // Pixels per block of this texture (16 for a 16× pack).
  float res = frameA.z * float(textureSize(albedoMap, 0).x);
  // Half a pixel out of the surface, so the face doesn't shadow itself.
  vec3 p = vWorldPosition + face * (0.5 / res);
  // Block edges are at .5 (blocks are centered on whole numbers): snap to their pixel centers.
  if (shadowMode == 2) p = (floor((p + 0.5) * res + 0.01) + 0.5) / res - 0.5;
  vec4 clip = shadowMatrix * vec4(p, 1.0);
  vec3 coord = clip.xyz / clip.w * 0.5 + 0.5;
  if (any(lessThan(coord, vec3(0.0))) || any(greaterThan(coord, vec3(1.0)))) return 1.0;
  // Grazing light needs more bias (slope-scaled), in blocks then in map depth.
  float NoL = clamp(dot(face, lightDir), 0.05, 1.0);
  float bias = (0.01 + 0.03 * sqrt(1.0 - NoL * NoL) / NoL) / shadowRange;
  float lit = 0.0;
  // 3×3 PCF: a soft edge one map texel wide.
  for (int i = -1; i <= 1; i++) {
    for (int j = -1; j <= 1; j++) {
      float depth = texture(shadowMap, coord.xy + vec2(float(i), float(j)) * shadowTexel).r;
      lit += step(coord.z - bias, depth);
    }
  }
  return lit / 9.0;
}

// Smooth value noise over the world's ground plane (puddle patches, ripples).
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), u.x), u.y);
}

struct Surface {
  vec3 albedo;
  vec3 normal;
  // Geometric (face) normal: lights behind the face don't reach it, whatever the normal map says.
  vec3 face;
  vec3 view;
  float alpha;
  float perceptualRoughness;
  // 0 = dielectric (F0 = f0), 1 = predefined metal (metalId), 2 = albedo metal.
  int metalKind;
  // What tints a predefined metal's reflections (the albedo, or white without tint).
  vec3 metalTint;
  int metalId;
  float f0;
  float sss;
};

vec3 specularFresnel(Surface s, float cosTheta) {
  if (s.metalKind == 1) return fresnelConductor(cosTheta, METAL_N[s.metalId], METAL_K[s.metalId]) * s.metalTint;
  if (s.metalKind == 2) return fresnelSchlick(cosTheta, s.albedo);
  return fresnelSchlick(cosTheta, vec3(s.f0));
}

// Light arriving from direction L with color (already × intensity).
vec3 shadeLight(Surface s, vec3 L, vec3 color) {
  float faceNoL = dot(s.face, L);
  float NoL = dot(s.normal, L);
  vec3 result = vec3(0.0);
  if (s.sss > 0.0 && s.metalKind == 0) {
    // Subsurface scattering, simple: light wraps around and shines through thin blocks.
    float wrap = max(0.0, (NoL + 0.5) / 1.5);
    float through = max(0.0, -faceNoL) * 0.6;
    result += s.albedo * color * s.sss * (wrap + through) * 0.5;
  }
  float lit = smoothstep(0.0, 0.08, faceNoL);
  if (NoL <= 0.0 || lit <= 0.0) return result;
  vec3 H = normalize(L + s.view);
  float NoV = max(dot(s.normal, s.view), 1e-3);
  float NoH = max(dot(s.normal, H), 0.0);
  float VoH = max(dot(s.view, H), 0.0);
  vec3 F = specularFresnel(s, VoH);
  vec3 specular = PI * distributionGgx(NoH, s.alpha) * visibilitySmithGgx(NoV, NoL, s.alpha) * F;
  vec3 diffuse = s.metalKind == 0 ? s.albedo * (1.0 - s.f0) * (1.0 - s.sss * 0.5) : vec3(0.0);
  return result + (diffuse + min(specular, vec3(64.0))) * NoL * color * lit;
}

vec3 shadePbr(out float alpha) {
  vec3 face = normalize(vNormal);
  vec3 right = normalize(vTexRight - face * dot(face, vTexRight));
  vec3 down = normalize(vTexDown - face * dot(face, vTexDown));
  vec3 toCamera = normalize(cameraPosition - vWorldPosition);

  // POM: find where the view ray meets the height field, then read every map there. It fades
  // out between 24 and 32 blocks away (like Photon's POM_DISTANCE 32).
  float pomScale = pomDepth * (1.0 - smoothstep(24.0, 32.0, length(cameraPosition - vWorldPosition)));
  vec3 dirT = vec3(dot(-toCamera, right), dot(-toCamera, down), dot(-toCamera, face));
  vec3 pomHit;
  vec3 slope;
  vec2 local = parallax(dirT, pomScale, pomHit, slope);
  vec4 albedoSample = sampleMapAt(albedoMap, local);
  vec4 normalSample = sampleMapAt(normalMap, local);
  vec4 specularSample = sampleMapAt(specularMap, local);
  vec3 albedo = albedoSample.rgb * vTint;

  // _n: X right, Y down (DirectX), Z rebuilt; B = AO, A = height.
  vec2 xy = normalSample.rg * 2.0 - 1.0;
  vec3 tangentNormal = vec3(xy, sqrt(clamp(1.0 - dot(xy, xy), 0.0, 1.0)));
  if (slope != vec3(0.0)) tangentNormal = slope;
  vec3 N = normalize(right * tangentNormal.x + down * tangentNormal.y + face * tangentNormal.z);
  float ao = normalSample.b;
  float height = normalSample.a;

  // _s: R smoothness, G F0 / metals, B porosity / SSS, A emission.
  int g = int(specularSample.g * 255.0 + 0.5);
  int b = int(specularSample.b * 255.0 + 0.5);
  int a = int(specularSample.a * 255.0 + 0.5);
  float smoothness = specularSample.r;
  float porosity = b <= 64 ? float(b) / 64.0 : 0.0;
  float sss = b > 64 ? float(b - 65) / 190.0 : 0.0;
  float emission = a < 255 ? float(a) / 254.0 : 0.0;
  int metalKind = g <= 229 ? 0 : (g <= 237 ? 1 : 2);
  if (metalMode == 1 && metalKind == 1) metalKind = 2;
  vec3 metalTint = metalMode == 2 ? vec3(1.0) : albedo;
  int metalId = clamp(g - 230, 0, 7);

  alpha = translucent ? albedoSample.a : 1.0;
  if (debugView == 1) return albedo;
  if (debugView == 2) return toLinear(tangentNormal * 0.5 + 0.5);
  if (debugView == 3) return gray(ao);
  if (debugView == 4) return gray(height);
  if (debugView == 5) return gray(smoothness);
  if (debugView == 6) {
    if (metalKind == 1) return METAL_F0[metalId];
    if (metalKind == 2) return albedo;
    return gray(specularSample.g);
  }
  if (debugView == 7) return gray(porosity);
  if (debugView == 8) return gray(sss);
  if (debugView == 9) return albedo * emission;
  if (debugView == 10) albedo = vec3(0.45);

  // Rain, after Photon's rain_puddles.glsl, only where the sky reaches (sky light 14–15).
  // Porosity (_s B 0–64) decides how much a block soaks up and darkens; puddles form on top
  // faces in patches; non-porous surfaces get a shiny film of water.
  float puddle = 0.0;
  if (wetness > 0.0) {
    float exposed = wetness * smoothstep(13.5 / 15.0, 1.0, vLight.x);
    vec2 ground = vWorldPosition.xz;
    float patches = 0.6 * valueNoise(ground * 0.35) + 0.4 * valueNoise(ground * 0.9 + 17.0);
    puddle = face.y > 0.99 ? smoothstep(0.45, 0.55, patches) * exposed : 0.0;
    albedo *= 1.0 - 0.67 * porosity * max(puddle, 0.6 * exposed);
    puddle *= 1.0 - porosity;
    albedo *= 1.0 - 0.33 * puddle;
    // Puddle water: very smooth (roughness 0.002) and flat, with rain ripples.
    float film = 0.5 * exposed * (1.0 - porosity);
    smoothness = max(smoothness, mix(smoothness, 0.85, film));
    smoothness = mix(smoothness, 1.0 - sqrt(0.002), puddle);
    vec2 ripple = vec2(
      valueNoise(ground * 6.0 + vec2(rainTime * 1.3, 0.0)),
      valueNoise(ground * 6.0 + vec2(0.0, rainTime * 1.1) + 5.0)
    ) - 0.5;
    N = normalize(mix(N, normalize(face + vec3(ripple.x, 0.0, ripple.y) * 0.08), puddle));
    if (metalMode != 2) metalTint = albedo;
  }

  float roughness = (1.0 - smoothness) * (1.0 - smoothness);
  Surface s;
  s.albedo = albedo;
  s.normal = N;
  s.face = face;
  s.view = normalize(cameraPosition - vWorldPosition);
  // Perfectly smooth surfaces would make the sun's highlight a single invisible point.
  s.alpha = max(roughness, 0.02);
  s.perceptualRoughness = 1.0 - smoothness;
  s.metalKind = metalKind;
  s.metalTint = metalTint;
  s.metalId = metalId;
  s.f0 = metalKind == 0 ? specularSample.g : 0.0;
  // Water reflects 2% (Photon: f0 = max(f0, mix(f0, 0.02, puddle))).
  if (metalKind == 0) s.f0 = max(s.f0, mix(s.f0, 0.02, puddle));
  s.sss = sss;

  // Game light: how much sky reaches this corner (stands in for shadows), block light, AO.
  float sky = lightBrightness(vLight.x);
  float cornerAo = vLight.z;
  // With shadows the map says where the sun (or moon) reaches; without, sky light stands in.
  float sunLit = shadowMode == 0 ? sky : (shadowFromSun ? lightVisibility(face, sunDirection) : sky);
  float moonLit = shadowMode == 0 ? sky : (shadowFromSun ? sky : lightVisibility(face, moonDirection));
  // POM self-shadowing: the relief of the height map shades itself.
  vec3 sunT = vec3(dot(sunDirection, right), dot(sunDirection, down), dot(sunDirection, face));
  vec3 moonT = vec3(dot(moonDirection, right), dot(moonDirection, down), dot(moonDirection, face));
  sunLit *= parallaxShadow(pomHit, sunT, pomScale);
  moonLit *= parallaxShadow(pomHit, moonT, pomScale);
  vec3 color = shadeLight(s, sunDirection, sunColor) * sunLit + shadeLight(s, moonDirection, moonColor) * moonLit;
  if (dot(torchColor, torchColor) > 0.0) {
    vec3 toTorch = cameraPosition - vWorldPosition;
    float falloff = max(0.0, 1.0 - length(toTorch) / TORCH_RANGE);
    color += shadeLight(s, normalize(toTorch), torchColor * falloff * falloff);
  }

  // Ambient: sky above, ground below, darkened by the material AO.
  float NoV = max(dot(N, s.view), 1e-3);
  vec3 irradiance = mix(skyGround, ambientColor, 0.5 + 0.5 * N.y) * sky;
  float materialAo = ao;
  ao *= cornerAo;
  vec3 lamps = blockLight(vLight.y);
  if (metalKind == 0) color += albedo * (irradiance + lamps) * ao * (1.0 - s.f0);
  // Reflections of the sky, blurred towards the ambient light as roughness grows.
  vec3 R = reflect(-s.view, N);
  // Block light (torches, glowstone…) has no direction: it reaches reflections from all around,
  // so metals, which have no diffuse light, still shine near a torch (like the shader packs).
  // The capture is taken from one probe: the corner's own block light is a floor for it.
  // Smooth metals keep their contrast: the flat block-light floor only for rough surfaces.
  vec3 reflected = envMode == 1
    ? max(textureCubeUV(envMap, R, s.perceptualRoughness).rgb, lamps * s.perceptualRoughness)
    : mix(skyRadiance(R) * sky, irradiance, sqrt(roughness)) + lamps;
  vec4 traced = traceReflection(vWorldPosition + face * 0.01, R, s.view, s.perceptualRoughness);
  // AO only darkens the fallback, and as specular occlusion (Frostbite / Unity HDRP: smooth
  // surfaces see past small cavities). Traced reflections already show what is really there: AO
  // on them would compound at every bounce and turn inner corners of metal black.
  // The corner AO of smooth lighting spans a whole block: a mirror sees the other wall there, not
  // a cavity, so it only counts as much as the surface is rough.
  float specularAo = clamp(pow(NoV + materialAo, exp2(-16.0 * roughness - 1.0)) - 1.0 + materialAo, 0.0, 1.0)
    * mix(1.0, cornerAo, s.perceptualRoughness);
  reflected = mix(reflected * specularAo, traced.rgb, traced.a);
  reflected *= smoothstep(-0.25, 0.15, dot(R, face));
  vec3 f0 = metalKind == 1 ? METAL_F0[metalId] * metalTint : (metalKind == 2 ? albedo : vec3(s.f0));
  color += reflected * environmentBrdf(f0, s.perceptualRoughness, NoV);

  return color + albedo * emission * emissionStrength;
}

void main() {
  uvDx = dFdx(vUv);
  uvDy = dFdy(vUv);
  vec4 albedo = sampleMap(albedoMap);
  if (albedo.a < (translucent ? 0.004 : 0.1)) discard;

  if (pbr) {
    float alpha;
    vec3 color = shadePbr(alpha);
    gl_FragColor = vec4(color, alpha);
  } else {
    vec3 n = normalize(vNormal);
    vec3 daylight = ambientColor
      + sunColor * max(dot(n, sunDirection), 0.0)
      + moonColor * max(dot(n, moonDirection), 0.0);
    // Like the game's lightmap: sky light scales the daylight, block light adds to it.
    vec3 light = (daylight * lightBrightness(vLight.x) + blockLight(vLight.y)) * vLight.z;
    gl_FragColor = vec4(albedo.rgb * vTint * light, translucent ? albedo.a : 1.0);
  }

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
