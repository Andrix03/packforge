// Block preview fragment shader: albedo with sun/moon diffuse + ambient.
// Phase 5 extends this with LabPBR (_n / _s); keep the uniforms stable.

uniform sampler2D albedoMap;
// Height of the first frame as a fraction of the texture (animated strips).
uniform float frameScale;
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform vec3 moonDirection;
uniform vec3 moonColor;
uniform vec3 ambientColor;

in vec2 vUv;
in vec3 vNormal;

void main() {
  // UV v = 1 is the top of the image; show only the first (top) frame.
  vec2 uv = vec2(vUv.x, 1.0 - (1.0 - vUv.y) * frameScale);
  vec4 albedo = texture(albedoMap, uv);
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
