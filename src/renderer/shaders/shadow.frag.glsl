// Shadow map pass (depth only): the block's albedo decides what casts a shadow, like a cutout
// (leaves and glass frames cast, their holes let the sun through). Uses block.vert.glsl.

uniform sampler2D albedoMap;
uniform vec4 frameA;

in vec2 vUv;

void main() {
  vec2 uv = vec2(frameA.x + vUv.x * frameA.z, 1.0 - (frameA.y + (1.0 - vUv.y) * frameA.w));
  if (textureLod(albedoMap, uv, 0.0).a < 0.5) discard;
  gl_FragColor = vec4(1.0);
}
