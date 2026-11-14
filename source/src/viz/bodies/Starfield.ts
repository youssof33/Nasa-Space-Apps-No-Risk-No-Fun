import * as THREE from "three";

export function createStarfield(): THREE.Group {
  const group = new THREE.Group();
  group.add(createLayer(900, 34, 0.075, 0.72, 0x9fc8e8, 1));
  group.add(createLayer(160, 40, 0.16, 0.9, 0xffffff, 2));
  return group;
}

function createLayer(
  count: number,
  radius: number,
  size: number,
  opacity: number,
  tint: number,
  seed: number,
): THREE.Points {
  const random = mulberry32(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const base = new THREE.Color(tint);

  for (let index = 0; index < count; index += 1) {
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(2 * random() - 1);
    const distance = radius + random() * 12;
    positions[index * 3] = distance * Math.sin(phi) * Math.cos(theta);
    positions[index * 3 + 1] = distance * Math.cos(phi);
    positions[index * 3 + 2] = distance * Math.sin(phi) * Math.sin(theta);

    const brightness = 0.55 + random() * 0.45;
    colors[index * 3] = base.r * brightness;
    colors[index * 3 + 1] = base.g * brightness;
    colors[index * 3 + 2] = base.b * brightness;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size,
    sizeAttenuation: true,
    transparent: true,
    opacity,
    vertexColors: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  return new THREE.Points(geometry, material);
}

function mulberry32(seed: number): () => number {
  let value = seed;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result = (result + Math.imul(result ^ (result >>> 7), 61 | result)) ^ result;
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}
