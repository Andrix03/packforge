// Threshold-free bloom like Photon (c5–c19): progressive downsample with the 13-tap filter of
// "Next Generation Post Processing in Call of Duty: Advanced Warfare" (Jimenez 2014), upsample
// blending each level with the next one (3×3 tent), then mix(scene, bloom, strength).
// One shader, three steps (bloomStep): 0 = downsample, 1 = upsample, 2 = composite.

uniform int bloomStep;
uniform sampler2D source;
// Texel size of `source`.
uniform vec2 texel;
// Upsample: the level being blended over (the downsample of the same size) and its weight.
uniform sampler2D detail;
uniform float spread;
// Composite: the scene and how much bloom to mix in.
uniform sampler2D scene;
uniform float strength;

in vec2 vUv;

vec3 tap(vec2 offset) {
  return textureLod(source, vUv + offset * texel, 0.0).rgb;
}

vec3 downsample() {
  vec3 a = tap(vec2(-2.0, 2.0));
  vec3 b = tap(vec2(0.0, 2.0));
  vec3 c = tap(vec2(2.0, 2.0));
  vec3 d = tap(vec2(-2.0, 0.0));
  vec3 e = tap(vec2(0.0, 0.0));
  vec3 f = tap(vec2(2.0, 0.0));
  vec3 g = tap(vec2(-2.0, -2.0));
  vec3 h = tap(vec2(0.0, -2.0));
  vec3 i = tap(vec2(2.0, -2.0));
  vec3 j = tap(vec2(-1.0, 1.0));
  vec3 k = tap(vec2(1.0, 1.0));
  vec3 l = tap(vec2(-1.0, -1.0));
  vec3 m = tap(vec2(1.0, -1.0));
  // Overlapping 4×4 boxes: center 0.5, the four corner boxes 0.125 each.
  return e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
}

vec3 tent() {
  vec3 sum = tap(vec2(-1.0, -1.0)) + tap(vec2(1.0, -1.0)) + tap(vec2(-1.0, 1.0)) + tap(vec2(1.0, 1.0));
  sum += 2.0 * (tap(vec2(0.0, -1.0)) + tap(vec2(-1.0, 0.0)) + tap(vec2(1.0, 0.0)) + tap(vec2(0.0, 1.0)));
  sum += 4.0 * tap(vec2(0.0));
  return sum / 16.0;
}

void main() {
  vec3 color;
  if (bloomStep == 0) {
    color = downsample();
  } else if (bloomStep == 1) {
    color = mix(textureLod(detail, vUv, 0.0).rgb, tent(), spread);
  } else {
    color = mix(textureLod(scene, vUv, 0.0).rgb, tent(), strength);
  }
  gl_FragColor = vec4(color, 1.0);
}
