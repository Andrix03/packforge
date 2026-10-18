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
// Sky gradient reflected by smooth surfaces (linear), and the ground color below the horizon.
uniform vec3 skyZenith;
uniform vec3 skyHorizon;
uniform vec3 skyGround;
// Light held by the viewer (at the camera), black when off.
uniform vec3 torchColor;
uniform float emissionStrength;
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

vec4 sampleFrame(sampler2D map, vec4 frame) {
  vec2 uv = frameUv(frame);
  float levels = min(mipLevels, maxLod);
  if (levels <= 0.0) return textureLod(map, uv, 0.0);
  vec2 texel = uv * vec2(textureSize(map, 0));
  vec2 dx = dFdx(texel);
  vec2 dy = dFdy(texel);
  float lod = 0.5 * log2(max(dot(dx, dx), dot(dy, dy)));
  return textureLod(map, uv, clamp(lod, 0.0, levels));
}

vec4 sampleMap(sampler2D map) {
  return mix(sampleFrame(map, frameA), sampleFrame(map, frameB), frameBlend);
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
  int metalId;
  float f0;
  float sss;
};

vec3 specularFresnel(Surface s, float cosTheta) {
  if (s.metalKind == 1) return fresnelConductor(cosTheta, METAL_N[s.metalId], METAL_K[s.metalId]) * s.albedo;
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

vec3 shadePbr(vec4 albedoSample, vec4 normalSample, vec4 specularSample, out float alpha) {
  vec3 face = normalize(vNormal);
  vec3 albedo = albedoSample.rgb * vTint;

  // _n: X right, Y down (DirectX), Z rebuilt; B = AO, A = height.
  vec2 xy = normalSample.rg * 2.0 - 1.0;
  vec3 tangentNormal = vec3(xy, sqrt(clamp(1.0 - dot(xy, xy), 0.0, 1.0)));
  vec3 right = normalize(vTexRight - face * dot(face, vTexRight));
  vec3 down = normalize(vTexDown - face * dot(face, vTexDown));
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
  s.metalId = metalId;
  s.f0 = metalKind == 0 ? specularSample.g : 0.0;
  s.sss = sss;

  // Game light: how much sky reaches this corner (stands in for shadows), block light, AO.
  float sky = lightBrightness(vLight.x);
  float cornerAo = vLight.z;
  // With shadows the map says where the sun (or moon) reaches; without, sky light stands in.
  float sunLit = shadowMode == 0 ? sky : (shadowFromSun ? lightVisibility(face, sunDirection) : sky);
  float moonLit = shadowMode == 0 ? sky : (shadowFromSun ? sky : lightVisibility(face, moonDirection));
  vec3 color = shadeLight(s, sunDirection, sunColor) * sunLit + shadeLight(s, moonDirection, moonColor) * moonLit;
  if (dot(torchColor, torchColor) > 0.0) {
    vec3 toTorch = cameraPosition - vWorldPosition;
    float falloff = max(0.0, 1.0 - length(toTorch) / TORCH_RANGE);
    color += shadeLight(s, normalize(toTorch), torchColor * falloff * falloff);
  }

  // Ambient: sky above, ground below, darkened by the material AO.
  float NoV = max(dot(N, s.view), 1e-3);
  vec3 irradiance = mix(skyGround, ambientColor, 0.5 + 0.5 * N.y) * sky;
  ao *= cornerAo;
  vec3 lamps = blockLight(vLight.y);
  if (metalKind == 0) color += albedo * (irradiance + lamps) * ao * (1.0 - s.f0);
  // Reflections of the sky, blurred towards the ambient light as roughness grows.
  vec3 R = reflect(-s.view, N);
  vec3 reflected = envMode == 1
    ? textureCubeUV(envMap, R, s.perceptualRoughness).rgb
    : mix(skyRadiance(R) * sky, irradiance, sqrt(roughness)) + lamps * roughness;
  reflected *= smoothstep(-0.25, 0.15, dot(R, face));
  vec3 f0 = metalKind == 1 ? METAL_F0[metalId] * albedo : (metalKind == 2 ? albedo : vec3(s.f0));
  color += reflected * environmentBrdf(f0, s.perceptualRoughness, NoV) * ao;

  return color + albedo * emission * emissionStrength;
}

void main() {
  vec4 albedo = sampleMap(albedoMap);
  if (albedo.a < (translucent ? 0.004 : 0.1)) discard;

  if (pbr) {
    float alpha;
    vec3 color = shadePbr(albedo, sampleMap(normalMap), sampleMap(specularMap), alpha);
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
