import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { createComposer } from '../post.js'
import { createCameraMovement } from '../camera-movement.js'
import { createFrameDragModel } from './framedrag-model.js'

/**
 * Frame Dragging (Kerr metric) view — a spinning mass twists spacetime.
 * Toggle spin on/off to compare Schwarzschild vs Kerr geometry.
 */

export function createFrameDragView() {
  let scene_, camera_, controls_, renderer_
  let composer_, bloomPass_, cinematicPass_
  let labelRenderer_
  let camMove_
  let clock_
  let model_ = null

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

      scene_.add(new THREE.AmbientLight(0x304060, 2.0))
      const key = new THREE.DirectionalLight(0x4060a0, 2.0)
      key.position.set(15, 25, 20)
      scene_.add(key)
      const fill = new THREE.DirectionalLight(0x304080, 1.0)
      fill.position.set(-10, 5, -15)
      scene_.add(fill)
      const massLight = new THREE.PointLight(0x4080cc, 80, 30)
      massLight.position.set(0, -1, 0)
      scene_.add(massLight)

      model_ = createFrameDragModel()
      scene_.add(model_.grid)
      scene_.add(model_.sphere)
      scene_.add(model_.starfield)

      // Continuous spin slider (0-1, 0 = Schwarzschild, 1 = full Kerr twist)
      const spinSlider = document.getElementById('sp2-framedrag-spin-slider')
      const spinLabel = document.getElementById('sp2-framedrag-spin-label')
      if (spinSlider) {
        const apply = () => {
          const s = parseFloat(spinSlider.value) / 100
          model_.spin = s
          if (spinLabel) spinLabel.textContent = s.toFixed(2)
        }
        spinSlider.addEventListener('input', apply)
        apply()
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

      const post = createComposer(renderer, scene_, camera_)
      composer_        = post.composer
      bloomPass_       = post.bloomPass
      cinematicPass_   = post.cinematicPass

      // Frame drag: softer glow, rose tint in highlights
      bloomPass_.strength  = 0.55
      bloomPass_.threshold = 0.35
      bloomPass_.radius    = 0.5

      cinematicPass_.uniforms.liftR.value = 0.96
      cinematicPass_.uniforms.liftG.value = 0.92
      cinematicPass_.uniforms.liftB.value = 1.00
      cinematicPass_.uniforms.gainR.value = 1.05
      cinematicPass_.uniforms.gainG.value = 0.98
      cinematicPass_.uniforms.gainB.value = 1.0
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
