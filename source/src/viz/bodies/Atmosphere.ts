import * as THREE from "three";

const vertexShader = /* glsl */ `
  varying vec3 vNormal;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vNormal;

  void main() {
    float intensity = pow(0.62 - dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)), 4.0);
    gl_FragColor = vec4(0.18, 0.58, 1.0, 1.0) * max(intensity, 0.0);
    #include <colorspace_fragment>
  }
`;

export function createAtmosphere(): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(1.14, 64, 64);
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = -1;
  return mesh;
}
