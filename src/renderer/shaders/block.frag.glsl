// Block preview fragment shader: albedo with sun/moon diffuse + ambient.
// Phase 6 extends this with LabPBR (_n / _s); keep the uniforms stable.

uniform sampler2D albedoMap;
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

in vec2 vUv;
in vec3 vNormal;
in vec3 vTint;

// UVs are relative to one frame (0–1); v = 1 is the top of the image
// (textures are flipped on upload).
vec2 frameUv(vec4 frame) {
  return vec2(frame.x + vUv.x * frame.z, 1.0 - (frame.y + (1.0 - vUv.y) * frame.w));
}

vec4 sampleFrame(vec4 frame) {
  vec2 uv = frameUv(frame);
  float levels = min(mipLevels, maxLod);
  if (levels <= 0.0) return textureLod(albedoMap, uv, 0.0);
  vec2 texel = uv * vec2(textureSize(albedoMap, 0));
  vec2 dx = dFdx(texel);
  vec2 dy = dFdy(texel);
  float lod = 0.5 * log2(max(dot(dx, dx), dot(dy, dy)));
  return textureLod(albedoMap, uv, clamp(lod, 0.0, levels));
}

void main() {
  vec4 albedo = mix(sampleFrame(frameA), sampleFrame(frameB), frameBlend);
  if (albedo.a < (translucent ? 0.004 : 0.1)) discard;

  vec3 n = normalize(vNormal);
  vec3 light = ambientColor
    + sunColor * max(dot(n, sunDirection), 0.0)
    + moonColor * max(dot(n, moonDirection), 0.0);

  gl_FragColor = vec4(albedo.rgb * vTint * light, translucent ? albedo.a : 1.0);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
