// Block preview fragment shader: albedo with sun/moon diffuse + ambient.
// Phase 5 extends this with LabPBR (_n / _s); keep the uniforms stable.

uniform sampler2D albedoMap;
// Animation frames as (x, y, width, height) fractions of the image, y from the
// top. frameBlend fades from frameA to frameB (interpolated animations).
uniform vec4 frameA;
uniform vec4 frameB;
uniform float frameBlend;
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform vec3 moonDirection;
uniform vec3 moonColor;
uniform vec3 ambientColor;

in vec2 vUv;
in vec3 vNormal;

// UV v = 1 is the top of the image (textures are flipped on upload).
vec2 frameUv(vec4 frame) {
  return vec2(frame.x + vUv.x * frame.z, 1.0 - (frame.y + (1.0 - vUv.y) * frame.w));
}

void main() {
  vec4 albedo = mix(texture(albedoMap, frameUv(frameA)), texture(albedoMap, frameUv(frameB)), frameBlend);
  // Cutout like vanilla leaves/plants.
  if (albedo.a < 0.1) discard;

  vec3 n = normalize(vNormal);
  vec3 light = ambientColor
    + sunColor * max(dot(n, sunDirection), 0.0)
    + moonColor * max(dot(n, moonDirection), 0.0);

  gl_FragColor = vec4(albedo.rgb * light, 1.0);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
