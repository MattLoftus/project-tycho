import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { createComposer } from '../post.js'
import { createCameraMovement } from '../camera-movement.js'
import { createSpacetimeModel } from './spacetime-model.js'

/**
 * Spacetime Curvature view — a grid representation of curved spacetime
 * deformed by a massive object, with a subtle starfield backdrop.
 */

export function createSpacetimeView() {
  let scene_, camera_, controls_, renderer_
  let composer_, bloomPass_, cinematicPass_
  let labelRenderer_
  let camMove_
  let clock_
  let model_ = null
  let marker_ = null
  let speedMultiplier_ = 1.0
  let simTime_ = 0

  return {
    init(renderer) {
      renderer_ = renderer
      clock_ = new THREE.Clock()

      // ── Scene ──
      scene_ = new THREE.Scene()
      scene_.background = new THREE.Color(0x020408)

      // ── Camera — oblique view showing curvature ──
      camera_ = new THREE.PerspectiveCamera(
        50, window.innerWidth / window.innerHeight, 0.1, 500
      )
      camera_.position.set(22, 16, 22)

      controls_ = new OrbitControls(camera_, renderer.domElement)
      controls_.enableDamping = true
      controls_.dampingFactor = 0.05
      controls_.target.set(0, -1, 0)
      controls_.minDistance = 8
      controls_.maxDistance = 120

      camMove_ = createCameraMovement(camera_, controls_)

      // ── Lighting ──
      scene_.add(new THREE.AmbientLight(0x304060, 2.0))

      const key = new THREE.DirectionalLight(0x4060a0, 2.0)
      key.position.set(15, 25, 20)
      scene_.add(key)

      const fill = new THREE.DirectionalLight(0x304080, 1.0)
      fill.position.set(-10, 5, -15)
      scene_.add(fill)

      // Point light at the mass for local illumination
      const massLight = new THREE.PointLight(0x4080cc, 80, 30)
      massLight.position.set(0, -1, 0)
      scene_.add(massLight)

      // ── Model ── (cyan accent matches the theme-spacetime color scheme)
      model_ = createSpacetimeModel({
        accent: { r: 0.45, g: 0.9, b: 1.0 },
        emissiveA: 0x2060e0,
        emissiveB: 0x40a0ff,
      })
      scene_.add(model_.grid)
      scene_.add(model_.centralSphere)
      scene_.add(model_.orbitSphere)
      scene_.add(model_.starfield)

      // Barycenter marker — small bright ring at the grid origin
      const markerGeo = new THREE.RingGeometry(0.3, 0.5, 32)
      markerGeo.rotateX(-Math.PI / 2)
      const markerMat = new THREE.MeshBasicMaterial({
        color: 0x40ddee,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
      marker_ = new THREE.Mesh(markerGeo, markerMat)
      marker_.position.set(0, -5.5, 0)
      scene_.add(marker_)

      // Speed slider
      const slider = document.getElementById('sp2-spacetime-speed')
      const label = document.getElementById('sp2-spacetime-speed-label')
      if (slider) {
        slider.addEventListener('input', () => {
          speedMultiplier_ = slider.value / 100
          if (label) label.textContent = speedMultiplier_.toFixed(1) + 'x'
        })
      }

      // Gravitational waves toggle
      const gwCheck = document.getElementById('sp2-spacetime-gw')
      if (gwCheck) {
        gwCheck.addEventListener('change', () => {
          model_.gravWaves = gwCheck.checked
        })
      }

      // Mass sliders — update the model in real time
      const massASlider = document.getElementById('sp2-binary-mass-a-slider')
      const massBSlider = document.getElementById('sp2-binary-mass-b-slider')
      const applyMasses = () => {
        const a = parseFloat(massASlider?.value ?? '15')
        const b = parseFloat(massBSlider?.value ?? '4')
        model_.setMasses(a, b)
      }
      massASlider?.addEventListener('input', applyMasses)
      massBSlider?.addEventListener('input', applyMasses)

      // Preset scenarios
      document.querySelectorAll('[data-preset-group="binary"] .preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const a = parseFloat(btn.dataset.a)
          const b = parseFloat(btn.dataset.b)
          if (massASlider) massASlider.value = a
          if (massBSlider) massBSlider.value = b
          model_.setMasses(a, b)
          document.querySelectorAll('[data-preset-group="binary"] .preset-btn').forEach(b =>
            b.classList.toggle('active', b === btn)
          )
        })
      })

      // ── CSS2D label renderer ──
      labelRenderer_ = new CSS2DRenderer()
      labelRenderer_.setSize(window.innerWidth, window.innerHeight)
      labelRenderer_.domElement.style.position = 'absolute'
      labelRenderer_.domElement.style.top = '0'
      labelRenderer_.domElement.style.left = '0'
      labelRenderer_.domElement.style.pointerEvents = 'none'
      const appContainer = document.getElementById('spacetime-app') || document.getElementById('special-app')
      appContainer?.appendChild(labelRenderer_.domElement)

      // ── Post-processing ──
      const post = createComposer(renderer, scene_, camera_)
      composer_        = post.composer
      bloomPass_       = post.bloomPass
      cinematicPass_   = post.cinematicPass

      bloomPass_.strength  = 0.7
      bloomPass_.threshold = 0.25
      bloomPass_.radius    = 0.6

      // Cool blue space color grading
      cinematicPass_.uniforms.liftR.value = 0.90
      cinematicPass_.uniforms.liftG.value = 0.94
      cinematicPass_.uniforms.liftB.value = 1.08
      cinematicPass_.uniforms.gainR.value = 0.95
      cinematicPass_.uniforms.gainG.value = 0.98
      cinematicPass_.uniforms.gainB.value = 1.06
      cinematicPass_.uniforms.vignetteIntensity.value = 0.35
      cinematicPass_.uniforms.grainIntensity.value = 0.03
    },

    animate() {
      if (!composer_) return {}
      const dt = clock_.getDelta()
      simTime_ += dt * speedMultiplier_

      model_.update(simTime_)

      // Track barycenter marker to grid surface
      if (marker_ && model_.originY != null) {
        marker_.position.y = model_.originY + 0.05
      }

      // Live HUD updates
      const phaseEl = document.getElementById('sp2-binary-phase')
      if (phaseEl) {
        const phaseDeg = ((model_.phase * 180 / Math.PI) % 360 + 360) % 360
        phaseEl.textContent = phaseDeg.toFixed(0) + '°'
      }
      const omegaEl = document.getElementById('sp2-binary-omega')
      if (omegaEl) omegaEl.textContent = model_.omega.toFixed(3) + ' rad/s'
      const massAEl = document.getElementById('sp2-binary-mass-a')
      if (massAEl) massAEl.textContent = model_.aMass.toFixed(0) + ' M☉'
      const massBEl = document.getElementById('sp2-binary-mass-b')
      if (massBEl) massBEl.textContent = model_.bMass.toFixed(0) + ' M☉'

      if (camMove_) camMove_.update(dt)
      cinematicPass_.uniforms.time.value = performance.now() * 0.001
      controls_.update()
      composer_.render()
      if (labelRenderer_) labelRenderer_.render(scene_, camera_)

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
    },

    dispose() {
      camMove_?.dispose()
      controls_?.dispose()
      composer_?.dispose()
      if (labelRenderer_?.domElement?.parentNode) {
        labelRenderer_.domElement.parentNode.removeChild(labelRenderer_.domElement)
      }
      if (scene_) {
        scene_.traverse(obj => {
          if (obj.geometry) obj.geometry.dispose()
          if (obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
            mats.forEach(m => { if (m && m.dispose) m.dispose() })
          }
        })
      }
      scene_ = camera_ = controls_ = composer_ = model_ = labelRenderer_ = null
    },
  }
}

