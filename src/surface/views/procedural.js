import * as THREE from 'three'
import { EffectComposer }  from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass }      from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { isMobile } from '../../post.js'
import { CameraController } from '../camera.js'
import { createTerrain }   from '../terrain.js'
import { createDeposits }  from '../deposits.js'
import { initProceduralHUD, setStatus, setTerrainLabel } from '../hud.js'

let scene, camCtrl, composer, terrain, deposits, clock

export async function init(renderer) {
  clock = new THREE.Clock()

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x020810)
  scene.fog = new THREE.FogExp2(0x020810, 0.009)

  const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.5, 2000)
  camCtrl = new CameraController(camera, renderer.domElement)

  if (isMobile) {
    composer = { render() { renderer.render(scene, camera) }, setSize() {}, dispose() {} }
  } else {
    composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.7, 0.55, 0.80))
  }

  scene.add(new THREE.AmbientLight(0x0a1830, 1.6))
  const sun = new THREE.DirectionalLight(0xffe8c0, 1.8)
  sun.position.set(120, 180, 80)
  scene.add(sun)
  const fill = new THREE.DirectionalLight(0x1a3860, 0.4)
  fill.position.set(-100, 60, -80)
  scene.add(fill)

  const starPos = new Float32Array(2200 * 3)
  for (let i = 0; i < 2200; i++) {
    const theta = Math.random() * Math.PI * 0.5
    const phi   = Math.random() * Math.PI * 2
    const r     = 460 + Math.random() * 40
    starPos[i * 3]     = r * Math.sin(theta) * Math.cos(phi)
    starPos[i * 3 + 1] = r * Math.cos(theta)
    starPos[i * 3 + 2] = r * Math.sin(theta) * Math.sin(phi)
  }
  const starGeo = new THREE.BufferGeometry()
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0x9aadbe, size: 0.55, sizeAttenuation: true })))

  terrain  = createTerrain(scene)
  deposits = createDeposits(scene, terrain)

  initProceduralHUD(deposits.data)
  setStatus('ORBITAL SURVEY ACTIVE')
  setTerrainLabel('PROCEDURAL · SIM')
}

export function animate() {
  if (!composer) return
  const dt = clock.getDelta()
  const t  = clock.elapsedTime

  terrain.material.uniforms.uTime.value = t
  deposits.update(t)
  camCtrl.update(dt)
  composer.render()
  return { camera: camCtrl.camera }
}

export function getClickTargets() { return deposits?.markers ?? [] }

export function resize() {
  if (!camCtrl || !composer) return
  camCtrl.camera.aspect = window.innerWidth / window.innerHeight
  camCtrl.camera.updateProjectionMatrix()
  composer.setSize(window.innerWidth, window.innerHeight)
}

export function dispose() {
  camCtrl?.dispose()
  composer?.dispose()
  scene?.traverse((obj) => {
    obj.geometry?.dispose()
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
    mats.forEach(m => m?.dispose())
  })
  scene = camCtrl = composer = terrain = deposits = null
}
