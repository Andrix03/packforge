// Sky dome of the Effects view (and of the reflection captures): the same gradient the block
// shader reflects when there is no capture. Drawn behind everything, centered on the viewer.

uniform vec3 skyZenith;
uniform vec3 skyHorizon;
uniform vec3 skyGround;

in vec3 vDirection;

void main() {
  vec3 dir = normalize(vDirection);
  vec3 color = dir.y >= 0.0
    ? mix(skyHorizon, skyZenith, sqrt(dir.y))
    : mix(skyHorizon, skyGround, smoothstep(0.0, 0.25, -dir.y));
  gl_FragColor = vec4(color, 1.0);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
