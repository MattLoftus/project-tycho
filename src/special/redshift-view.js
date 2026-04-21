import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createComposer } from '../post.js'
import { createCameraMovement } from '../camera-movement.js'
import { createRedshiftModel } from './redshift-model.js'

/**
 * Gravitational Redshift view.
 * Two clocks at different depths in a gravity well, running at different rates.
 * Photon beam traveling bottom→top shows the redshift along the way.
 */

export function createRedshiftView() {
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

      camera_ = new THREE.PerspectiveCamera(
        50, window.innerWidth / window.innerHeight, 0.1, 500
      )
      camera_.position.set(14, 3, 14)

      controls_ = new OrbitControls(camera_, renderer.domElement)
      controls_.enableDamping = true
      controls_.dampingFactor = 0.05
      controls_.target.set(0, 0, 0)
      controls_.minDistance = 6
      controls_.maxDistance = 80

      camMove_ = createCameraMovement(camera_, controls_)

      // Lighting
      scene_.add(new THREE.AmbientLight(0x304050, 2.0))
      const key = new THREE.DirectionalLight(0x5060a0, 2.0)
      key.position.set(10, 15, 10)
      scene_.add(key)
      const fill = new THREE.DirectionalLight(0x202040, 1.0)
      fill.position.set(-10, 0, -10)
      scene_.add(fill)
      const massLight = new THREE.PointLight(0x4060a0, 60, 30)
      massLight.position.set(0, -12, 0)
      scene_.add(massLight)

      // Model
      model_ = createRedshiftModel()
      scene_.add(model_.mass)
      scene_.add(model_.topClock)
      scene_.add(model_.bottomClock)
      scene_.add(model_.beam)
      scene_.add(model_.starfield)

      // Orient clocks to face the camera — small trick: render with billboard behavior
      // Actually we just want them flat and facing +Z, which they already are.

      // Write fixed HUD readouts
      const topEl = document.getElementById('sp2-redshift-top-rate')
      const botEl = document.getElementById('sp2-redshift-bot-rate')
      const ratioEl = document.getElementById('sp2-redshift-ratio')
      if (topEl) topEl.textContent = model_.topFactor.toFixed(3) + ' × proper time'
      if (botEl) botEl.textContent = model_.bottomFactor.toFixed(3) + ' × proper time'
      if (ratioEl) {
        const slowerPct = ((1 - model_.relativeRatio) * 100).toFixed(1)
        ratioEl.textContent = slowerPct + '% slower'
      }

      // Post-processing
      const post = createComposer(renderer, scene_, camera_)
      composer_      = post.composer
      bloomPass_     = post.bloomPass
      cinematicPass_ = post.cinematicPass

      bloomPass_.strength  = 0.6
      bloomPass_.threshold = 0.3
      bloomPass_.radius    = 0.5

      cinematicPass_.uniforms.liftR.value = 0.92
      cinematicPass_.uniforms.liftG.value = 0.94
      cinematicPass_.uniforms.liftB.value = 1.05
      cinematicPass_.uniforms.gainR.value = 1.0
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
