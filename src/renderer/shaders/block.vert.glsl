// Block preview vertex shader (GLSL ES 3.0; Three.js injects attributes/matrices).

// Per-vertex biome tint (white when the face has no tintindex).
attribute vec3 tint;
// Directions of the texture's +u (right) and +v (down, image rows) on the face, for LabPBR
// normal maps (DirectX convention: green grows downwards).
attribute vec3 texRight;
attribute vec3 texDown;
// Game-like light of the corner: sky level, block level (0–1 = 0–15) and smooth-lighting AO.
attribute vec3 lightLevels;
// 1 on the planes of zero-thickness elements (crops, flowers): no POM there (see block.frag).
attribute float thinPlane;
// Wind: how much the vertex moves (0 at a plant's base, 1 at the top of its block) and the
// phase of its block (the same for the whole plant).
attribute vec2 sway;

// Wind on plants, like the waving plants of shader packs (0 = still); seconds for the motion.
uniform float windStrength;
uniform float windTime;

out vec2 vUv;
out vec3 vNormal;
out vec3 vTint;
out vec3 vTexRight;
out vec3 vTexDown;
out vec3 vWorldPosition;
out vec3 vLight;
out float vThin;

void main() {
  vUv = uv;
  vTint = tint;
  vLight = lightLevels;
  vThin = thinPlane;
  vec4 local = vec4(position, 1.0);
  mat3 toWorld = mat3(modelMatrix);
  vNormal = normalize(toWorld * normal);
  vTexRight = toWorld * texRight;
  vTexDown = toWorld * texDown;
  vec4 world = modelMatrix * local;
  if (windStrength > 0.0 && sway.x > 0.0) {
    // A slow gust plus a faster flutter, out of phase from block to block.
    float phase = windTime * 1.7 + sway.y;
    vec2 offset = vec2(
      sin(phase) + 0.35 * sin(phase * 2.3 + 1.7),
      0.6 * cos(phase * 0.8 + sway.y * 0.4)
    );
    world.xz += offset * sway.x * windStrength * 0.1;
  }
  vWorldPosition = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
