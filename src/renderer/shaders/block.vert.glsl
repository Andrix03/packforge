// Block preview vertex shader (GLSL ES 3.0; Three.js injects attributes/matrices).

// Per-vertex biome tint (white when the face has no tintindex).
attribute vec3 tint;

out vec2 vUv;
out vec3 vNormal;
out vec3 vTint;

void main() {
  vUv = uv;
  vTint = tint;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
