// Block preview vertex shader (GLSL ES 3.0; Three.js injects attributes/matrices).

// Per-vertex biome tint (white when the face has no tintindex).
attribute vec3 tint;

out vec2 vUv;
out vec3 vNormal;
out vec3 vTint;

void main() {
  vUv = uv;
  vTint = tint;
  vec4 local = vec4(position, 1.0);
  // Instanced scenes: one instance per block, translated only (normals unchanged).
  #ifdef USE_INSTANCING
  local = instanceMatrix * local;
  #endif
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * local;
}
