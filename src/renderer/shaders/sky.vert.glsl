// Sky dome vertex shader: passes the direction from the dome's center.

out vec3 vDirection;

void main() {
  vDirection = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
