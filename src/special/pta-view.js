// PTA scene placeholder — real implementation lands in next pass.
// Returns the same factory shape as other views.

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createComposer } from '../post.js'

export function createPtaView() {
  let scene_, camera_, controls_, renderer_, composer_
  let clock_

  return {
    init(renderer) {
      renderer_ = renderer
      clock_ = new THREE.Clock()
      scene_ = new THREE.Scene()
      scene_.background = new THREE.Color(0x000408)

      camera_ = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 2000)
      camera_.position.set(0, 0, 200)

      controls_ = new OrbitControls(camera_, renderer.domElement)
      controls_.enableDamping = true

      // Placeholder: a sphere of dots
      const geo = new THREE.BufferGeometry()
      const N = 67
      const pos = new Float32Array(N * 3)
      for (let i = 0; i < N; i++) {
        const theta = Math.acos(2 * (i + 0.5) / N - 1)
        const phi = Math.PI * (1 + Math.sqrt(5)) * i
        pos[i * 3] = 80 * Math.sin(theta) * Math.cos(phi)
        pos[i * 3 + 1] = 80 * Math.cos(theta)
        pos[i * 3 + 2] = 80 * Math.sin(theta) * Math.sin(phi)
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      const points = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xff90c0, size: 2.5 }))
      scene_.add(points)
      scene_.add(new THREE.AmbientLight(0x808090, 1))
      const post = createComposer(renderer, scene_, camera_)
      composer_ = post.composer
    },
    animate() {
      if (!composer_) return {}
      const dt = clock_.getDelta()
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
      controls_?.dispose()
      composer_?.dispose()
      if (scene_) scene_.traverse(o => {
        if (o.geometry) o.geometry.dispose()
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose?.())
      })
      scene_ = camera_ = controls_ = composer_ = null
    },
  }
}
