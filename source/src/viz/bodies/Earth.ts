import * as THREE from "three";

export interface EarthTextures {
  day: THREE.Texture;
  night?: THREE.Texture;
  bump?: THREE.Texture;
}

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vUv = uv;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPosition = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform sampler2D bumpMap;
  uniform vec3 sunDirection;

  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec3 normal = normalize(vWorldNormal);

    float height = texture2D(bumpMap, vUv).r;
    vec3 dpx = dFdx(vWorldPosition);
    vec3 dpy = dFdy(vWorldPosition);
    float dhx = dFdx(height);
    float dhy = dFdy(height);
    vec3 r1 = cross(dpy, normal);
    vec3 r2 = cross(normal, dpx);
    float det = dot(dpx, r1);
    vec3 gradient = abs(det) > 1e-6 ? (r1 * dhx + r2 * dhy) / det : vec3(0.0);
    normal = normalize(normal - gradient * 0.035);

    vec3 sun = normalize(sunDirection);
    float ndl = dot(normal, sun);
    float daylight = smoothstep(-0.15, 0.25, ndl);

    vec3 day = texture2D(dayMap, vUv).rgb;
    vec3 night = texture2D(nightMap, vUv).rgb;

    vec3 lit = day * (0.17 + 0.94 * clamp(ndl, 0.0, 1.0));
    lit += vec3(0.012, 0.032, 0.058) * daylight;

    vec3 city = night * 2.2 * (1.0 - daylight);
    vec3 color = lit + city;
    color += day * vec3(0.02, 0.03, 0.05) * (1.0 - daylight);

    float terminator =
      smoothstep(-0.28, 0.02, ndl) * (1.0 - smoothstep(0.06, 0.42, ndl));
    color += vec3(0.12, 0.05, 0.01) * terminator * 0.3;

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class Earth {
  readonly group = new THREE.Group();
  private readonly spin = new THREE.Group();
  private readonly geometry = new THREE.SphereGeometry(1, 96, 96);
  private readonly material: THREE.ShaderMaterial;
  private day: THREE.Texture;
  private night: THREE.Texture;
  private bump: THREE.Texture;

  constructor() {
    this.day = solidTexture(26, 74, 110, THREE.SRGBColorSpace);
    this.night = solidTexture(0, 0, 0, THREE.SRGBColorSpace);
    this.bump = solidTexture(128, 128, 128, THREE.NoColorSpace);

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        dayMap: { value: this.day },
        nightMap: { value: this.night },
        bumpMap: { value: this.bump },
        sunDirection: {
          value: new THREE.Vector3(-0.55, 0.34, 0.76).normalize(),
        },
      },
    });

    const mesh = new THREE.Mesh(this.geometry, this.material);
    this.spin.add(mesh);
    this.group.add(this.spin);
    this.group.rotation.z = THREE.MathUtils.degToRad(-23.4);
  }

  setSunDirection(direction: THREE.Vector3): void {
    this.material.uniforms.sunDirection!.value.copy(direction).normalize();
  }

  setTextures(textures: EarthTextures): void {
    const previous = [this.day, this.night, this.bump];
    this.day = textures.day;
    this.night = textures.night ?? this.night;
    this.bump = textures.bump ?? this.bump;
    this.material.uniforms.dayMap!.value = this.day;
    this.material.uniforms.nightMap!.value = this.night;
    this.material.uniforms.bumpMap!.value = this.bump;
    for (const texture of previous) {
      if (texture !== this.day && texture !== this.night && texture !== this.bump) {
        texture.dispose();
      }
    }
  }

  update(deltaSeconds: number): void {
    this.spin.rotation.y += deltaSeconds * 0.018;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    for (const texture of [this.day, this.night, this.bump]) texture.dispose();
  }
}

function solidTexture(
  red: number,
  green: number,
  blue: number,
  colorSpace: THREE.ColorSpace,
): THREE.DataTexture {
  const texture = new THREE.DataTexture(
    new Uint8Array([red, green, blue, 255]),
    1,
    1,
    THREE.RGBAFormat,
  );
  texture.colorSpace = colorSpace;
  texture.needsUpdate = true;
  return texture;
}
