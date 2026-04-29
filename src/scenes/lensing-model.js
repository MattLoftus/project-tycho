import * as THREE from 'three'

/**
 * Gravitational Lensing visualization.
 *
 * A dense starfield provides the background. A massive invisible lens
 * at the origin bends light paths via a screen-space post-processing
 * shader. The shader displaces UV coordinates radially away from the
 * lens center, recreating Einstein rings and arc distortions.
 *
 * A small dark sphere at the center represents the lensing mass.
 * A background galaxy plane adds visual interest for the lensing.
 */

const STAR_COUNT      = 8000    // dense field for lensing to act on
const STAR_RADIUS     = 150

// ─── Dense starfield ─────────────────────────────────────────────────────────

function buildStarfield() {
  const positions = new Float32Array(STAR_COUNT * 3)
  const colors = new Float32Array(STAR_COUNT * 3)
  const sizes = new Float32Array(STAR_COUNT)

  for (let i = 0; i < STAR_COUNT; i++) {
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    const r = STAR_RADIUS * (0.5 + Math.random() * 0.5)

    positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = r * Math.cos(phi)

    const warmth = Math.random()
    if (warmth > 0.9) {
      // Bright warm star
      colors[i * 3] = 1.0; colors[i * 3 + 1] = 0.85; colors[i * 3 + 2] = 0.6
      sizes[i] = 1.0 + Math.random() * 1.5
    } else if (warmth > 0.7) {
      // Blue-white
      colors[i * 3] = 0.7; colors[i * 3 + 1] = 0.8; colors[i * 3 + 2] = 1.0
      sizes[i] = 0.6 + Math.random() * 0.8
    } else {
      // Neutral white
      colors[i * 3] = 0.85; colors[i * 3 + 1] = 0.88; colors[i * 3 + 2] = 0.92
      sizes[i] = 0.3 + Math.random() * 0.5
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geo.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1))

  return new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.6,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    sizeAttenuation: true,
  }))
}

// ─── Background galaxy band (Milky Way-like glow) ────────────────────────────

function buildGalaxyBand() {
  const group = new THREE.Group()

  // A band of dense small points to simulate the galactic plane
  const bandCount = 4000
  const positions = new Float32Array(bandCount * 3)
  const colors = new Float32Array(bandCount * 3)

  for (let i = 0; i < bandCount; i++) {
    // Distribute along a band in the XY plane at large Z
    const angle = (Math.random() - 0.5) * Math.PI * 0.6 // narrow band
    const spread = Math.random() * 360 - 180
    const r = 80 + Math.random() * 60

    positions[i * 3]     = Math.cos(spread * 0.0175) * r
    positions[i * 3 + 1] = Math.sin(angle) * 15 + (Math.random() - 0.5) * 8
    positions[i * 3 + 2] = Math.sin(spread * 0.0175) * r

    const brightness = 0.15 + Math.random() * 0.25
    colors[i * 3]     = brightness * 0.8
    colors[i * 3 + 1] = brightness * 0.85
    colors[i * 3 + 2] = brightness * 1.0
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))

  group.add(new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.4,
    vertexColors: true,
    transparent: true,
    opacity: 0.6,
    sizeAttenuation: true,
  })))

  return group
}

// ─── Gravitational lensing shader ────────────────────────────────────────────
//
// Point-mass Schwarzschild lens equation:
//   β = θ - θ_E² / θ
// For a pixel at image angle θ (measured from the lens), sample the source
// at angle β. The deflection pulls the sample inward with 1/r falloff
// (Schwarzschild), not outward with 1/r².

export const LensingShader = {
  uniforms: {
    tDiffuse:      { value: null },
    lensCenter:    { value: new THREE.Vector2(0.5, 0.5) },
    lensStrength:  { value: 1.0 },    // slider-controlled; 1.0 = true Schwarzschild β = θ − θ_E²/θ
    lensRadius:    { value: 0.12 },   // Einstein radius (screen fraction)
    aspectRatio:   { value: 1.0 },
  },

  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform vec2 lensCenter;
    uniform float lensStrength;
    uniform float lensRadius;
    uniform float aspectRatio;
    varying vec2 vUv;

    void main() {
      // Aspect-corrected (pseudo-uniform) screen coords
      vec2 uv = vUv;
      vec2 delta = uv - lensCenter;
      delta.x *= aspectRatio;

      float r = length(delta);
      float einsteinR = lensRadius;

      // β = θ - θ_E²/θ — pull sample inward (light bends toward mass)
      if (r > 0.001) {
        float deflection = lensStrength * einsteinR * einsteinR / (r + 0.002);
        vec2 dir = delta / r;
        dir.x /= aspectRatio;  // back to UV space
        uv = uv - dir * deflection;
      }

      // Shadow — computed in aspect-corrected r so it's a true circle
      float shadow = smoothstep(0.010, 0.018, r);

      vec4 color = texture2D(tDiffuse, uv);
      color.rgb *= shadow;

      gl_FragColor = color;
    }
  `,
}

// ─── Export ──────────────────────────────────────────────────────────────────

export function createLensingModel() {
  const starfield = buildStarfield()
  const galaxy = buildGalaxyBand()

  return {
    starfield,
    galaxy,

    update(time) {
      starfield.rotation.y = time * 0.002
      galaxy.rotation.y = time * 0.002
    },
  }
}
