import * as THREE from 'three'

// ─── Type palette ────────────────────────────────────────────────────────────

const TYPE_COLORS = {
  mineral:    0xe07820,
  energy:     0x00c8e0,
  biological: 0x40e068,
  rare:       0xc060ff,
}

// ─── Survey data ─────────────────────────────────────────────────────────────

export const DEPOSIT_DATA = [
  { id: 1, type: 'mineral',    name: 'Iron Oxide Vein',         quantity: 847,   unit: 'kt',  grade: 'HIGH',     depth: '340 m' },
  { id: 2, type: 'energy',     name: 'Geothermal Vent',         quantity: 2.4,   unit: 'GW',  grade: 'CRITICAL', depth: '---'   },
  { id: 3, type: 'biological', name: 'Organic Compound Layer',  quantity: 312,   unit: 't',   grade: 'MEDIUM',   depth: '12 m'  },
  { id: 4, type: 'rare',       name: 'Xenon Crystal Formation', quantity: 12.8,  unit: 't',   grade: 'EXTREME',  depth: '890 m' },
  { id: 5, type: 'mineral',    name: 'Silicon Carbide Deposit', quantity: 420,   unit: 'kt',  grade: 'MEDIUM',   depth: '220 m' },
  { id: 6, type: 'energy',     name: 'Uranium-235 Pocket',      quantity: 89,    unit: 't',   grade: 'HIGH',     depth: '560 m' },
  { id: 7, type: 'rare',       name: 'Neutrinium Trace',        quantity: 0.3,   unit: 't',   grade: 'EXTREME',  depth: '---'   },
  { id: 8, type: 'biological', name: 'Subsurface Biome',        quantity: 1200,  unit: 'm³',  grade: 'LOW',      depth: '5 m'   },
]

const SPAWN_XZ = [
  [ -38,  22], [  44, -20], [ -12,  52], [  30,  38],
  [ -56, -28], [  16, -60], [ -42,  -6], [  62,  12],
]

// ─── Build a single deposit marker ──────────────────────────────────────────

function buildMarker(deposit, x, z, terrainH, scene) {
  const col   = new THREE.Color(TYPE_COLORS[deposit.type])
  const group = new THREE.Group()

  // Vertical pillar
  const pillarMat = new THREE.MeshStandardMaterial({
    color: col, emissive: col, emissiveIntensity: 0.35,
    transparent: true, opacity: 0.55,
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
  sphere.userData.deposit = deposit
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
    deposit,
    pulseOffset: Math.random() * Math.PI * 2,
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function createDeposits(scene, terrain) {
  const markers      = []
  const clickTargets = []

  DEPOSIT_DATA.forEach((dep, i) => {
    const [x, z] = SPAWN_XZ[i]
    const h      = terrain.fbm(x, z)
    const m      = buildMarker(dep, x, z, h, scene)
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
    data:    DEPOSIT_DATA,
    markers: clickTargets,
    update,
  }
}
