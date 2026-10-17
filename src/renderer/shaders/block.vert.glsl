// Block preview vertex shader (GLSL ES 3.0; Three.js injects attributes/matrices).

out vec2 vUv;
out vec3 vNormal;

void main() {
  vUv = uv;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
