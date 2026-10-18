// Full-screen pass vertex shader (three's FullScreenQuad triangle).

out vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
