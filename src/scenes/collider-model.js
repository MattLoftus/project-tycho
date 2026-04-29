import * as THREE from 'three'

/**
 * Particle Collision Simulation — CMS-style cylindrical detector.
 *
 * Coordinate system:
 *   Origin = collision point (interaction point)
 *   Z = beam axis, Y up, X lateral
 *   Detector viewed end-on (camera looks down Z)
 *
 * Detector layers (radii approximate CMS proportions, scaled):
 *   Beam pipe:           r = 0.3
 *   Inner tracker:       r = 0.5 – 3.0
 *   Electromagnetic cal: r = 3.5 – 5.5
 *   Hadronic cal:        r = 6.0 – 10.0
 *   Solenoid:            r = 10.0 – 10.5
 *   Muon chambers:       r = 11.0 – 15.0
 *
 * Physics:
 *   Magnetic field B = 3.8 T (CMS solenoid) — scaled for visual clarity
 *   Charged particle radius: r = p_T / (0.3 * q * B) in real units
 *   We use scaled momentum so tracks are visible
 */

// ─── Detector geometry constants ─────────────────────────────────────────────

const BEAM_R        = 0.3
const TRACKER_R_IN  = 0.5
const TRACKER_R_OUT = 3.0
const ECAL_R_IN     = 3.5
const ECAL_R_OUT    = 5.5
const HCAL_R_IN     = 6.0
const HCAL_R_OUT    = 10.0
const SOLENOID_R_IN = 10.0
const SOLENOID_R_OUT= 10.5
const MUON_R_IN     = 11.0
const MUON_R_OUT    = 15.0
const DET_HALF_Z    = 12  // half-length along beam axis

// ─── Particle types ──────────────────────────────────────────────────────────

export const PARTICLE_TYPES = {
  electron:  { name: 'Electron',   symbol: 'e⁻',  charge: -1, mass: 0.000511, color: 0x4488ff, stopsAt: ECAL_R_OUT },
  positron:  { name: 'Positron',   symbol: 'e⁺',  charge: +1, mass: 0.000511, color: 0x4488ff, stopsAt: ECAL_R_OUT },
  muon:      { name: 'Muon',       symbol: 'μ⁻',  charge: -1, mass: 0.1057,   color: 0x40dd40, stopsAt: MUON_R_OUT + 5 },
  antimuon:  { name: 'Antimuon',   symbol: 'μ⁺',  charge: +1, mass: 0.1057,   color: 0x40dd40, stopsAt: MUON_R_OUT + 5 },
  photon:    { name: 'Photon',     symbol: 'γ',    charge: 0,  mass: 0,        color: 0xffdd44, stopsAt: ECAL_R_OUT },
  pionPlus:  { name: 'Pion',       symbol: 'π⁺',  charge: +1, mass: 0.1396,   color: 0xff5544, stopsAt: HCAL_R_OUT },
  pionMinus: { name: 'Pion',       symbol: 'π⁻',  charge: -1, mass: 0.1396,   color: 0xff5544, stopsAt: HCAL_R_OUT },
  kaonPlus:  { name: 'Kaon',       symbol: 'K⁺',  charge: +1, mass: 0.4937,   color: 0xff8844, stopsAt: HCAL_R_OUT },
  kaonMinus: { name: 'Kaon',       symbol: 'K⁻',  charge: -1, mass: 0.4937,   color: 0xff8844, stopsAt: HCAL_R_OUT },
  proton:    { name: 'Proton',     symbol: 'p',    charge: +1, mass: 0.9383,   color: 0xdd4444, stopsAt: HCAL_R_OUT },
  neutron:   { name: 'Neutron',    symbol: 'n',    charge: 0,  mass: 0.9396,   color: 0xcc8888, stopsAt: HCAL_R_OUT },
}

// ─── Collision event generator ───────────────────────────────────────────────

/** Generate a physically motivated collision event */
export function generateEvent(energy) {
  // energy in GeV (typical LHC: 13000 GeV, we scale for visual)
  const E = energy || 50
  const particles = []

  // Decide event topology
  const topologies = ['dijet', 'dimuon', 'diphoton', 'multijet', 'zee']
  const topo = topologies[Math.floor(Math.random() * topologies.length)]

  switch (topo) {
    case 'dijet':
      // Two back-to-back jets of hadrons
      addJet(particles, E * 0.4, randomPhi(), 0.1)
      addJet(particles, E * 0.4, randomPhi() + Math.PI, -0.1)
      // Soft activity
      addSoftParticles(particles, 4, E * 0.05)
      break

    case 'dimuon':
      // Z → μ⁺μ⁻ (clean event with two isolated muons)
      const muPhi = randomPhi()
      addParticle(particles, 'muon', E * 0.35, muPhi, 0.05)
      addParticle(particles, 'antimuon', E * 0.35, muPhi + Math.PI + (Math.random() - 0.5) * 0.3, -0.05)
      // Some soft hadronic activity
      addSoftParticles(particles, 6, E * 0.03)
      break

    case 'diphoton':
      // H → γγ (two high-energy photons, back-to-back)
      const gPhi = randomPhi()
      addParticle(particles, 'photon', E * 0.45, gPhi, 0.02)
      addParticle(particles, 'photon', E * 0.45, gPhi + Math.PI + (Math.random() - 0.5) * 0.2, -0.02)
      addSoftParticles(particles, 5, E * 0.02)
      break

    case 'multijet':
      // QCD multijet event
      const nJets = 3 + Math.floor(Math.random() * 3)
      for (let i = 0; i < nJets; i++) {
        addJet(particles, E * (0.15 + Math.random() * 0.1), randomPhi(), (Math.random() - 0.5) * 0.3)
      }
      break

    case 'zee':
      // Z → e⁺e⁻
      const ePhi = randomPhi()
      addParticle(particles, 'electron', E * 0.35, ePhi, 0.03)
      addParticle(particles, 'positron', E * 0.35, ePhi + Math.PI + (Math.random() - 0.5) * 0.2, -0.03)
      addSoftParticles(particles, 5, E * 0.03)
      break
  }

  return { particles, topology: topo, energy: E }
}

function randomPhi() {
  return Math.random() * Math.PI * 2
}

function addParticle(list, typeName, pT, phi, eta) {
  const type = PARTICLE_TYPES[typeName]
  if (!type) return
  // Convert pT, phi, eta to px, py, pz
  const px = pT * Math.cos(phi)
  const py = pT * Math.sin(phi)
  const pz = pT * Math.sinh(eta || 0)
  list.push({
    type: typeName,
    ...type,
    px, py, pz, pT,
    phi, eta: eta || 0,
  })
}

function addJet(list, jetPT, phi, eta) {
  // A jet is a collimated spray of hadrons
  const nPart = 3 + Math.floor(Math.random() * 4)
  const hadronTypes = ['pionPlus', 'pionMinus', 'kaonPlus', 'kaonMinus', 'proton']
  for (let i = 0; i < nPart; i++) {
    const frac = 0.1 + Math.random() * 0.4  // momentum fraction
    const dPhi = (Math.random() - 0.5) * 0.3 // angular spread
    const dEta = (Math.random() - 0.5) * 0.3
    const hType = hadronTypes[Math.floor(Math.random() * hadronTypes.length)]
    addParticle(list, hType, jetPT * frac, phi + dPhi, eta + dEta)
  }
  // Sometimes a jet includes a photon from π⁰ decay
  if (Math.random() < 0.4) {
    addParticle(list, 'photon', jetPT * 0.15, phi + (Math.random() - 0.5) * 0.15, eta)
  }
}

function addSoftParticles(list, count, maxPT) {
  const types = ['pionPlus', 'pionMinus', 'kaonPlus']
  for (let i = 0; i < count; i++) {
    const t = types[Math.floor(Math.random() * types.length)]
    addParticle(list, t, Math.random() * maxPT + 0.5, randomPhi(), (Math.random() - 0.5) * 0.5)
  }
}

// ─── Particle track propagation (Lorentz force in B-field) ───────────────────

/**
 * Propagate a charged particle through a uniform B-field along Z.
 * Returns array of [x, y, z] positions forming the track.
 *
 * Physics: in a solenoid B = Bz ẑ,
 *   r_helix = pT / (0.3 * |q| * B)  [GeV, T, m]
 *   We scale B so tracks are visually clear in our detector.
 */
export function propagateTrack(particle, B, dt, maxR) {
  const { px, py, pz, charge, mass, stopsAt } = particle
  const points = []
  const stopR = Math.min(stopsAt || 20, maxR || 20)

  if (charge === 0) {
    // Neutral: straight line
    const p = Math.sqrt(px * px + py * py + pz * pz) || 1
    const vx = px / p, vy = py / p, vz = pz / p
    const speed = 0.8 // visual speed
    let x = 0, y = 0, z = 0
    for (let i = 0; i < 600; i++) {
      points.push(new THREE.Vector3(x, y, z))
      x += vx * speed * dt
      y += vy * speed * dt
      z += vz * speed * dt
      const r = Math.sqrt(x * x + y * y)
      if (r > stopR || Math.abs(z) > DET_HALF_Z) break
    }
    return points
  }

  // Charged: helical trajectory in B-field
  // Cyclotron radius: r = pT / (0.3 * |q| * B)
  const pT = Math.sqrt(px * px + py * py) || 0.1
  const rCyclotron = pT / (0.3 * Math.abs(charge) * B)
  const omega = (charge > 0 ? 1 : -1) * (0.3 * B) / (Math.sqrt(pT * pT + mass * mass) || 1)
  const p = Math.sqrt(px * px + py * py + pz * pz) || 1
  const vz = pz / p * 0.5  // z velocity (scaled)

  let vx = px / pT, vy = py / pT  // unit direction in transverse plane
  let x = 0, y = 0, z = 0

  for (let i = 0; i < 800; i++) {
    points.push(new THREE.Vector3(x, y, z))

    // Rotate velocity by omega * dt (2D rotation in B-field)
    const cosW = Math.cos(omega * dt)
    const sinW = Math.sin(omega * dt)
    const nvx = vx * cosW - vy * sinW
    const nvy = vx * sinW + vy * cosW
    vx = nvx
    vy = nvy

    // Step position
    const speed = rCyclotron * Math.abs(omega) // transverse speed
    x += vx * speed * dt
    y += vy * speed * dt
    z += vz * dt

    const r = Math.sqrt(x * x + y * y)
    if (r > stopR || Math.abs(z) > DET_HALF_Z) break
  }

  return points
}

// ─── Build detector geometry ─────────────────────────────────────────────────

function buildDetector() {
  const group = new THREE.Group()

  // Materials
  const beamPipeMat = new THREE.MeshStandardMaterial({
    color: 0x808080, roughness: 0.3, metalness: 0.5,
    emissive: 0x404040, emissiveIntensity: 0.3,
  })
  const trackerMat = new THREE.MeshStandardMaterial({
    color: 0x5068b0, roughness: 0.5, metalness: 0.15,
    transparent: true, opacity: 0.3, depthWrite: false,
    side: THREE.DoubleSide,
    emissive: 0x4058a0, emissiveIntensity: 0.5,
  })
  const ecalMat = new THREE.MeshStandardMaterial({
    color: 0x48b070, roughness: 0.4, metalness: 0.1,
    transparent: true, opacity: 0.28, depthWrite: false,
    side: THREE.DoubleSide,
    emissive: 0x38a058, emissiveIntensity: 0.4,
  })
  const hcalMat = new THREE.MeshStandardMaterial({
    color: 0xb07838, roughness: 0.6, metalness: 0.15,
    transparent: true, opacity: 0.25, depthWrite: false,
    side: THREE.DoubleSide,
    emissive: 0x906028, emissiveIntensity: 0.35,
  })
  const solenoidMat = new THREE.MeshStandardMaterial({
    color: 0x6090d0, roughness: 0.35, metalness: 0.35,
    transparent: true, opacity: 0.22, depthWrite: false,
    side: THREE.DoubleSide,
    emissive: 0x4878c0, emissiveIntensity: 0.45,
  })
  const muonMat = new THREE.MeshStandardMaterial({
    color: 0x586890, roughness: 0.6, metalness: 0.1,
    transparent: true, opacity: 0.18, depthWrite: false,
    side: THREE.DoubleSide,
    emissive: 0x385880, emissiveIntensity: 0.35,
  })

  // Beam pipe (solid, small)
  const beamGeo = new THREE.CylinderGeometry(BEAM_R, BEAM_R, DET_HALF_Z * 2, 16, 1, true)
  beamGeo.rotateX(Math.PI / 2) // align with Z axis
  const beamMesh = new THREE.Mesh(beamGeo, beamPipeMat)
  beamMesh.name = 'beamPipe'
  beamMesh.userData = { feature: 'Beam Pipe', featureKey: 'collision' }
  group.add(beamMesh)

  // Tracker layers (multiple thin cylinders for silicon strip effect)
  const trackerRadii = [0.8, 1.2, 1.8, 2.4, 3.0]
  const trackerMeshes = []
  for (const r of trackerRadii) {
    const geo = new THREE.CylinderGeometry(r, r, DET_HALF_Z * 1.8, 32, 1, true)
    geo.rotateX(Math.PI / 2)
    const mesh = new THREE.Mesh(geo, trackerMat)
    mesh.name = 'tracker'
    mesh.userData = { feature: 'Silicon Tracker', featureKey: 'tracker' }
    group.add(mesh)
    trackerMeshes.push(mesh)
  }

  // ECAL — segmented ring (to suggest crystal structure)
  const ecalGeo = new THREE.CylinderGeometry(ECAL_R_OUT, ECAL_R_IN, DET_HALF_Z * 1.6, 64, 1, true)
  ecalGeo.rotateX(Math.PI / 2)
  const ecalMesh = new THREE.Mesh(ecalGeo, ecalMat)
  ecalMesh.name = 'ecal'
  ecalMesh.userData = { feature: 'Electromagnetic Calorimeter', featureKey: 'ecal' }
  group.add(ecalMesh)

  // ECAL segment lines (radial divisions suggesting crystal towers)
  const ecalLineMat = new THREE.LineBasicMaterial({ color: 0x48b070, transparent: true, opacity: 0.35 })
  for (let i = 0; i < 64; i++) {
    const angle = (i / 64) * Math.PI * 2
    const pts = [
      new THREE.Vector3(Math.cos(angle) * ECAL_R_IN, Math.sin(angle) * ECAL_R_IN, 0),
      new THREE.Vector3(Math.cos(angle) * ECAL_R_OUT, Math.sin(angle) * ECAL_R_OUT, 0),
    ]
    const lineGeo = new THREE.BufferGeometry().setFromPoints(pts)
    group.add(new THREE.Line(lineGeo, ecalLineMat))
  }

  // HCAL
  const hcalGeo = new THREE.CylinderGeometry(HCAL_R_OUT, HCAL_R_IN, DET_HALF_Z * 1.4, 48, 1, true)
  hcalGeo.rotateX(Math.PI / 2)
  const hcalMesh = new THREE.Mesh(hcalGeo, hcalMat)
  hcalMesh.name = 'hcal'
  hcalMesh.userData = { feature: 'Hadronic Calorimeter', featureKey: 'hcal' }
  group.add(hcalMesh)

  // HCAL segment lines
  const hcalLineMat = new THREE.LineBasicMaterial({ color: 0xb07838, transparent: true, opacity: 0.3 })
  for (let i = 0; i < 36; i++) {
    const angle = (i / 36) * Math.PI * 2
    const pts = [
      new THREE.Vector3(Math.cos(angle) * HCAL_R_IN, Math.sin(angle) * HCAL_R_IN, 0),
      new THREE.Vector3(Math.cos(angle) * HCAL_R_OUT, Math.sin(angle) * HCAL_R_OUT, 0),
    ]
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), hcalLineMat))
  }

  // Solenoid
  const solGeo = new THREE.CylinderGeometry(SOLENOID_R_OUT, SOLENOID_R_IN, DET_HALF_Z * 1.6, 32, 1, true)
  solGeo.rotateX(Math.PI / 2)
  const solMesh = new THREE.Mesh(solGeo, solenoidMat)
  solMesh.name = 'solenoid'
  solMesh.userData = { feature: 'Superconducting Solenoid', featureKey: 'solenoid' }
  group.add(solMesh)

  // Muon chambers — 4 layers
  const muonRadii = [11.5, 12.5, 13.5, 14.5]
  const muonMeshes = []
  for (const r of muonRadii) {
    const geo = new THREE.CylinderGeometry(r, r, DET_HALF_Z * 2.2, 24, 1, true)
    geo.rotateX(Math.PI / 2)
    const mesh = new THREE.Mesh(geo, muonMat)
    mesh.name = 'muon'
    mesh.userData = { feature: 'Muon Chambers', featureKey: 'muon' }
    group.add(mesh)
    muonMeshes.push(mesh)
  }

  // Endcap discs (simplified)
  const endcapMat = new THREE.MeshStandardMaterial({
    color: 0x3a4858, roughness: 0.5, metalness: 0.1,
    transparent: true, opacity: 0.1, depthWrite: false,
    side: THREE.DoubleSide,
    emissive: 0x283848, emissiveIntensity: 0.2,
  })
  for (const zSign of [-1, 1]) {
    const discGeo = new THREE.RingGeometry(BEAM_R, MUON_R_OUT, 48)
    const disc = new THREE.Mesh(discGeo, endcapMat)
    disc.position.z = zSign * DET_HALF_Z
    group.add(disc)
  }

  return {
    group,
    clickMeshes: [beamMesh, ...trackerMeshes, ecalMesh, hcalMesh, solMesh, ...muonMeshes],
  }
}

// ─── Build detector layer labels ─────────────────────────────────────────────

const DETECTOR_LABELS = {
  tracker:  { pos: new THREE.Vector3(0, TRACKER_R_OUT + 0.3, 0), name: 'Silicon Tracker' },
  ecal:     { pos: new THREE.Vector3(0, (ECAL_R_IN + ECAL_R_OUT) / 2, 0), name: 'Electromagnetic Calorimeter' },
  hcal:     { pos: new THREE.Vector3(0, (HCAL_R_IN + HCAL_R_OUT) / 2, 0), name: 'Hadronic Calorimeter' },
  solenoid: { pos: new THREE.Vector3(0, SOLENOID_R_OUT + 0.3, 0), name: 'Solenoid Magnet (3.8T)' },
  muon:     { pos: new THREE.Vector3(0, (MUON_R_IN + MUON_R_OUT) / 2, 0), name: 'Muon Chambers' },
}

const FEATURES = {
  tracker: {
    name: 'Silicon Tracker',
    type: 'Detector Subsystem',
    dimensions: 'r = 0.5–3.0 m, 200 m² of silicon',
    description: 'Measures the trajectories of charged particles with micrometer precision using silicon pixel and strip sensors. The curvature of tracks in the magnetic field reveals the particle\'s momentum. Contains ~75 million readout channels.',
  },
  ecal: {
    name: 'Electromagnetic Calorimeter',
    type: 'Detector Subsystem',
    dimensions: 'r = 3.5–5.5 m, ~76,000 crystals',
    material: 'Lead tungstate (PbWO₄) scintillating crystals',
    description: 'Stops and measures the energy of electrons and photons. Each crystal is 23 cm long and produces scintillation light proportional to the deposited energy. The Higgs → γγ discovery relied critically on ECAL precision.',
  },
  hcal: {
    name: 'Hadronic Calorimeter',
    type: 'Detector Subsystem',
    dimensions: 'r = 6.0–10.0 m',
    material: 'Brass absorber + plastic scintillator tiles',
    description: 'Stops and measures the energy of hadrons (protons, pions, kaons, neutrons). Uses alternating layers of dense absorber and active scintillator. Essential for jet energy measurement and missing transverse energy calculation.',
  },
  solenoid: {
    name: 'Superconducting Solenoid',
    type: 'Magnet',
    dimensions: 'r = 10.0 m, length = 13 m',
    material: 'NbTi superconductor at 4.2 K',
    description: 'Produces a uniform 3.8 Tesla magnetic field (100,000× Earth\'s field) that bends charged particle tracks. The curvature directly reveals particle momentum: higher momentum = straighter track. Stores 2.6 GJ of energy.',
  },
  muon: {
    name: 'Muon Chambers',
    type: 'Detector Subsystem',
    dimensions: 'r = 11.0–15.0 m, 25,000 m² of gas detectors',
    description: 'Only muons (and neutrinos) penetrate this far. Gas-filled drift tubes and resistive plate chambers identify and measure muon tracks. Muons are key signatures of many important physics processes including Higgs and W/Z boson decays.',
  },
  collision: {
    name: 'Collision Point',
    type: 'Interaction Region',
    description: 'Proton bunches cross here 40 million times per second. Each bunch contains ~100 billion protons, but the beams are squeezed to ~16 μm width, making individual proton-proton collisions rare. About 20–50 collisions occur per bunch crossing at full luminosity.',
  },
}

// ─── Export ──────────────────────────────────────────────────────────────────

export function createColliderModel() {
  const { group: detector, clickMeshes } = buildDetector()

  return {
    detector,
    labelAnchors: DETECTOR_LABELS,
    features: FEATURES,
    clickTargets: clickMeshes,
  }
}
