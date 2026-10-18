// Block preview vertex shader (GLSL ES 3.0; Three.js injects attributes/matrices).

// Per-vertex biome tint (white when the face has no tintindex).
attribute vec3 tint;
// Directions of the texture's +u (right) and +v (down, image rows) on the face, for LabPBR
// normal maps (DirectX convention: green grows downwards).
attribute vec3 texRight;
attribute vec3 texDown;

out vec2 vUv;
out vec3 vNormal;
out vec3 vTint;
out vec3 vTexRight;
out vec3 vTexDown;
out vec3 vWorldPosition;

void main() {
  vUv = uv;
  vTint = tint;
  vec4 local = vec4(position, 1.0);
  // Instanced scenes: one instance per block, translated only (normals unchanged).
  #ifdef USE_INSTANCING
  local = instanceMatrix * local;
  #endif
  mat3 toWorld = mat3(modelMatrix);
  vNormal = normalize(toWorld * normal);
  vTexRight = toWorld * texRight;
  vTexDown = toWorld * texDown;
  vec4 world = modelMatrix * local;
  vWorldPosition = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
