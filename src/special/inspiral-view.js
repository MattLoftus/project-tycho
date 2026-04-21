import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { createComposer } from '../post.js'
import { createCameraMovement } from '../camera-movement.js'
import { createInspiralModel } from './inspiral-model.js'

/**
 * Gravitational Wave Inspiral view — two objects spiral inward,
 * merge, and ring down while emitting expanding gravitational waves.
 */

export function createInspiralView() {
  let scene_, camera_, controls_, renderer_
  let composer_, bloomPass_, cinematicPass_
  let labelRenderer_
  let camMove_
  let clock_
  let model_ = null
  let speedMultiplier_ = 1.0
  let simTime_ = 0

  return {
    init(renderer) {
      renderer_ = renderer
      clock_ = new THREE.Clock()

      scene_ = new THREE.Scene()
      scene_.background = new THREE.Color(0x020408)

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

      // Lighting
      scene_.add(new THREE.AmbientLight(0x304060, 2.0))
      const key = new THREE.DirectionalLight(0x4060a0, 2.0)
      key.position.set(15, 25, 20)
      scene_.add(key)
      const fill = new THREE.DirectionalLight(0x304080, 1.0)
      fill.position.set(-10, 5, -15)
      scene_.add(fill)
      const centerLight = new THREE.PointLight(0x4080cc, 60, 25)
      centerLight.position.set(0, -1, 0)
      scene_.add(centerLight)

      // Model
      model_ = createInspiralModel()
      scene_.add(model_.grid)
      scene_.add(model_.objA)
      scene_.add(model_.objB)
      scene_.add(model_.merged)
      scene_.add(model_.starfield)

      // Speed slider
      const slider = document.getElementById('sp2-inspiral-speed')
      const label = document.getElementById('sp2-inspiral-speed-label')
      if (slider) {
        slider.addEventListener('input', () => {
          speedMultiplier_ = slider.value / 100
          if (label) label.textContent = speedMultiplier_.toFixed(1) + 'x'
        })
      }

      // CSS2D label renderer
      labelRenderer_ = new CSS2DRenderer()
      labelRenderer_.setSize(window.innerWidth, window.innerHeight)
      labelRenderer_.domElement.style.position = 'absolute'
      labelRenderer_.domElement.style.top = '0'
      labelRenderer_.domElement.style.left = '0'
      labelRenderer_.domElement.style.pointerEvents = 'none'
      const appContainer = document.getElementById('spacetime-app') || document.getElementById('special-app')
      appContainer?.appendChild(labelRenderer_.domElement)

      // Post-processing
      const post = createComposer(renderer, scene_, camera_)
      composer_        = post.composer
      bloomPass_       = post.bloomPass
      cinematicPass_   = post.cinematicPass

      // Inspiral-specific: bloom surges during merger, tinted teal
      bloomPass_.strength  = 0.95
      bloomPass_.threshold = 0.2
      bloomPass_.radius    = 0.75

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

      // Update phase indicator
      const phaseEl = document.getElementById('sp2-inspiral-phase')
      if (phaseEl) {
        const labels = ['INSPIRAL', 'MERGER', 'RINGDOWN', 'RESETTING']
        phaseEl.textContent = labels[model_.phase] || 'INSPIRAL'
      }

      if (camMove_) camMove_.update(dt)
      cinematicPass_.uniforms.time.value = performance.now() * 0.001
      controls_.update()
      composer_.render()
      if (labelRenderer_) labelRenderer_.render(scene_, camera_)

      return { camera: camera_ }
    },

    getClickTargets() { return [] },

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
