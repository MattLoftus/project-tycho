import * as THREE from 'three'

/**
 * Procedural deep-sea ROV (Remotely Operated Vehicle).
 * Modeled after work-class ROVs like Jason II / Hercules / Victor 6000.
 *
 * Coordinate system: +Y up, -Z forward (lights face -Z), +Z rear (tether).
 * Local units ≈ scene units. ROV is ~1.8 units long, ~1.1 wide, ~1.2 tall.
 *
 * Returns { group, update(elapsedTime), dispose() }
 */

// ─── Helper ──────────────────────────────────────────────────────────────────

function m(geo, mat, x, y, z) {
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.set(x, y, z)
  return mesh
}

// ─── Materials ───────────────────────────────────────────────────────────────

function makeMats() {
  const frame = new THREE.MeshStandardMaterial({
    color: 0x1a1a1a, roughness: 0.85, metalness: 0.35
  })
  const foam = new THREE.MeshStandardMaterial({
    color: 0xc86414, roughness: 0.90, metalness: 0.0
  })
  const foamDark = new THREE.MeshStandardMaterial({
    color: 0xb45810, roughness: 0.92, metalness: 0.0
  })
  const strap = new THREE.MeshStandardMaterial({
    color: 0x1a1a1a, roughness: 0.95, metalness: 0.0
  })
  const housing = new THREE.MeshStandardMaterial({
    color: 0x222222, roughness: 0.75, metalness: 0.40
  })
  const housingCap = new THREE.MeshStandardMaterial({
    color: 0x222222, roughness: 0.80, metalness: 0.20
  })
  const thruster = new THREE.MeshStandardMaterial({
    color: 0x1c1c1c, roughness: 0.70, metalness: 0.50, side: THREE.DoubleSide
  })
  const thrusterRim = new THREE.MeshStandardMaterial({
    color: 0x2a2a2a, roughness: 0.60, metalness: 0.60
  })
  const lampHousing = new THREE.MeshStandardMaterial({
    color: 0x1e1e18, roughness: 0.55, metalness: 0.55
  })
  const lampLens = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.0, metalness: 0.0,
    emissive: 0xf0f0e0, emissiveIntensity: 2.5
  })
  const camera = new THREE.MeshStandardMaterial({
    color: 0x0a0a0a, roughness: 0.40, metalness: 0.30
  })
  const dome = new THREE.MeshStandardMaterial({
    color: 0x101820, roughness: 0.15, metalness: 0.05,
    transparent: true, opacity: 0.55
  })
  const arm = new THREE.MeshStandardMaterial({
    color: 0x242422, roughness: 0.75, metalness: 0.45
  })
  const basket = new THREE.MeshStandardMaterial({
    color: 0x181818, roughness: 0.85, metalness: 0.30
  })
  const tether = new THREE.MeshStandardMaterial({
    color: 0xd4a020, roughness: 0.90, metalness: 0.0,
    transparent: true, opacity: 0.70
  })
  const connector = new THREE.MeshStandardMaterial({
    color: 0x141414, roughness: 0.70, metalness: 0.60
  })

  return {
    frame, foam, foamDark, strap, housing, housingCap, thruster, thrusterRim,
    lampHousing, lampLens, camera, dome, arm, basket, tether, connector
  }
}

// ─── Frame ───────────────────────────────────────────────────────────────────

function buildFrame(group, mt) {
  // 4 longitudinal rails (Z-axis, corners of frame)
  const railGeo = new THREE.CylinderGeometry(0.018, 0.018, 1.8, 6)
  railGeo.rotateX(Math.PI / 2) // align along Z
  const corners = [[-0.55, 0.38], [0.55, 0.38], [-0.55, -0.38], [0.55, -0.38]]
  corners.forEach(([x, y]) => group.add(m(railGeo, mt.frame, x, y, -0.05)))

  // Cross members at 4 stations along Z
  const stations = [-0.70, -0.25, 0.25, 0.65]
  const topBotGeo = new THREE.CylinderGeometry(0.014, 0.014, 1.1, 6)
  topBotGeo.rotateZ(Math.PI / 2) // horizontal across X
  const sideGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.76, 6)
  // side already aligned to Y

  stations.forEach(z => {
    // Top & bottom cross members
    group.add(m(topBotGeo, mt.frame, 0, 0.38, z))
    group.add(m(topBotGeo, mt.frame, 0, -0.38, z))
    // Left & right verticals
    group.add(m(sideGeo, mt.frame, -0.55, 0, z))
    group.add(m(sideGeo, mt.frame, 0.55, 0, z))
  })

  // Diagonal braces on left & right side panels
  const diagGeo = new THREE.CylinderGeometry(0.010, 0.010, 0.95, 5)
  for (const sx of [-1, 1]) {
    const d1 = new THREE.Mesh(diagGeo, mt.frame)
    d1.position.set(sx * 0.55, 0, -0.22)
    d1.rotation.x = 0.68
    group.add(d1)
    const d2 = new THREE.Mesh(diagGeo, mt.frame)
    d2.position.set(sx * 0.55, 0, 0.45)
    d2.rotation.x = -0.68
    group.add(d2)
  }
}

// ─── Flotation ───────────────────────────────────────────────────────────────

function buildFoam(group, mt) {
  // Main foam block
  group.add(m(new THREE.BoxGeometry(1.05, 0.28, 1.65), mt.foam, 0, 0.52, -0.05))

  // Chamfer caps (front & rear)
  group.add(m(new THREE.BoxGeometry(0.95, 0.20, 0.04), mt.foamDark, 0, 0.52, -0.90))
  group.add(m(new THREE.BoxGeometry(0.95, 0.20, 0.04), mt.foamDark, 0, 0.52, 0.78))

  // Fastening straps
  const strapGeo = new THREE.BoxGeometry(1.08, 0.02, 0.06)
  group.add(m(strapGeo, mt.strap, 0, 0.67, -0.55))
  group.add(m(strapGeo, mt.strap, 0, 0.67, 0))
  group.add(m(strapGeo, mt.strap, 0, 0.67, 0.55))
}

// ─── Pressure housing ────────────────────────────────────────────────────────

function buildHousing(group, mt) {
  // Main cylinder (along Z)
  const cyl = new THREE.CylinderGeometry(0.10, 0.10, 1.20, 16)
  cyl.rotateX(Math.PI / 2)
  group.add(m(cyl, mt.housing, 0, 0, -0.05))

  // Hemispherical end caps
  const capGeo = new THREE.SphereGeometry(0.10, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)
  const fwd = new THREE.Mesh(capGeo, mt.housingCap)
  fwd.position.set(0, 0, -0.65)
  fwd.rotation.x = Math.PI / 2
  group.add(fwd)
  const aft = new THREE.Mesh(capGeo, mt.housingCap)
  aft.position.set(0, 0, 0.55)
  aft.rotation.x = -Math.PI / 2
  group.add(aft)

  // Rear connector plate
  group.add(m(new THREE.BoxGeometry(0.18, 0.08, 0.03), mt.connector, 0, 0, 0.58))
}

// ─── Thrusters ───────────────────────────────────────────────────────────────

function buildThruster(group, mt, x, y, z, axis) {
  const tg = new THREE.Group()

  // Shroud (open cylinder)
  const shroud = new THREE.CylinderGeometry(0.115, 0.115, 0.12, 16, 1, true)
  tg.add(new THREE.Mesh(shroud, mt.thruster))

  // Rim rings
  const rimGeo = new THREE.TorusGeometry(0.115, 0.010, 8, 16)
  const rimF = new THREE.Mesh(rimGeo, mt.thrusterRim)
  rimF.position.y = 0.06
  tg.add(rimF)
  const rimR = new THREE.Mesh(rimGeo, mt.thrusterRim)
  rimR.position.y = -0.06
  tg.add(rimR)

  // Cross-braces
  const braceGeo = new THREE.BoxGeometry(0.20, 0.008, 0.008)
  tg.add(new THREE.Mesh(braceGeo, mt.frame))
  const brace2 = new THREE.Mesh(braceGeo, mt.frame)
  brace2.rotation.y = Math.PI / 2
  tg.add(brace2)

  // Prop hub
  tg.add(m(new THREE.CylinderGeometry(0.022, 0.022, 0.018, 6), mt.frame, 0, 0, 0))

  // Prop blades
  const bladeGeo = new THREE.BoxGeometry(0.065, 0.006, 0.022)
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(bladeGeo, mt.frame)
    blade.rotation.y = (i * Math.PI * 2) / 3
    tg.add(blade)
  }

  tg.position.set(x, y, z)
  if (axis === 'x') tg.rotation.z = Math.PI / 2
  // default axis = y (vertical), no rotation needed
  group.add(tg)
}

function buildAllThrusters(group, mt) {
  // 4 horizontal thrusters at corners (axis = x)
  buildThruster(group, mt, 0.68, 0.0, -0.55, 'x')
  buildThruster(group, mt, -0.68, 0.0, -0.55, 'x')
  buildThruster(group, mt, 0.68, 0.0, 0.45, 'x')
  buildThruster(group, mt, -0.68, 0.0, 0.45, 'x')

  // 2 vertical thrusters on top
  buildThruster(group, mt, -0.28, 0.52, 0.0, 'y')
  buildThruster(group, mt, 0.28, 0.52, 0.0, 'y')
}

// ─── Lights ──────────────────────────────────────────────────────────────────

function buildLights(group, mt, spotLights, lightCones, sceneTargets, lampWorldRefs) {
  const lampPositions = [
    { x: 0.0, y: -0.08 },
    { x: -0.22, y: -0.08 },
    { x: 0.22, y: -0.08 },
  ]

  lampPositions.forEach(({ x, y }) => {
    const lampGroup = new THREE.Group()
    lampGroup.position.set(x, y, -0.92)

    // Housing cylinder (facing -Z)
    const housingGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.06, 10)
    housingGeo.rotateX(Math.PI / 2)
    lampGroup.add(new THREE.Mesh(housingGeo, mt.lampHousing))

    // Emissive lens
    const lensGeo = new THREE.CircleGeometry(0.032, 12)
    const lens = new THREE.Mesh(lensGeo, mt.lampLens)
    lens.position.z = -0.031
    lampGroup.add(lens)

    // Rim ring
    const rimGeo = new THREE.RingGeometry(0.032, 0.042, 12)
    const rim = new THREE.Mesh(rimGeo, mt.frame)
    rim.position.z = -0.032
    lampGroup.add(rim)

    // SpotLight — added to the lamp but target is scene-level (set by caller)
    const spot = new THREE.SpotLight(0xf5f0e8, 60, 50, Math.PI / 6, 0.5, 1.0)
    spot.position.set(0, 0, 0)
    lampGroup.add(spot)

    // Scene-level target — caller must add to scene and set position
    const target = new THREE.Object3D()
    spot.target = target
    sceneTargets.push(target)

    spotLights.push(spot)

    // Keep a reference to the lamp group so we can get its world position each frame
    lampWorldRefs.push(lampGroup)

    group.add(lampGroup)
  })

  // Light cones are scene-level objects oriented each frame in update()
  // Uses a custom shader for smooth alpha falloff from apex (bright) to base (invisible)
  const coneShaderMat = new THREE.ShaderMaterial({
    uniforms: {
      uOpacity: { value: 0.06 },
      uColor:   { value: new THREE.Color(0xd8e8ff) },
    },
    vertexShader: /* glsl */`
      varying float vFalloff;
      void main() {
        // Y ranges from 0 (apex) to -1 (base) in our shifted geometry
        // Normalize: 0 at apex, 1 at base
        vFalloff = clamp(-position.y, 0.0, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      precision mediump float;
      uniform float uOpacity;
      uniform vec3  uColor;
      varying float vFalloff;
      void main() {
        // Smooth cubic falloff: bright at apex, fading to zero at base
        float alpha = uOpacity * (1.0 - vFalloff) * (1.0 - vFalloff);
        // Extra edge softening near the very tip
        alpha *= smoothstep(0.0, 0.05, vFalloff);
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  })

  for (let i = 0; i < lampPositions.length; i++) {
    // Cone geometry: unit height along -Y, apex at origin
    const coneGeo = new THREE.ConeGeometry(1, 1, 24, 1, true)
    // Shift so apex is at (0,0,0), base at (0,-1,0)
    coneGeo.translate(0, -0.5, 0)
    const coneMesh = new THREE.Mesh(coneGeo, coneShaderMat.clone())
    coneMesh.renderOrder = 1
    coneMesh.frustumCulled = false
    lightCones.push(coneMesh)
  }
}

// ─── Camera / viewport ───────────────────────────────────────────────────────

function buildCamera(group, mt) {
  // Housing
  const camGeo = new THREE.CylinderGeometry(0.035, 0.040, 0.04, 10)
  camGeo.rotateX(Math.PI / 2)
  group.add(m(camGeo, mt.camera, 0, 0.06, -0.92))

  // Dome lens (half-sphere)
  const domeGeo = new THREE.SphereGeometry(0.028, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2)
  const domeMesh = new THREE.Mesh(domeGeo, mt.dome)
  domeMesh.position.set(0, 0.06, -0.95)
  domeMesh.rotation.x = -Math.PI / 2 // face forward
  group.add(domeMesh)

  // Pan-tilt bracket
  group.add(m(new THREE.BoxGeometry(0.02, 0.02, 0.03), mt.frame, 0, 0.06, -0.88))
}

// ─── Manipulator arm ─────────────────────────────────────────────────────────

function buildArm(group, mt) {
  const armGroup = new THREE.Group()
  armGroup.position.set(0.38, -0.22, -0.65)

  // Shoulder joint
  armGroup.add(m(new THREE.SphereGeometry(0.025, 8, 6), mt.arm, 0, 0, 0))

  // Upper arm
  const upper = new THREE.CylinderGeometry(0.022, 0.018, 0.35, 8)
  const upperMesh = new THREE.Mesh(upper, mt.arm)
  upperMesh.position.set(0, -0.16, -0.04)
  upperMesh.rotation.x = -0.3
  armGroup.add(upperMesh)

  // Elbow joint
  armGroup.add(m(new THREE.SphereGeometry(0.020, 8, 6), mt.arm, 0, -0.30, -0.08))

  // Lower arm
  const lower = new THREE.CylinderGeometry(0.016, 0.013, 0.28, 8)
  const lowerMesh = new THREE.Mesh(lower, mt.arm)
  lowerMesh.position.set(0, -0.42, -0.16)
  lowerMesh.rotation.x = -0.8
  armGroup.add(lowerMesh)

  // Wrist
  armGroup.add(m(new THREE.SphereGeometry(0.016, 8, 6), mt.arm, 0, -0.48, -0.26))

  // Gripper fingers (2, slightly open)
  const fingerGeo = new THREE.BoxGeometry(0.008, 0.06, 0.012)
  const f1 = new THREE.Mesh(fingerGeo, mt.arm)
  f1.position.set(-0.012, -0.51, -0.28)
  f1.rotation.z = 0.15
  armGroup.add(f1)
  const f2 = new THREE.Mesh(fingerGeo, mt.arm)
  f2.position.set(0.012, -0.51, -0.28)
  f2.rotation.z = -0.15
  armGroup.add(f2)

  group.add(armGroup)
}

// ─── Sample basket ───────────────────────────────────────────────────────────

function buildBasket(group, mt) {
  const by = -0.48, bz = -0.20

  // Outer rim — rectangular frame
  const longGeo = new THREE.BoxGeometry(0.01, 0.01, 0.40)
  const crossGeo = new THREE.BoxGeometry(0.55, 0.01, 0.01)

  // Bottom edges
  group.add(m(longGeo, mt.basket, -0.27, by, bz))
  group.add(m(longGeo, mt.basket, 0.27, by, bz))
  group.add(m(crossGeo, mt.basket, 0, by, bz - 0.20))
  group.add(m(crossGeo, mt.basket, 0, by, bz + 0.20))

  // Cross ribs
  for (let i = -0.12; i <= 0.12; i += 0.08) {
    group.add(m(crossGeo, mt.basket, 0, by, bz + i))
  }

  // Side walls (short vertical bars at corners)
  const postGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.08, 4)
  const cx = [-0.27, 0.27]
  const cz = [bz - 0.20, bz + 0.20]
  cx.forEach(x => cz.forEach(z => {
    group.add(m(postGeo, mt.basket, x, by + 0.04, z))
  }))

  // Bottom mesh (flat plane to suggest wire grid)
  const meshGeo = new THREE.PlaneGeometry(0.52, 0.38)
  meshGeo.rotateX(-Math.PI / 2)
  const meshMat = new THREE.MeshStandardMaterial({
    color: 0x181818, roughness: 0.9, metalness: 0.2, wireframe: true
  })
  group.add(m(meshGeo, meshMat, 0, by - 0.005, bz))
}

// ─── Tether ──────────────────────────────────────────────────────────────────

function buildTether(group, mt) {
  // Umbilical fitting
  group.add(m(new THREE.CylinderGeometry(0.025, 0.025, 0.05, 8), mt.arm, 0, 0.38, 0.70))

  // Tether cable — CatmullRom curve rising upward
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.42, 0.70),
    new THREE.Vector3(0, 0.8, 0.80),
    new THREE.Vector3(0.1, 1.4, 0.90),
    new THREE.Vector3(-0.05, 2.2, 1.1),
    new THREE.Vector3(0.1, 3.5, 1.5),
    new THREE.Vector3(0.2, 5.0, 2.0),
  ])
  const tubeGeo = new THREE.TubeGeometry(curve, 20, 0.012, 5, false)
  group.add(new THREE.Mesh(tubeGeo, mt.tether))

  // Fading upper section
  const upperCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.2, 5.0, 2.0),
    new THREE.Vector3(0.3, 7.0, 2.5),
    new THREE.Vector3(0.1, 9.5, 3.0),
  ])
  const upperGeo = new THREE.TubeGeometry(upperCurve, 12, 0.012, 5, false)
  const fadeMat = mt.tether.clone()
  fadeMat.opacity = 0.25
  group.add(new THREE.Mesh(upperGeo, fadeMat))
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function createROV({ phase = 0 } = {}) {
  const group = new THREE.Group()
  const spotLights = []
  const lightCones = []     // scene-level cone meshes — caller adds to scene
  const sceneTargets = []   // scene-level SpotLight targets — caller adds to scene
  const lampWorldRefs = []  // lamp group refs for computing world positions
  const mt = makeMats()

  buildFrame(group, mt)
  buildFoam(group, mt)
  buildHousing(group, mt)
  buildAllThrusters(group, mt)
  buildLights(group, mt, spotLights, lightCones, sceneTargets, lampWorldRefs)
  buildCamera(group, mt)
  buildArm(group, mt)
  buildBasket(group, mt)
  buildTether(group, mt)

  // Scale down — ROV is built at ~1.8 unit size, we want ~0.45 in scene
  group.scale.setScalar(0.25)

  // Store base transform for animation deltas
  let baseY = 0
  let baseYaw = 0
  const _lampWorld = new THREE.Vector3()
  const _targetWorld = new THREE.Vector3()
  const _dir = new THREE.Vector3()
  const _pos = new THREE.Vector3()
  const _tgt = new THREE.Vector3()
  const _tangent = new THREE.Vector3()

  // Patrol path state
  let patrolPosCurve = null   // CatmullRomCurve3 for ROV positions
  let patrolTgtCurve = null   // CatmullRomCurve3 for look-at targets
  let patrolBaseSpeed = 1 / 80 // base fraction of path per second (~80s full loop)
  let patrolPausePoints = []   // normalized t values where the ROV lingers
  let prevProgress = 0         // for computing tangent/banking
  let prevYaw = 0              // for smooth yaw interpolation

  function setBase(y, yaw) {
    baseY = y
    baseYaw = yaw
  }

  /**
   * Set a patrol path. waypoints = [{ pos: Vector3, target: Vector3, pause?: boolean }, ...]
   * The ROV will smoothly loop through these positions, aiming lights at each target.
   * Waypoints marked pause:true will get extra dwell time.
   */
  function setPatrol(waypoints) {
    if (!waypoints || waypoints.length < 2) return
    patrolPosCurve = new THREE.CatmullRomCurve3(
      waypoints.map(w => w.pos.clone()), true, 'catmullrom', 0.3
    )
    patrolTgtCurve = new THREE.CatmullRomCurve3(
      waypoints.map(w => w.target.clone()), true, 'catmullrom', 0.3
    )
    // Record which normalized t-values are pause points
    patrolPausePoints = []
    waypoints.forEach((w, i) => {
      if (w.pause) patrolPausePoints.push(i / waypoints.length)
    })
  }

  // Compute an effective "warped" progress that slows near pause points
  function warpProgress(rawT) {
    if (patrolPausePoints.length === 0) return rawT
    // Accumulate a slowdown factor near each pause point
    let speed = 1.0
    for (const pp of patrolPausePoints) {
      const d = Math.min(Math.abs(rawT - pp), Math.abs(rawT - pp + 1), Math.abs(rawT - pp - 1))
      // Within ~6% of path (~5s at normal speed), slow to 25% speed
      if (d < 0.06) speed = Math.min(speed, 0.25 + (d / 0.06) * 0.75)
    }
    return speed
  }

  // Accumulated patrol position (not tied to elapsedTime directly, for variable speed)
  let patrolAccum = 0
  let lastUpdateTime = -1

  function update(elapsedTime) {
    const t = elapsedTime
    const p = phase

    if (patrolPosCurve) {
      // ── Patrol mode: follow the spline path with variable speed ──
      if (lastUpdateTime < 0) lastUpdateTime = t
      const dt = Math.min(t - lastUpdateTime, 0.1) // clamp for tab-away
      lastUpdateTime = t

      // Variable speed — slow near pause points
      const speedMult = warpProgress(patrolAccum % 1)
      patrolAccum += dt * patrolBaseSpeed * speedMult
      const progress = patrolAccum % 1

      // Get smooth position and target along the spline
      patrolPosCurve.getPoint(progress, _pos)
      patrolTgtCurve.getPoint(progress, _tgt)

      // Organic drift — layered low-frequency noise on position
      const drift = 0.08
      _pos.x += Math.sin(t * 0.13 + p * 2.0) * drift + Math.sin(t * 0.31) * drift * 0.5
      _pos.z += Math.cos(t * 0.17 + p * 1.5) * drift + Math.cos(t * 0.29) * drift * 0.5

      // Gentle bob
      _pos.y += Math.sin(t * 0.6 + p) * 0.02 + Math.sin(t * 0.23) * 0.01

      group.position.copy(_pos)

      // Yaw: face toward the target (wreck) with smooth interpolation
      _dir.subVectors(_tgt, _pos)
      let targetYaw = Math.atan2(_dir.x, _dir.z) + Math.PI // ROV front is -Z
      // Unwrap angle for smooth interpolation
      while (targetYaw - prevYaw > Math.PI) targetYaw -= Math.PI * 2
      while (targetYaw - prevYaw < -Math.PI) targetYaw += Math.PI * 2
      prevYaw += (targetYaw - prevYaw) * 0.03 // smooth lag
      group.rotation.y = prevYaw

      // Pitch: nose down when descending, nose up when climbing
      const tangentStep = 0.002
      const nextP = (progress + tangentStep) % 1
      patrolPosCurve.getPoint(nextP, _tangent)
      const verticalVel = (_tangent.y - _pos.y) / tangentStep
      const pitchFromPath = -verticalVel * 0.0008 // nose down = positive rotation.x
      const pitchNoise = Math.sin(t * 0.4 + p * 0.8) * 0.012
      group.rotation.x = pitchFromPath + pitchNoise

      // Banking: roll into turns based on lateral yaw rate
      const yawRate = (targetYaw - prevYaw) // already dampened above
      const bankFromTurn = yawRate * 1.5 // lean into the turn
      const rollNoise = Math.sin(t * 0.35 + p * 1.2) * 0.008
      group.rotation.z = bankFromTurn + rollNoise

      // Move all SpotLight targets to the current look-at point
      sceneTargets.forEach(st => st.position.copy(_tgt))

      prevProgress = progress

    } else {
      // ── Stationary hover mode (original behavior) ──
      group.position.y = baseY + Math.sin(t * 0.6 + p) * 0.03
      group.rotation.y = baseYaw + Math.sin(t * 0.2 + p) * 0.018
      group.rotation.x = Math.sin(t * 0.4 + p * 0.8) * 0.022
      group.rotation.z = Math.sin(t * 0.35 + p * 1.2) * 0.012
    }

    // Update world matrix so lamp positions are current
    group.updateMatrixWorld(true)

    // Orient light cones from lamp world position toward target world position
    for (let i = 0; i < lightCones.length; i++) {
      const cone = lightCones[i]
      const lamp = lampWorldRefs[i]
      const target = sceneTargets[i]
      if (!lamp || !target) continue

      // Get lamp world position
      lamp.getWorldPosition(_lampWorld)
      _targetWorld.copy(target.position)

      // Position cone at lamp
      cone.position.copy(_lampWorld)

      // Orient cone: default geometry extends along -Y from apex at origin
      // We need it to point from lamp toward target
      _dir.subVectors(_targetWorld, _lampWorld)
      const dist = _dir.length()
      if (dist < 0.01) continue

      // Extend cone just past the target with tighter beam spread
      const coneLen = dist * 1.15
      const halfAngle = Math.PI / 14  // narrower beam
      const baseRadius = Math.tan(halfAngle) * coneLen
      cone.scale.set(baseRadius, coneLen, baseRadius)

      // lookAt points -Z at target; our cone extends -Y. Fix with rotation.
      cone.lookAt(_targetWorld)
      cone.rotateX(-Math.PI / 2)

      // Opacity pulsing via shader uniform
      cone.material.uniforms.uOpacity.value =
        0.06 + Math.sin(t * 1.2 + p + i * 0.8) * 0.02
    }

    // SpotLight intensity flicker (simulates HMI lamp variance)
    spotLights.forEach((sl, i) => {
      sl.intensity = 58 + Math.sin(t * 3.5 + p + i * 1.1) * 3
    })
  }

  function dispose() {
    group.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose()
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        mats.forEach(mat => mat.dispose())
      }
    })
    spotLights.forEach(sl => sl.dispose())
  }

  return { group, spotLights, lightCones, sceneTargets, setBase, setPatrol, update, dispose }
}
