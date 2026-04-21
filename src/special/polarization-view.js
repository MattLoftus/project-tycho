import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createComposer } from '../post.js'
import { createCameraMovement } from '../camera-movement.js'
import { createPolarizationModel } from './polarization-model.js'

/**
 * Gravitational Wave Polarization view.
 *
 * Shows the transverse-traceless strain pattern of a GW acting on a ring
 * of test particles. Toggles between +/×/circular polarization modes.
 */

export function createPolarizationView() {
  let scene_, camera_, controls_, renderer_
  let composer_, bloomPass_, cinematicPass_
  let camMove_
  let clock_
  let model_ = null

  return {
    init(renderer) {
      renderer_ = renderer
      clock_ = new THREE.Clock()

      scene_ = new THREE.Scene()
      scene_.background = new THREE.Color(0x020408)

      // Camera — oblique "3/4 view" of the ring with wave coming from behind
      camera_ = new THREE.PerspectiveCamera(
        50, window.innerWidth / window.innerHeight, 0.1, 500
      )
      camera_.position.set(10, 7, 18)

      controls_ = new OrbitControls(camera_, renderer.domElement)
      controls_.enableDamping = true
      controls_.dampingFactor = 0.05
      controls_.target.set(0, 0, 0)
      controls_.minDistance = 8
      controls_.maxDistance = 80

      camMove_ = createCameraMovement(camera_, controls_)

      // Lighting
      scene_.add(new THREE.AmbientLight(0x304060, 2.0))
      const key = new THREE.DirectionalLight(0x4060a0, 2.0)
      key.position.set(10, 15, 10)
      scene_.add(key)
      const fill = new THREE.DirectionalLight(0x304080, 1.0)
      fill.position.set(-10, 5, -10)
      scene_.add(fill)

      // Model
      model_ = createPolarizationModel()
      scene_.add(model_.ring)
      scene_.add(model_.refRing)
      scene_.add(model_.wave)
      scene_.add(model_.starfield)

      // Mode toggle buttons
      const modeLabels = { plus: '+ plus', cross: '× cross', both: 'circular (+, ×)' }
      document.querySelectorAll('#sp2-polarization-modes .mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const m = btn.dataset.mode
          model_.mode = m
          document.querySelectorAll('#sp2-polarization-modes .mode-btn').forEach(b =>
            b.classList.toggle('active', b === btn)
          )
          const label = document.getElementById('sp2-polarization-mode')
          if (label) label.textContent = modeLabels[m] || m
        })
      })

      // Post-processing
      const post = createComposer(renderer, scene_, camera_)
      composer_      = post.composer
      bloomPass_     = post.bloomPass
      cinematicPass_ = post.cinematicPass

      // Polarization: crisp particle glow, strong lavender tint
      bloomPass_.strength = 0.85
      bloomPass_.threshold = 0.2
      bloomPass_.radius = 0.5

      cinematicPass_.uniforms.liftR.value = 0.97
      cinematicPass_.uniforms.liftG.value = 0.92
      cinematicPass_.uniforms.liftB.value = 1.10
      cinematicPass_.uniforms.gainR.value = 1.02
      cinematicPass_.uniforms.gainG.value = 0.96
      cinematicPass_.uniforms.gainB.value = 1.08
      cinematicPass_.uniforms.vignetteIntensity.value = 0.35
      cinematicPass_.uniforms.grainIntensity.value = 0.03
    },

    animate() {
      if (!composer_) return {}
      const dt = clock_.getDelta()

      model_.update(clock_.elapsedTime)

      if (camMove_) camMove_.update(dt)
      cinematicPass_.uniforms.time.value = performance.now() * 0.001
      controls_.update()
      composer_.render()

      return { camera: camera_ }
    },

    getClickTargets() { return [] },

    resize() {
      if (!camera_ || !composer_) return
      camera_.aspect = window.innerWidth / window.innerHeight
      camera_.updateProjectionMatrix()
      composer_.setSize(window.innerWidth, window.innerHeight)
    },

    dispose() {
      camMove_?.dispose()
      controls_?.dispose()
      composer_?.dispose()
      if (scene_) {
        scene_.traverse(obj => {
          if (obj.geometry) obj.geometry.dispose()
          if (obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
            mats.forEach(m => { if (m && m.dispose) m.dispose() })
          }
        })
      }
      scene_ = camera_ = controls_ = composer_ = model_ = null
    },
  }
}
