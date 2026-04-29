import * as THREE from 'three'

/**
 * Saturn V Launch Vehicle — procedural model.
 *
 * Coordinate system:
 *   Origin = center of rocket base at ground level
 *   Y up (rocket vertical axis), X/Z lateral
 *   1 unit = 1 meter
 *
 * Total height: ~111m (363 ft)
 * Max diameter: 10.1m (33 ft)
 * 13 flights, 1967–1973
 */

// ─── Stage dimensions (meters) ─────────────────────────────────────────────

const DIAMETER     = 10.1
const RADIUS       = DIAMETER / 2    // 5.05

const SIC_H        = 42              // S-IC first stage
const SIC_SII_H    = 5.5             // interstage
const SII_H        = 24.8            // S-II second stage
const SII_SIVB_H   = 3               // interstage (truncated cone)
const SIVB_H       = 17.8            // S-IVB third stage
const SIVB_R       = 3.3             // S-IVB radius (6.6m dia)
const IU_H         = 1               // Instrument Unit
const SLA_H        = 8.5             // Spacecraft-LM Adapter
const SM_H         = 7.5             // Service Module
const SM_R         = 1.95            // Service Module radius (3.9m dia)
const CM_H         = 3.5             // Command Module
const CM_R_BOT     = 1.95            // CM base radius
const CM_R_TOP     = 0.5             // CM top radius
const LES_H        = 10              // Launch Escape System

// Cumulative Y positions (bottom of each section)
const Y_SIC        = 0
const Y_INTER1     = Y_SIC + SIC_H
const Y_SII        = Y_INTER1 + SIC_SII_H
const Y_INTER2     = Y_SII + SII_H
const Y_SIVB       = Y_INTER2 + SII_SIVB_H
const Y_IU         = Y_SIVB + SIVB_H
const Y_SLA        = Y_IU + IU_H
const Y_SM         = Y_SLA + SLA_H
const Y_CM         = Y_SM + SM_H
const Y_LES        = Y_CM + CM_H
const Y_TOP        = Y_LES + LES_H

// Engine dimensions
const F1_NOZZLE_R  = 1.85            // F-1 exit radius (~3.7m diameter)
const F1_NOZZLE_H  = 3.5
const J2_NOZZLE_R  = 1.0             // J-2 exit radius (~2m diameter)
const J2_NOZZLE_H  = 2.0

// ─── Materials ──────────────────────────────────────────────────────────────

function makeMaterials() {
  const white = new THREE.MeshStandardMaterial({
    color: 0xf0f0f0, roughness: 0.7, metalness: 0.05, side: THREE.DoubleSide,
    emissive: 0xf0f0f0, emissiveIntensity: 0.08,
  })
  const metallic = new THREE.MeshStandardMaterial({
    color: 0xc0c0c0, roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide,
    emissive: 0xc0c0c0, emissiveIntensity: 0.06,
  })
  const engineNozzle = new THREE.MeshStandardMaterial({
    color: 0x808080, roughness: 0.35, metalness: 0.4, side: THREE.DoubleSide,
    emissive: 0x606060, emissiveIntensity: 0.12,
  })
  // Darker lower nozzle (shingled heat shield section)
  const nozzleExtension = new THREE.MeshStandardMaterial({
    color: 0x5a5a5a, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide,
    emissive: 0x404040, emissiveIntensity: 0.08,
  })
  const darkBand = new THREE.MeshStandardMaterial({
    color: 0x1a1a1a, roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide,
    emissive: 0x101010, emissiveIntensity: 0.05,
  })
  // S-IC black roll pattern stripes
  const blackStripe = new THREE.MeshStandardMaterial({
    color: 0x151515, roughness: 0.65, metalness: 0.05, side: THREE.DoubleSide,
    emissive: 0x0a0a0a, emissiveIntensity: 0.05,
  })
  const loxTank = new THREE.MeshStandardMaterial({
    color: 0x80c0e0, roughness: 0.5, metalness: 0.05, side: THREE.DoubleSide,
    transparent: true, opacity: 0.4, depthWrite: false,
    emissive: 0x80c0e0, emissiveIntensity: 0.08,
  })
  const rp1Tank = new THREE.MeshStandardMaterial({
    color: 0xe0a040, roughness: 0.5, metalness: 0.05, side: THREE.DoubleSide,
    transparent: true, opacity: 0.4, depthWrite: false,
    emissive: 0xe0a040, emissiveIntensity: 0.08,
  })
  const lh2Tank = new THREE.MeshStandardMaterial({
    color: 0xa0d0f0, roughness: 0.5, metalness: 0.05, side: THREE.DoubleSide,
    transparent: true, opacity: 0.35, depthWrite: false,
    emissive: 0xa0d0f0, emissiveIntensity: 0.08,
  })
  const lmFoil = new THREE.MeshStandardMaterial({
    color: 0xd0a030, roughness: 0.3, metalness: 0.2, side: THREE.DoubleSide,
    emissive: 0xc09020, emissiveIntensity: 0.1,
  })
  const crewSeat = new THREE.MeshStandardMaterial({
    color: 0x606060, roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide,
    emissive: 0x404040, emissiveIntensity: 0.05,
  })
  const bafflesMat = new THREE.MeshStandardMaterial({
    color: 0xb0b0b0, roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide,
    transparent: true, opacity: 0.5, depthWrite: false,
    emissive: 0x909090, emissiveIntensity: 0.05,
  })
  const bulkheadMat = new THREE.MeshStandardMaterial({
    color: 0xd0d0d0, roughness: 0.5, metalness: 0.15, side: THREE.DoubleSide,
    emissive: 0xa0a0a0, emissiveIntensity: 0.06,
  })
  // Corrugated interstage sections
  const corrugated = new THREE.MeshStandardMaterial({
    color: 0xd8d8d8, roughness: 0.75, metalness: 0.1, side: THREE.DoubleSide,
    emissive: 0xc0c0c0, emissiveIntensity: 0.06,
  })

  return {
    white, metallic, engineNozzle, nozzleExtension, darkBand, blackStripe,
    loxTank, rp1Tank, lh2Tank, lmFoil, crewSeat, bafflesMat, bulkheadMat,
    corrugated,
  }
}

// ─── Helper: cylinder at position ───────────────────────────────────────────

function cyl(rTop, rBot, h, radSeg, mat, yBase, opts = {}) {
  const { thetaStart, thetaLength, openEnded } = opts
  const geo = new THREE.CylinderGeometry(
    rTop, rBot, h, radSeg || 32, 1, openEnded ?? false,
    thetaStart ?? 0, thetaLength ?? Math.PI * 2
  )
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.y = yBase + h / 2
  return mesh
}

// ─── Helper: half-cylinder for cutaway ──────────────────────────────────────

function halfCyl(rTop, rBot, h, mat, yBase) {
  return cyl(rTop, rBot, h, 32, mat, yBase, {
    thetaStart: 0, thetaLength: Math.PI, openEnded: false
  })
}

// ─── Build F-1 engine (single) with manifold ring ───────────────────────────

function buildF1Engine(mt, yBase) {
  const group = new THREE.Group()

  // Upper thrust chamber (smooth tubular section)
  const upperH = F1_NOZZLE_H * 0.55
  const upperTopR = 0.55
  const upperBotR = F1_NOZZLE_R * 0.65
  group.add(cyl(upperTopR, upperBotR, upperH, 24, mt.engineNozzle, yBase - upperH))

  // Turbine exhaust manifold — the distinctive ring/torus at the midpoint
  const manifoldY = yBase - upperH - 0.1
  const manifoldGeo = new THREE.TorusGeometry(upperBotR + 0.15, 0.18, 8, 24)
  const manifold = new THREE.Mesh(manifoldGeo, mt.metallic)
  manifold.position.y = manifoldY
  manifold.rotation.x = Math.PI / 2
  group.add(manifold)

  // Lower nozzle extension (shingled section — wider, darker)
  const lowerH = F1_NOZZLE_H * 0.45
  group.add(cyl(upperBotR, F1_NOZZLE_R, lowerH, 24, mt.nozzleExtension,
    yBase - upperH - lowerH))

  return group
}

// ─── Build F-1 engine cluster (5 engines) ───────────────────────────────────

function buildF1Engines(mt, yBase) {
  const group = new THREE.Group()
  // Center engine
  group.add(buildF1Engine(mt, yBase))
  // 4 outboard engines in a ring
  const outR = 3.2
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2
    const engine = buildF1Engine(mt, yBase)
    engine.position.x = Math.cos(angle) * outR
    engine.position.z = Math.sin(angle) * outR
    group.add(engine)
  }
  return group
}

// ─── Build J-2 engine cluster ───────────────────────────────────────────────

function buildJ2Cluster(count, mt, yBase) {
  const group = new THREE.Group()
  if (count === 1) {
    group.add(cyl(0.3, J2_NOZZLE_R, J2_NOZZLE_H, 20, mt.engineNozzle, yBase - J2_NOZZLE_H))
  } else {
    // Center + 4 outboard
    group.add(cyl(0.3, J2_NOZZLE_R, J2_NOZZLE_H, 20, mt.engineNozzle, yBase - J2_NOZZLE_H))
    const outR = 2.5
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2
      const engine = cyl(0.3, J2_NOZZLE_R, J2_NOZZLE_H, 20, mt.engineNozzle, yBase - J2_NOZZLE_H)
      engine.position.x = Math.cos(angle) * outR
      engine.position.z = Math.sin(angle) * outR
      group.add(engine)
    }
  }
  return group
}

// ─── Build swept fins + engine fairings at S-IC base ────────────────────────

function buildFinsAndFairings(mt, yBase) {
  const group = new THREE.Group()

  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4

    // Engine fairing — conical cowl around each outboard F-1
    const fairingH = 8
    const fairingGeo = new THREE.CylinderGeometry(1.8, 2.4, fairingH, 16, 1, true)
    const fairing = new THREE.Mesh(fairingGeo, mt.metallic)
    fairing.position.set(
      Math.cos(angle) * 3.2,
      yBase + fairingH / 2 - 1,
      Math.sin(angle) * 3.2
    )
    group.add(fairing)

    // Swept trapezoidal fin — using custom shape
    const finShape = new THREE.Shape()
    // Root chord at body (6m), tip chord (3m), span (3m outward), swept back
    finShape.moveTo(0, 0)           // root leading edge
    finShape.lineTo(0, 6)           // root trailing edge (up)
    finShape.lineTo(3, 4.5)         // tip trailing edge
    finShape.lineTo(3, 2)           // tip leading edge
    finShape.closePath()

    const extrudeSettings = { depth: 0.25, bevelEnabled: false }
    const finGeo = new THREE.ExtrudeGeometry(finShape, extrudeSettings)
    const fin = new THREE.Mesh(finGeo, mt.metallic)

    // Position: outward from fairing, fin flat plane perpendicular to radial direction
    fin.position.set(
      Math.cos(angle) * (RADIUS + 0.5),
      yBase - 1,
      Math.sin(angle) * (RADIUS + 0.5)
    )
    // Rotate so the fin extends radially outward and vertically
    fin.rotation.y = -angle + Math.PI / 2
    fin.rotation.x = -Math.PI / 2
    group.add(fin)
  }
  return group
}

// ─── Build S-IC roll pattern (4 vertical black stripes) ─────────────────────

function buildRollPattern(mt, yBase) {
  const group = new THREE.Group()
  // 4 vertical black stripes on S-IC, 90° apart
  // Each stripe is ~0.8m wide, extending from base skirt up partway
  const stripeH = 30  // stripes extend ~30m up the S-IC (flight config, not full 500F)
  const stripeW = 0.8
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2
    const geo = new THREE.PlaneGeometry(stripeW, stripeH)
    const stripe = new THREE.Mesh(geo, mt.blackStripe)
    stripe.position.set(
      Math.cos(angle) * (RADIUS + 0.03),
      yBase + stripeH / 2 + 1,
      Math.sin(angle) * (RADIUS + 0.03)
    )
    stripe.rotation.y = -angle + Math.PI / 2
    group.add(stripe)
  }

  // Black band at base of S-IC (aft skirt)
  group.add(cyl(RADIUS + 0.04, RADIUS + 0.04, 2.5, 32, mt.blackStripe, yBase))

  return group
}

// ─── Build ullage motors ────────────────────────────────────────────────────

function buildUllageMotors(mt, yBase, count, radius) {
  const group = new THREE.Group()
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2
    // Small cylindrical motor
    const motorGeo = new THREE.CylinderGeometry(0.15, 0.12, 1.2, 8)
    const motor = new THREE.Mesh(motorGeo, mt.engineNozzle)
    motor.position.set(
      Math.cos(angle) * radius,
      yBase + 0.6,
      Math.sin(angle) * radius
    )
    group.add(motor)
    // Fairing around motor
    const fairGeo = new THREE.CylinderGeometry(0.25, 0.25, 1.5, 8, 1, true)
    const fair = new THREE.Mesh(fairGeo, mt.metallic)
    fair.position.set(
      Math.cos(angle) * radius,
      yBase + 0.75,
      Math.sin(angle) * radius
    )
    group.add(fair)
  }
  return group
}

// ─── Build assembled exterior ───────────────────────────────────────────────

function buildAssembled(mt) {
  const group = new THREE.Group()

  // ── F-1 Engines with manifold detail ──
  group.add(buildF1Engines(mt, Y_SIC))

  // ── S-IC First Stage ──
  const sic = cyl(RADIUS, RADIUS, SIC_H, 32, mt.white, Y_SIC)
  group.add(sic)

  // S-IC roll pattern (4 black vertical stripes + base band)
  group.add(buildRollPattern(mt, Y_SIC))

  // Fins + engine fairings at base
  group.add(buildFinsAndFairings(mt, Y_SIC))

  // ── S-IC / S-II Interstage (corrugated) ──
  group.add(cyl(RADIUS + 0.15, RADIUS + 0.15, SIC_SII_H, 32, mt.corrugated, Y_INTER1))

  // S-II ullage motors on interstage (4 motors, 90° apart)
  group.add(buildUllageMotors(mt, Y_INTER1, 4, RADIUS + 0.4))

  // ── S-II Second Stage ──
  group.add(cyl(RADIUS, RADIUS, SII_H, 32, mt.white, Y_SII))

  // J-2 engines at bottom of S-II
  group.add(buildJ2Cluster(5, mt, Y_SII))

  // Thin dark band at S-II aft skirt
  group.add(cyl(RADIUS + 0.03, RADIUS + 0.03, 0.8, 32, mt.darkBand, Y_SII))

  // ── S-II / S-IVB Interstage (truncated cone — wide at bottom, narrow at top) ──
  group.add(cyl(SIVB_R, RADIUS, SII_SIVB_H, 32, mt.corrugated, Y_INTER2))

  // S-IVB ullage motors (2 motors on interstage)
  group.add(buildUllageMotors(mt, Y_INTER2, 2, RADIUS * 0.7))

  // ── S-IVB Third Stage ──
  group.add(cyl(SIVB_R, SIVB_R, SIVB_H, 32, mt.white, Y_SIVB))
  // Single J-2 engine
  group.add(buildJ2Cluster(1, mt, Y_SIVB))

  // ── Instrument Unit (dark ring) ──
  group.add(cyl(SIVB_R, SIVB_R, IU_H, 32, mt.darkBand, Y_IU))

  // ── Spacecraft-Lunar Module Adapter (SLA) — truncated cone with panel lines ──
  group.add(cyl(SM_R, SIVB_R, SLA_H, 32, mt.white, Y_SLA))
  // 4 panel separation lines
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 8
    const lineH = SLA_H
    const lineGeo = new THREE.PlaneGeometry(0.04, lineH)
    const rAtMid = (SM_R + SIVB_R) / 2
    const line = new THREE.Mesh(lineGeo, mt.darkBand)
    line.position.set(
      Math.cos(angle) * (rAtMid + 0.02),
      Y_SLA + lineH / 2,
      Math.sin(angle) * (rAtMid + 0.02)
    )
    line.rotation.y = -angle + Math.PI / 2
    group.add(line)
  }

  // ── Service Module ──
  group.add(cyl(SM_R, SM_R, SM_H, 32, mt.metallic, Y_SM))
  // SM has a high-gain antenna dish (small disc on one side)
  const dishGeo = new THREE.CircleGeometry(0.5, 16)
  const dish = new THREE.Mesh(dishGeo, mt.white)
  dish.position.set(SM_R + 0.05, Y_SM + SM_H * 0.7, 0)
  dish.rotation.y = Math.PI / 2
  group.add(dish)

  // ── Command Module — cone ──
  group.add(cyl(CM_R_TOP, CM_R_BOT, CM_H, 32, mt.white, Y_CM))

  // ── Launch Escape System ──
  buildLES(group, mt)

  return group
}

// ─── Build LES (Launch Escape System) ───────────────────────────────────────

function buildLES(group, mt) {
  // Main tower — 3 thin struts forming an open lattice (not a single solid cylinder)
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2
    const strutGeo = new THREE.CylinderGeometry(0.04, 0.04, LES_H, 6)
    const strut = new THREE.Mesh(strutGeo, mt.metallic)
    strut.position.set(
      Math.cos(angle) * 0.2,
      Y_LES + LES_H / 2,
      Math.sin(angle) * 0.2
    )
    group.add(strut)
  }

  // Cross-bracing rings on the tower at intervals
  for (let j = 0; j < 4; j++) {
    const ringY = Y_LES + 2 + j * 2.2
    const ringGeo = new THREE.TorusGeometry(0.2, 0.025, 6, 12)
    const ring = new THREE.Mesh(ringGeo, mt.metallic)
    ring.position.y = ringY
    ring.rotation.x = Math.PI / 2
    group.add(ring)
  }

  // Rocket motor at top (larger, more visible)
  group.add(cyl(0.25, 0.18, 2.0, 12, mt.engineNozzle, Y_LES + LES_H - 2.0))

  // Nose cone (pointed)
  group.add(cyl(0.01, 0.25, 1.0, 12, mt.engineNozzle, Y_TOP - 0.5))

  // BPC (Boost Protective Cover) — conical shield around CM
  group.add(cyl(CM_R_TOP + 0.08, CM_R_BOT + 0.08, CM_H + 0.5, 32, mt.white, Y_CM - 0.25))
}

// ─── Build cutaway cross-section ────────────────────────────────────────────

function buildCutaway(mt) {
  const group = new THREE.Group()

  // Outer shells — half cylinders
  group.add(halfCyl(RADIUS, RADIUS, SIC_H, mt.white, Y_SIC))
  group.add(halfCyl(RADIUS + 0.15, RADIUS + 0.15, SIC_SII_H, mt.corrugated, Y_INTER1))
  group.add(halfCyl(RADIUS, RADIUS, SII_H, mt.white, Y_SII))
  group.add(halfCyl(SIVB_R, RADIUS, SII_SIVB_H, mt.corrugated, Y_INTER2))
  group.add(halfCyl(SIVB_R, SIVB_R, SIVB_H, mt.white, Y_SIVB))
  group.add(halfCyl(SIVB_R, SIVB_R, IU_H, mt.darkBand, Y_IU))
  group.add(halfCyl(SM_R, SIVB_R, SLA_H, mt.white, Y_SLA))
  group.add(halfCyl(SM_R, SM_R, SM_H, mt.metallic, Y_SM))
  group.add(halfCyl(CM_R_TOP, CM_R_BOT, CM_H, mt.white, Y_CM))

  // ─── S-IC Internals ───
  const sicLoxH = 19
  const sicLoxY = Y_SIC + SIC_H - sicLoxH - 2
  group.add(halfCyl(RADIUS - 0.3, RADIUS - 0.3, sicLoxH, mt.loxTank, sicLoxY))

  const sicRp1H = 13
  const sicRp1Y = Y_SIC + 3
  group.add(halfCyl(RADIUS - 0.3, RADIUS - 0.3, sicRp1H, mt.rp1Tank, sicRp1Y))

  // Center tunnel
  group.add(halfCyl(0.35, 0.35, SIC_H - 2, mt.metallic, Y_SIC + 1))

  // Anti-slosh baffles in LOX tank
  for (let i = 0; i < 3; i++) {
    const baffleY = sicLoxY + 4 + i * 5
    const baffleGeo = new THREE.CylinderGeometry(RADIUS - 0.5, RADIUS - 0.5, 0.1, 32, 1, false, 0, Math.PI)
    const baffle = new THREE.Mesh(baffleGeo, mt.bafflesMat)
    baffle.position.y = baffleY
    group.add(baffle)
  }

  // Anti-slosh baffles in RP-1 tank
  for (let i = 0; i < 2; i++) {
    const baffleY = sicRp1Y + 3 + i * 4
    const baffleGeo = new THREE.CylinderGeometry(RADIUS - 0.5, RADIUS - 0.5, 0.1, 32, 1, false, 0, Math.PI)
    const baffle = new THREE.Mesh(baffleGeo, mt.bafflesMat)
    baffle.position.y = baffleY
    group.add(baffle)
  }

  // Intertank structure (between LOX and RP-1)
  const intertankY = sicRp1Y + sicRp1H
  const intertankH = sicLoxY - intertankY
  group.add(halfCyl(RADIUS - 0.1, RADIUS - 0.1, intertankH, mt.corrugated, intertankY))

  // ─── S-II Internals ───
  const siiLh2H = 16
  const siiLh2Y = Y_SII + SII_H - siiLh2H - 1
  group.add(halfCyl(RADIUS - 0.3, RADIUS - 0.3, siiLh2H, mt.lh2Tank, siiLh2Y))

  const siiLoxH = 6
  const siiLoxY = Y_SII + 1
  group.add(halfCyl(RADIUS - 0.3, RADIUS - 0.3, siiLoxH, mt.loxTank, siiLoxY))

  // Common bulkhead
  const bulkheadGeo = new THREE.SphereGeometry(RADIUS - 0.3, 32, 16, 0, Math.PI, 0, Math.PI / 6)
  const bulkhead = new THREE.Mesh(bulkheadGeo, mt.bulkheadMat)
  bulkhead.position.y = siiLoxY + siiLoxH
  bulkhead.rotation.x = Math.PI
  group.add(bulkhead)

  // ─── S-IVB Internals ───
  const sivbLh2H = 11
  const sivbLh2Y = Y_SIVB + SIVB_H - sivbLh2H - 1
  group.add(halfCyl(SIVB_R - 0.2, SIVB_R - 0.2, sivbLh2H, mt.lh2Tank, sivbLh2Y))

  const sivbLoxH = 4
  const sivbLoxY = Y_SIVB + 1
  group.add(halfCyl(SIVB_R - 0.2, SIVB_R - 0.2, sivbLoxH, mt.loxTank, sivbLoxY))

  // ─── SLA Interior: Lunar Module ───
  const lmY = Y_SLA + 1
  const descentGeo = new THREE.BoxGeometry(2.5, 2.5, 2.5)
  const descent = new THREE.Mesh(descentGeo, mt.lmFoil)
  descent.position.set(0, lmY + 1.25, 0)
  group.add(descent)

  const ascentGeo = new THREE.BoxGeometry(2.0, 2.0, 2.0)
  const ascent = new THREE.Mesh(ascentGeo, mt.lmFoil)
  ascent.position.set(0, lmY + 3.75, 0)
  group.add(ascent)

  // LM legs
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4
    const legGeo = new THREE.CylinderGeometry(0.04, 0.04, 2.5, 6)
    const leg = new THREE.Mesh(legGeo, mt.metallic)
    leg.position.set(Math.cos(angle) * 2.0, lmY + 0.5, Math.sin(angle) * 2.0)
    leg.rotation.z = Math.cos(angle) * 0.4
    leg.rotation.x = Math.sin(angle) * 0.4
    group.add(leg)
  }

  // ─── Command Module Interior ───
  const seatY = Y_CM + 1.5
  for (let i = 0; i < 3; i++) {
    const angle = ((i - 1) / 3) * Math.PI * 0.6
    const seatGeo = new THREE.BoxGeometry(0.5, 0.3, 0.8)
    const seat = new THREE.Mesh(seatGeo, mt.crewSeat)
    seat.position.set(Math.sin(angle) * 0.6, seatY, Math.cos(angle) * 0.3)
    group.add(seat)
  }

  group.visible = false
  return group
}

// ─── Features (NASA specs) ──────────────────────────────────────────────────

const FEATURES = {
  f1Engines: {
    name: 'F-1 Engines',
    type: 'Propulsion',
    thrust: '7,891 kN (1,774,000 lbf) each — 5 engines total',
    propellant: 'RP-1 (kerosene) / LOX',
    burnTime: '~150 seconds',
    description: 'The most powerful single-chamber liquid-fueled rocket engine ever flown. Five F-1 engines produced 34,020 kN (7,648,000 lbf) total thrust at liftoff — burning 15 tonnes of propellant per second. Each nozzle features a distinctive turbine exhaust manifold ring at the midpoint, where hot turbopump exhaust gases were redirected to film-cool the lower nozzle extension.',
  },
  sicStage: {
    name: 'S-IC First Stage',
    type: 'Stage',
    dimensions: '42m tall × 10.1m diameter',
    propellantMass: '2,077,000 kg (RP-1 + LOX)',
    burnTime: '~150 seconds',
    manufacturer: 'Boeing, Michoud Assembly Facility',
    description: 'The largest stage, generating the massive thrust needed to lift the fully fueled 2,970-tonne vehicle off the pad. Separated at ~67 km altitude. The four black vertical stripes were roll pattern markings for ground camera tracking. The corrugated intertank section and forward skirt used stiffened aluminum alloy panels.',
  },
  siiStage: {
    name: 'S-II Second Stage',
    type: 'Stage',
    dimensions: '24.8m tall × 10.1m diameter',
    engines: '5× J-2 engines, 1,033 kN each',
    propellant: 'LH2 / LOX',
    propellantMass: '443,000 kg',
    burnTime: '~360 seconds',
    manufacturer: 'North American Aviation',
    description: 'Used a revolutionary common bulkhead design to save weight, with a single insulated dome separating the LOX and LH2 tanks. The five J-2 engines could be individually gimbaled for steering.',
  },
  sivbStage: {
    name: 'S-IVB Third Stage',
    type: 'Stage',
    dimensions: '17.8m tall × 6.6m diameter',
    engines: '1× J-2 engine, 1,033 kN',
    propellant: 'LH2 / LOX',
    propellantMass: '109,000 kg',
    burnTime: '~165 + 335 seconds (two burns)',
    manufacturer: 'Douglas Aircraft Company',
    description: 'Unique among Saturn V stages for its restart capability. First burn placed the spacecraft in Earth parking orbit; second burn (Trans-Lunar Injection) sent Apollo toward the Moon at ~39,000 km/h.',
  },
  instrumentUnit: {
    name: 'Instrument Unit',
    type: 'Guidance',
    dimensions: '1m tall × 6.6m diameter ring',
    manufacturer: 'IBM',
    description: 'The "brain" of the Saturn V — contained the launch vehicle digital computer (LVDC), ST-124-M3 inertial platform, control electronics, and telemetry systems. Guided the rocket through all powered flight phases.',
  },
  sla: {
    name: 'Spacecraft-Lunar Module Adapter',
    type: 'Adapter',
    dimensions: '8.5m tall, 6.6m → 3.9m diameter',
    description: 'Truncated cone housing the Lunar Module during launch. Four panels separated pyrotechnically after Trans-Lunar Injection, allowing the Command/Service Module to dock with and extract the LM.',
  },
  lunarModule: {
    name: 'Lunar Module',
    type: 'Spacecraft',
    crewCapacity: '2 astronauts',
    stages: 'Descent stage (landing) + Ascent stage (return to orbit)',
    description: 'Built by Grumman, the LM was the only crewed vehicle designed exclusively for the vacuum of space. Its angular shape — unnecessary in the absence of aerodynamic forces — made it one of the most distinctive spacecraft ever built.',
  },
  serviceModule: {
    name: 'Service Module',
    type: 'Spacecraft',
    dimensions: '7.5m tall × 3.9m diameter',
    engine: 'AJ10-137 (Service Propulsion System), 91 kN',
    description: 'Provided propulsion, electrical power (fuel cells), oxygen, and water for the mission. The SPS engine was critical for lunar orbit insertion and trans-Earth injection — its failure would have been fatal.',
  },
  commandModule: {
    name: 'Command Module',
    type: 'Spacecraft',
    dimensions: '3.5m tall × 3.9m diameter',
    crewCapacity: '3 astronauts',
    heatShield: 'AVCOAT ablative, withstood ~2,760°C re-entry',
    description: 'The only part of the entire Saturn V stack that returned to Earth. Designed and built by North American Aviation, it served as crew quarters, mission control center, and re-entry vehicle.',
  },
  les: {
    name: 'Launch Escape System',
    type: 'Safety',
    dimensions: '~10m tall tower',
    thrust: '667 kN (solid rocket)',
    description: 'Could pull the Command Module clear of a malfunctioning launch vehicle in milliseconds. Jettisoned after clearing the atmosphere (~3 minutes into flight). Never used in an emergency on Saturn V, but proved its worth on the Soyuz T-10-1 (similar system).',
  },
  overall: {
    name: 'Saturn V',
    type: 'Launch Vehicle',
    dimensions: '111m tall × 10.1m diameter',
    totalMass: '2,970,000 kg fully fueled',
    payloadLEO: '140,000 kg to Low Earth Orbit',
    payloadTLI: '48,600 kg to Trans-Lunar Injection',
    flights: '13 flights (1967–1973), all successful',
    description: 'Developed by NASA Marshall Space Flight Center under Wernher von Braun, the Saturn V remains the tallest, heaviest, and most powerful rocket ever brought to operational status. It launched all crewed Apollo lunar missions (Apollo 8, 10–17) and the Skylab space station. Its perfect flight record is unmatched in heavy-lift rocketry.',
  },
}

// ─── Label anchors ──────────────────────────────────────────────────────────

const labelAnchors = {
  f1Engines:       { pos: new THREE.Vector3(7, Y_SIC - 1, 0), name: 'F-1 Engines (×5)' },
  sicStage:        { pos: new THREE.Vector3(7, Y_SIC + SIC_H / 2, 0), name: 'S-IC First Stage' },
  siiStage:        { pos: new THREE.Vector3(7, Y_SII + SII_H / 2, 0), name: 'S-II Second Stage' },
  sivbStage:       { pos: new THREE.Vector3(5, Y_SIVB + SIVB_H / 2, 0), name: 'S-IVB Third Stage' },
  instrumentUnit:  { pos: new THREE.Vector3(5, Y_IU + IU_H / 2, 0), name: 'Instrument Unit' },
  sla:             { pos: new THREE.Vector3(4, Y_SLA + SLA_H / 2, 0), name: 'SLA (Lunar Module)' },
  serviceModule:   { pos: new THREE.Vector3(4, Y_SM + SM_H / 2, 0), name: 'Service Module' },
  commandModule:   { pos: new THREE.Vector3(3, Y_CM + CM_H / 2, 0), name: 'Command Module' },
  les:             { pos: new THREE.Vector3(2, Y_LES + LES_H / 2, 0), name: 'Launch Escape System' },
}

// ─── Export ─────────────────────────────────────────────────────────────────

export function createSaturnVModel() {
  const mt = makeMaterials()
  const assembled = buildAssembled(mt)
  const cutaway = buildCutaway(mt)
  const clickTargets = []

  assembled.traverse(child => {
    if (child.isMesh) clickTargets.push(child)
  })

  return { assembled, cutaway, clickTargets, labelAnchors, features: FEATURES }
}
