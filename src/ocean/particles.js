import * as THREE from 'three'

// ─── Marine Snow ────────────────────────────────────────────────────────────
// Tiny organic particles drifting downward through the water column

export function createMarineSnow(scene, count = 3000, boxSize = 200) {
  const positions  = new Float32Array(count * 3)
  const velocities = new Float32Array(count)
  const half = boxSize / 2

  for (let i = 0; i < count; i++) {
    positions[i * 3]     = (Math.random() - 0.5) * boxSize
    positions[i * 3 + 1] = (Math.random() - 0.5) * boxSize
    positions[i * 3 + 2] = (Math.random() - 0.5) * boxSize
    velocities[i] = 0.3 + Math.random() * 0.5  // drift speed
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))

  const mat = new THREE.PointsMaterial({
    color: 0x6688aa,
    size: 0.35,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  })

  const points = new THREE.Points(geo, mat)
  scene.add(points)

  function update(dt, cameraPos) {
    const pos = geo.attributes.position.array

    for (let i = 0; i < count; i++) {
      const i3 = i * 3
      // Drift downward
      pos[i3 + 1] -= velocities[i] * dt

      // Slight lateral drift (gentle current)
      pos[i3]     += Math.sin(pos[i3 + 1] * 0.05 + i) * 0.02 * dt
      pos[i3 + 2] += Math.cos(pos[i3 + 1] * 0.05 + i * 0.7) * 0.015 * dt

      // Recycle when below the box
      if (pos[i3 + 1] < cameraPos.y - half) {
        pos[i3]     = cameraPos.x + (Math.random() - 0.5) * boxSize
        pos[i3 + 1] = cameraPos.y + half
        pos[i3 + 2] = cameraPos.z + (Math.random() - 0.5) * boxSize
      }
    }

    // Re-center around camera (keeps snow visible as camera moves)
    points.position.set(0, 0, 0)
    geo.attributes.position.needsUpdate = true
  }

  function dispose() {
    geo.dispose()
    mat.dispose()
    scene.remove(points)
  }

  return { points, update, dispose }
}

// ─── Vent Smoke ─────────────────────────────────────────────────────────────
// Dark particles rising from a hydrothermal vent position

export function createVentSmoke(scene, ventPositions, countPerVent = 80) {
  const totalCount = ventPositions.length * countPerVent
  const positions  = new Float32Array(totalCount * 3)
  const ages       = new Float32Array(totalCount)
  const maxAges    = new Float32Array(totalCount)
  const vents      = new Int32Array(totalCount) // which vent this particle belongs to

  for (let v = 0; v < ventPositions.length; v++) {
    for (let p = 0; p < countPerVent; p++) {
      const i = v * countPerVent + p
      vents[i] = v
      _resetParticle(i, ventPositions[v], positions, ages, maxAges)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))

  const mat = new THREE.PointsMaterial({
    color: 0x1a1a20,
    size: 1.2,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  })

  const points = new THREE.Points(geo, mat)
  scene.add(points)

  function update(dt) {
    const pos = geo.attributes.position.array

    for (let i = 0; i < totalCount; i++) {
      ages[i] += dt

      if (ages[i] >= maxAges[i]) {
        _resetParticle(i, ventPositions[vents[i]], pos, ages, maxAges)
        continue
      }

      const i3 = i * 3
      // Rise upward with turbulence
      pos[i3 + 1] += (1.5 + Math.random() * 0.5) * dt
      pos[i3]     += Math.sin(ages[i] * 2.0 + i) * 0.3 * dt
      pos[i3 + 2] += Math.cos(ages[i] * 2.0 + i * 0.7) * 0.3 * dt
    }

    geo.attributes.position.needsUpdate = true
  }

  function dispose() {
    geo.dispose()
    mat.dispose()
    scene.remove(points)
  }

  return { points, update, dispose }
}

function _resetParticle(i, ventPos, positions, ages, maxAges) {
  const i3 = i * 3
  positions[i3]     = ventPos.x + (Math.random() - 0.5) * 0.8
  positions[i3 + 1] = ventPos.y + Math.random() * 0.5
  positions[i3 + 2] = ventPos.z + (Math.random() - 0.5) * 0.8
  ages[i] = Math.random() * 3.0  // stagger initial ages
  maxAges[i] = 3.0 + Math.random() * 2.0
}

// ─── Bubbles (for shallow/reef views) ───────────────────────────────────────

export function createBubbles(scene, count = 400, boxSize = 160) {
  const positions  = new Float32Array(count * 3)
  const velocities = new Float32Array(count)
  const half = boxSize / 2

  for (let i = 0; i < count; i++) {
    positions[i * 3]     = (Math.random() - 0.5) * boxSize
    positions[i * 3 + 1] = (Math.random() - 0.5) * 40
    positions[i * 3 + 2] = (Math.random() - 0.5) * boxSize
    velocities[i] = 0.8 + Math.random() * 1.5
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))

  const mat = new THREE.PointsMaterial({
    color: 0xaaeeff,
    size: 0.5,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  })

  const points = new THREE.Points(geo, mat)
  scene.add(points)

  function update(dt, cameraPos) {
    const pos = geo.attributes.position.array

    for (let i = 0; i < count; i++) {
      const i3 = i * 3
      // Rise with wobble
      pos[i3 + 1] += velocities[i] * dt
      pos[i3]     += Math.sin(pos[i3 + 1] * 0.3 + i) * 0.08 * dt
      pos[i3 + 2] += Math.cos(pos[i3 + 1] * 0.3 + i * 1.3) * 0.06 * dt

      // Recycle
      if (pos[i3 + 1] > cameraPos.y + 30) {
        pos[i3]     = cameraPos.x + (Math.random() - 0.5) * boxSize
        pos[i3 + 1] = cameraPos.y - 20
        pos[i3 + 2] = cameraPos.z + (Math.random() - 0.5) * boxSize
      }
    }

    geo.attributes.position.needsUpdate = true
  }

  function dispose() {
    geo.dispose()
    mat.dispose()
    scene.remove(points)
  }

  return { points, update, dispose }
}
