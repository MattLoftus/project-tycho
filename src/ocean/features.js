import * as THREE from 'three'

// ─── Type palette ────────────────────────────────────────────────────────────

const TYPE_COLORS = {
  vent:     0xff6030,
  creature: 0x40ff80,
  nodule:   0xe0a040,
  trench:   0x2080ff,
  seamount: 0xc060ff,
}

// ─── Contact data ──────────────────────────────────────────────────────────

export const CONTACT_DATA = [
  { id: 1,  type: 'vent',     name: 'Black Smoker Alpha',       depth: '-2,850 m', temp: '380 °C',  minerals: 'Iron sulfide, zinc, copper' },
  { id: 2,  type: 'vent',     name: 'White Smoker Beta',        depth: '-3,200 m', temp: '290 °C',  minerals: 'Barium, calcium, silicon' },
  { id: 3,  type: 'creature', name: 'Giant Tube Worm Colony',   depth: '-2,500 m', species: 'Riftia pachyptila', discovered: '1977' },
  { id: 4,  type: 'creature', name: 'Dumbo Octopus',            depth: '-3,800 m', species: 'Grimpoteuthis sp.', discovered: '1883' },
  { id: 5,  type: 'nodule',   name: 'Nodule Field C-7',         depth: '-4,200 m', composition: 'Mn, Ni, Cu, Co', density: '12 kg/m²' },
  { id: 6,  type: 'creature', name: 'Deep-sea Jellyfish Bloom', depth: '-1,800 m', species: 'Deepstaria enigmatica', discovered: '1967' },
  { id: 7,  type: 'nodule',   name: 'Polymetallic Sulfide Mound', depth: '-3,100 m', composition: 'Cu, Zn, Pb, Au', density: '24 kg/m²' },
  { id: 8,  type: 'vent',     name: 'Hydrothermal Seep Gamma',  depth: '-4,600 m', temp: '120 °C',  minerals: 'Methane, hydrogen sulfide' },
]

export const SPAWN_XZ = [
  [-35,  18], [ 42, -25], [-15,  50], [ 28,  35],
  [-52, -22], [ 18, -55], [-40,  -8], [ 58,  14],
]

// ─── Build a single contact marker ─────────────────────────────────────────

function buildMarker(contact, x, z, terrainH, scene) {
  const col   = new THREE.Color(TYPE_COLORS[contact.type])
  const group = new THREE.Group()

  // Vertical pillar
  const pillarMat = new THREE.MeshStandardMaterial({
    color: col, emissive: col, emissiveIntensity: 0.35,
    transparent: true, opacity: 0.50,
    metalness: 0.6, roughness: 0.25,
  })
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.22, 5.5, 6),
    pillarMat,
  )
  pillar.position.y = 2.75
  group.add(pillar)

  // Top beacon sphere (click target)
  const sphereMat = new THREE.MeshStandardMaterial({
    color: col, emissive: col, emissiveIntensity: 2.0,
    metalness: 0.5, roughness: 0.1,
  })
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.72, 14, 14), sphereMat)
  sphere.position.y = 6.2
  sphere.userData.contact = contact
  group.add(sphere)

  // Pulse ring A
  const ringMatA = new THREE.MeshBasicMaterial({
    color: col, transparent: true, opacity: 0.75,
    side: THREE.DoubleSide, depthWrite: false,
  })
  const ringA = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.4, 36), ringMatA)
  ringA.rotation.x = -Math.PI / 2
  ringA.position.y = 0.15
  group.add(ringA)

  // Pulse ring B (offset phase)
  const ringMatB = ringMatA.clone()
  const ringB = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.4, 36), ringMatB)
  ringB.rotation.x = -Math.PI / 2
  ringB.position.y = 0.15
  group.add(ringB)

  // Point light
  const light = new THREE.PointLight(col, 2.2, 20)
  light.position.y = 6.2
  group.add(light)

  group.position.set(x, terrainH + 0.2, z)
  scene.add(group)

  return {
    group, sphere, sphereMat, pillarMat,
    ringA, ringB, ringMatA, ringMatB, light,
    contact,
    pulseOffset: Math.random() * Math.PI * 2,
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

export function createContacts(scene, terrain) {
  const markers      = []
  const clickTargets = []

  CONTACT_DATA.forEach((contact, i) => {
    const [x, z] = SPAWN_XZ[i]
    const h      = terrain.fbm(x, z)
    const m      = buildMarker(contact, x, z, h, scene)
    markers.push(m)
    clickTargets.push(m.sphere)
  })

  function update(t) {
    markers.forEach((m) => {
      const p = t * 1.6 + m.pulseOffset

      // Beacon pulse
      m.sphereMat.emissiveIntensity = 1.8 + 0.7 * Math.sin(p)
      m.light.intensity             = 1.8 + 0.9 * Math.sin(p)
      m.pillarMat.emissiveIntensity = 0.2 + 0.15 * Math.sin(p * 0.5)

      // Ring A
      const phA = ((t * 0.55 + m.pulseOffset) % 1.0)
      m.ringA.scale.setScalar(1 + phA * 4.5)
      m.ringMatA.opacity = 0.75 * (1 - phA)

      // Ring B — half-cycle offset
      const phB = ((t * 0.55 + m.pulseOffset + 0.5) % 1.0)
      m.ringB.scale.setScalar(1 + phB * 4.5)
      m.ringMatB.opacity = 0.75 * (1 - phB)
    })
  }

  return {
    data:    CONTACT_DATA,
    markers: clickTargets,
    update,
  }
}
