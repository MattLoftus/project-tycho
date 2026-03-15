import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { Line2 } from 'three/addons/lines/Line2.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { LineGeometry } from 'three/addons/lines/LineGeometry.js'
import { createComposer } from '../post.js'
import { createCameraMovement } from '../camera-movement.js'
import { createColliderModel, generateEvent, propagateTrack, PARTICLE_TYPES } from './collider-model.js'

/**
 * Particle Collider view — CMS-style detector cross-section with live
 * collision events. Real Lorentz-force trajectories in a solenoidal B-field.
 *
 * Modes: "single" (fire one event at a time) / "continuous" (auto-repeat)
 */

export function createColliderView() {
  let scene_, camera_, controls_, renderer_
  let composer_, bloomPass_, cinematicPass_
  let labelRenderer_
  let camMove_
  let clock_
  let model_ = null
  let labels_ = []

  // Physics
  const B_FIELD = 2.0 // Tesla (scaled for visual clarity; real CMS = 3.8T)
  const PROP_DT = 0.12 // propagation time step

  // Event state
  let tracks_ = []        // array of { points, color, progress, maxLen, type }
  let caloHits_ = []      // array of { mesh, progress, maxOpacity }
  let eventActive_ = false
  let eventTimer_ = 0
  let autoMode_ = false
  let eventCount_ = 0
  let currentEvent_ = null

  // Track rendering
  let trackGroup_ = null
  let caloGroup_ = null

  // Animation
  const TRACK_GROW_SPEED = 2.5 // tracks grow outward at this rate
  const TRACK_FADE_DELAY = 5.0 // seconds before tracks start fading
  const TRACK_FADE_SPEED = 0.5
  const AUTO_INTERVAL = 7.0    // seconds between auto-events

  // Camera fly-to
  let flyAnim_ = null

  // Transition (for mode consistency with other views)
  let transProgress_ = 0
  let transTarget_ = 0

  function clearEvent() {
    if (trackGroup_) {
      trackGroup_.children.forEach(c => {
        if (c.geometry) c.geometry.dispose()
        if (c.material) c.material.dispose()
      })
      trackGroup_.clear()
    }
    if (caloGroup_) {
      caloGroup_.children.forEach(c => {
        if (c.geometry) c.geometry.dispose()
        if (c.material) c.material.dispose()
      })
      caloGroup_.clear()
    }
    tracks_ = []
    caloHits_ = []
    eventActive_ = false
    eventTimer_ = 0
    currentEvent_ = null
  }

  function fireEvent() {
    clearEvent()

    const event = generateEvent(50)
    currentEvent_ = event
    eventCount_++
    eventActive_ = true
    eventTimer_ = 0

    // Propagate all particle tracks
    for (const particle of event.particles) {
      const points = propagateTrack(particle, B_FIELD, PROP_DT, 20)
      if (points.length < 2) continue

      // Create fat track line using Line2 for visible width
      const color = new THREE.Color(particle.color)
      const brightColor = color.clone().multiplyScalar(1.6)
      brightColor.r = Math.min(brightColor.r, 1)
      brightColor.g = Math.min(brightColor.g, 1)
      brightColor.b = Math.min(brightColor.b, 1)

      // Flatten points into position array for LineGeometry
      const positions = new Float32Array(points.length * 3)
      for (let i = 0; i < points.length; i++) {
        positions[i * 3] = points[i].x
        positions[i * 3 + 1] = points[i].y
        positions[i * 3 + 2] = points[i].z
      }

      const geo = new LineGeometry()
      geo.setPositions(positions)

      const trackMat = new LineMaterial({
        color: brightColor.getHex(),
        linewidth: 1.5,
        depthTest: false,
        transparent: true,
        opacity: 1.0,
        resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
      })

      const line = new Line2(geo, trackMat)
      line.computeLineDistances()
      // Start with 0 segments visible, grow outward
      geo.instanceCount = 0
      trackGroup_.add(line)

      const totalSegments = points.length - 1
      tracks_.push({
        line,
        geo,
        points,
        color: particle.color,
        progress: 0,
        maxLen: totalSegments,
        type: particle.type,
        particle,
        fadeTimer: 0,
      })

      // Calorimeter energy deposits (bright flash where particle stops)
      const lastPt = points[points.length - 1]
      const r = Math.sqrt(lastPt.x * lastPt.x + lastPt.y * lastPt.y)
      if (r > 3.0) { // only show if particle reached a calorimeter
        const depositSize = Math.min(1.5, particle.pT * 0.08 + 0.3)
        const depositGeo = new THREE.SphereGeometry(depositSize, 8, 6)
        const depositMat = new THREE.MeshBasicMaterial({
          color: particle.color,
          transparent: true,
          opacity: 0,
          depthTest: false,
        })
        const deposit = new THREE.Mesh(depositGeo, depositMat)
        deposit.position.copy(lastPt)
        caloGroup_.add(deposit)

        caloHits_.push({
          mesh: deposit,
          progress: 0,
          delay: points.length / 200 * 1.5, // arrive when track reaches it
          maxOpacity: Math.min(0.8, particle.pT * 0.04 + 0.3),
        })
      }
    }

    // Update HUD
    updateEventInfo(event)
  }

  function updateEventInfo(event) {
    const el = document.getElementById('sp2-collider-event')
    if (el) {
      const topoNames = {
        dijet: 'Di-jet (QCD)',
        dimuon: 'Z → μ⁺μ⁻',
        diphoton: 'H → γγ',
        multijet: 'Multi-jet (QCD)',
        zee: 'Z → e⁺e⁻',
      }
      el.textContent = topoNames[event.topology] || event.topology
    }
    const countEl = document.getElementById('sp2-collider-count')
    if (countEl) countEl.textContent = eventCount_
    const partEl = document.getElementById('sp2-collider-particles')
    if (partEl) partEl.textContent = event.particles.length
  }

  return {
    init(renderer) {
      renderer_ = renderer
      clock_ = new THREE.Clock()

      scene_ = new THREE.Scene()
      scene_.background = new THREE.Color(0x060c18)

      camera_ = new THREE.PerspectiveCamera(
        50, window.innerWidth / window.innerHeight, 0.1, 200
      )
      // End-on view (looking down the beam axis, Z)
      camera_.position.set(0, 0, 30)

      controls_ = new OrbitControls(camera_, renderer.domElement)
      controls_.enableDamping = true
      controls_.dampingFactor = 0.05
      controls_.target.set(0, 0, 0)
      controls_.minDistance = 8
      controls_.maxDistance = 80

      camMove_ = createCameraMovement(camera_, controls_)

      // ── Lighting — detector hall ──
      scene_.add(new THREE.AmbientLight(0x607090, 4.5))

      const key = new THREE.DirectionalLight(0x7090c0, 3.0)
      key.position.set(20, 30, 40)
      scene_.add(key)

      const fill = new THREE.DirectionalLight(0x506080, 2.0)
      fill.position.set(-15, -10, 20)
      scene_.add(fill)

      const back = new THREE.DirectionalLight(0x506078, 1.5)
      back.position.set(0, 0, -30)
      scene_.add(back)

      // Point light at collision point
      const collisionLight = new THREE.PointLight(0x7090c0, 60, 30)
      collisionLight.position.set(0, 0, 0)
      scene_.add(collisionLight)

      // ── Beam lines — two bright lines along Z axis ──
      const beamLen = 40
      const beamPositions = new Float32Array([0, 0, -beamLen, 0, 0, 0])
      const beamGeo1 = new LineGeometry()
      beamGeo1.setPositions(beamPositions)
      const beamPositions2 = new Float32Array([0, 0, 0, 0, 0, beamLen])
      const beamGeo2 = new LineGeometry()
      beamGeo2.setPositions(beamPositions2)
      const beamMat = new LineMaterial({
        color: 0x40c0ff,
        linewidth: 2,
        transparent: true,
        opacity: 0.7,
        depthTest: false,
        resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
      })
      const beam1 = new Line2(beamGeo1, beamMat)
      beam1.computeLineDistances()
      beam1.renderOrder = 5
      scene_.add(beam1)
      const beam2 = new Line2(beamGeo2, beamMat.clone())
      beam2.computeLineDistances()
      beam2.renderOrder = 5
      scene_.add(beam2)

      // Bright glow point at collision vertex
      const vertexGeo = new THREE.SphereGeometry(0.25, 12, 8)
      const vertexMat = new THREE.MeshBasicMaterial({
        color: 0x80e0ff,
        transparent: true,
        opacity: 0.8,
      })
      const vertex = new THREE.Mesh(vertexGeo, vertexMat)
      scene_.add(vertex)

      // ── Detector model ──
      model_ = createColliderModel()
      scene_.add(model_.detector)

      // Track and calo hit groups — render on top of detector layers
      trackGroup_ = new THREE.Group()
      trackGroup_.renderOrder = 10
      scene_.add(trackGroup_)
      caloGroup_ = new THREE.Group()
      caloGroup_.renderOrder = 11
      scene_.add(caloGroup_)

      // ── CSS2D label renderer ──
      labelRenderer_ = new CSS2DRenderer()
      labelRenderer_.setSize(window.innerWidth, window.innerHeight)
      labelRenderer_.domElement.style.position = 'absolute'
      labelRenderer_.domElement.style.top = '0'
      labelRenderer_.domElement.style.left = '0'
      labelRenderer_.domElement.style.pointerEvents = 'none'
      document.getElementById('special-app')?.appendChild(labelRenderer_.domElement)

      if (model_.labelAnchors) {
        for (const [key, anchor] of Object.entries(model_.labelAnchors)) {
          const div = document.createElement('div')
          div.className = 'sp2-label'
          div.textContent = anchor.name
          div.dataset.featureKey = key
          const label = new CSS2DObject(div)
          label.position.copy(anchor.pos)
          scene_.add(label)
          labels_.push({ obj: label, div, key })
        }
      }

      // ── Post-processing ──
      const post = createComposer(renderer, scene_, camera_)
      composer_ = post.composer
      bloomPass_ = post.bloomPass
      cinematicPass_ = post.cinematicPass

      bloomPass_.strength = 0.4
      bloomPass_.threshold = 0.5
      bloomPass_.radius = 0.4

      // Subtle cool tint — don't darken
      cinematicPass_.uniforms.liftR.value = 0.97
      cinematicPass_.uniforms.liftG.value = 0.98
      cinematicPass_.uniforms.liftB.value = 1.04
      cinematicPass_.uniforms.gainR.value = 0.98
      cinematicPass_.uniforms.gainG.value = 0.99
      cinematicPass_.uniforms.gainB.value = 1.03
      cinematicPass_.uniforms.vignetteIntensity.value = 0.2

      transProgress_ = 0
      transTarget_ = 0

      // Wire up the fire button
      const fireBtn = document.getElementById('sp2-collider-fire')
      if (fireBtn) {
        fireBtn.addEventListener('click', () => fireEvent())
      }

      // Fire initial event
      fireEvent()
    },

    setMode(mode) {
      if (mode === 'interior' || mode === 'continuous') {
        autoMode_ = true
        transTarget_ = 1.0
      } else {
        autoMode_ = false
        transTarget_ = 0.0
      }
    },

    /** Trigger a new collision event */
    fireEvent() {
      fireEvent()
    },

    animate() {
      if (!composer_) return {}
      const dt = clock_.getDelta()

      // ── Mode transition ──
      const speed = 2.0
      if (transProgress_ < transTarget_) {
        transProgress_ = Math.min(transProgress_ + dt * speed, transTarget_)
      } else if (transProgress_ > transTarget_) {
        transProgress_ = Math.max(transProgress_ - dt * speed, transTarget_)
      }

      // ── Event animation — grow tracks outward ──
      if (eventActive_) {
        eventTimer_ += dt

        for (const track of tracks_) {
          // Grow track progressively (simulates particle flying out)
          if (track.progress < track.maxLen) {
            track.progress += TRACK_GROW_SPEED * dt * track.maxLen
            track.progress = Math.min(track.progress, track.maxLen)

            // Update instance count to show only grown portion
            track.geo.instanceCount = Math.floor(track.progress)
          }

          // Fade out after delay
          if (eventTimer_ > TRACK_FADE_DELAY) {
            if (!track.line.material.transparent) {
              track.line.material.transparent = true
              track.line.material.needsUpdate = true
            }
            track.fadeTimer += dt
            const fade = 1.0 - track.fadeTimer * TRACK_FADE_SPEED
            if (fade <= 0) {
              track.line.material.opacity = 0
            } else {
              track.line.material.opacity = fade
            }
          }
        }

        // Calorimeter hit flashes
        for (const hit of caloHits_) {
          if (eventTimer_ > hit.delay * 0.8) {
            hit.progress += dt * 2.0
            // Quick flash in, slow fade out
            if (hit.progress < 0.3) {
              hit.mesh.material.opacity = (hit.progress / 0.3) * hit.maxOpacity
            } else {
              const fadeT = (hit.progress - 0.3) / 2.0
              hit.mesh.material.opacity = hit.maxOpacity * Math.max(0, 1.0 - fadeT)
            }
            // Pulse scale
            const scale = 1.0 + Math.sin(hit.progress * 3) * 0.2
            hit.mesh.scale.setScalar(scale)
          }
        }

        // Check if all tracks faded — event is done
        const allFaded = tracks_.every(t => t.line.material.opacity <= 0)
        if (allFaded && eventTimer_ > TRACK_FADE_DELAY + 3) {
          eventActive_ = false
        }
      }

      // ── Auto-fire in continuous mode ──
      if (autoMode_ && !eventActive_) {
        fireEvent()
      }

      // ── Label visibility ──
      for (const label of labels_) {
        const worldPos = new THREE.Vector3()
        label.obj.getWorldPosition(worldPos)
        const dist = camera_.position.distanceTo(worldPos)
        const distFade = 1.0 - Math.max(0, Math.min(1, (dist - 5) / 50))
        label.div.style.opacity = distFade.toFixed(2)
        label.div.style.display = distFade < 0.02 ? 'none' : ''
      }

      if (camMove_) camMove_.update(dt)
      cinematicPass_.uniforms.time.value = performance.now() * 0.001
      controls_.update()
      composer_.render()
      if (labelRenderer_) labelRenderer_.render(scene_, camera_)

      updateGauges(camera_, transProgress_)

      return { camera: camera_ }
    },

    getClickTargets() {
      return []
    },

    resize() {
      if (!camera_ || !composer_) return
      camera_.aspect = window.innerWidth / window.innerHeight
      camera_.updateProjectionMatrix()
      composer_.setSize(window.innerWidth, window.innerHeight)
      if (labelRenderer_) labelRenderer_.setSize(window.innerWidth, window.innerHeight)
      // Update Line2 material resolution
      const res = new THREE.Vector2(window.innerWidth, window.innerHeight)
      for (const track of tracks_) {
        if (track.line.material.resolution) track.line.material.resolution.copy(res)
      }
    },

    dispose() {
      clearEvent()
      camMove_?.dispose()
      controls_?.dispose()
      composer_?.dispose()
      if (labelRenderer_?.domElement?.parentNode) {
        labelRenderer_.domElement.parentNode.removeChild(labelRenderer_.domElement)
      }
      for (const label of labels_) {
        label.obj.removeFromParent()
      }
      labels_ = []
      if (scene_) {
        scene_.traverse(obj => {
          if (obj.geometry) obj.geometry.dispose()
          if (obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
            mats.forEach(m => { if (m && m.dispose) m.dispose() })
          }
        })
        if (scene_.background && scene_.background.dispose) scene_.background.dispose()
      }
      scene_ = camera_ = controls_ = composer_ = model_ = labelRenderer_ = null
      trackGroup_ = caloGroup_ = null
      flyAnim_ = null
    },
  }
}

// ─── HUD helpers ─────────────────────────────────────────────────────────────

function updateGauges(camera, t) {
  const el = (id) => document.getElementById(id)

  const dist = el('sp2-gauge-distance')
  if (dist) {
    const d = Math.round(camera.position.distanceTo(new THREE.Vector3(0, 0, 0)))
    dist.textContent = `${d} m`
  }

  const mode = el('sp2-gauge-mode')
  if (mode) mode.textContent = t > 0.5 ? 'CONTINUOUS' : 'SINGLE EVENT'
}
