import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { createComposer } from '../post.js'
import { createCameraMovement } from '../camera-movement.js'
import { createSaturnVModel } from './saturn5-model.js'

/**
 * Saturn V Launch Vehicle view.
 * Assembled/cutaway toggle, CSS2D labels, camera fly-to, click-to-inspect.
 */

export function createSaturnVView() {
  let scene_, camera_, controls_, renderer_
  let composer_, bloomPass_, cinematicPass_
  let labelRenderer_
  let camMove_
  let clock_
  let model_ = null
  let labels_ = []

  // Transition state
  let transProgress_ = 0
  let transTarget_ = 0

  // Camera fly-to animation state
  let flyAnim_ = null

  // Camera positions for mode transitions
  const CAM_ASSEMBLED = { pos: new THREE.Vector3(80, 35, 120), target: new THREE.Vector3(0, 50, 0) }
  const CAM_CUTAWAY = { pos: new THREE.Vector3(40, 55, 70), target: new THREE.Vector3(0, 55, 0) }
  let modeTransAnim_ = null

  return {
    init(renderer) {
      renderer_ = renderer
      clock_ = new THREE.Clock()

      scene_ = new THREE.Scene()
      scene_.fog = new THREE.FogExp2(0x9ec0e0, 0.0003)

      // Florida sky dome — clear blue
      const skyGeo = new THREE.SphereGeometry(900, 32, 16)
      const skyMat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {},
        vertexShader: `
          varying vec3 vWorldPos;
          void main() {
            vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          precision mediump float;
          varying vec3 vWorldPos;
          void main() {
            float h = normalize(vWorldPos).y;
            vec3 groundCol = vec3(0.55, 0.62, 0.55);
            vec3 hazeCol = vec3(0.78, 0.85, 0.92);
            vec3 midCol = vec3(0.45, 0.65, 0.88);
            vec3 zenithCol = vec3(0.22, 0.42, 0.78);

            vec3 col;
            if (h < 0.0) {
              col = groundCol;
            } else if (h < 0.08) {
              col = mix(hazeCol, midCol, h / 0.08);
            } else if (h < 0.4) {
              col = mix(midCol, zenithCol, (h - 0.08) / 0.32);
            } else {
              col = zenithCol;
            }

            // Sun glow
            float sunAngle = atan(vWorldPos.z, vWorldPos.x);
            float sunTarget = -0.3;
            float sunDist = abs(sunAngle - sunTarget);
            float sunGlow = exp(-sunDist * 2.5) * smoothstep(-0.02, 0.15, h) * smoothstep(0.5, 0.0, h);
            col += vec3(0.35, 0.30, 0.15) * sunGlow;

            gl_FragColor = vec4(col, 1.0);
          }
        `,
      })
      scene_.add(new THREE.Mesh(skyGeo, skyMat))

      camera_ = new THREE.PerspectiveCamera(
        50, window.innerWidth / window.innerHeight, 0.5, 2000
      )
      // Start at medium distance, slightly below center, looking up
      camera_.position.set(80, 35, 120)

      controls_ = new OrbitControls(camera_, renderer.domElement)
      controls_.enableDamping = true
      controls_.dampingFactor = 0.05
      controls_.target.set(0, 50, 0)
      controls_.minDistance = 15
      controls_.maxDistance = 500
      controls_.maxPolarAngle = Math.PI / 2.05

      camMove_ = createCameraMovement(camera_, controls_)

      // ── Lighting — Cape Canaveral noon (bright, soft shadows) ──
      scene_.add(new THREE.AmbientLight(0xd0d4e0, 2.0))

      const sun = new THREE.DirectionalLight(0xfff5e0, 2.0)
      sun.position.set(100, 250, -80)
      scene_.add(sun)

      const fill = new THREE.DirectionalLight(0xc0d0e8, 1.2)
      fill.position.set(-100, 80, 100)
      scene_.add(fill)

      const rim = new THREE.DirectionalLight(0xffe8c0, 0.8)
      rim.position.set(-40, 120, -150)
      scene_.add(rim)

      // Additional fill from below to soften undersides
      const bottomFill = new THREE.DirectionalLight(0xd0d8e0, 0.6)
      bottomFill.position.set(0, -50, 50)
      scene_.add(bottomFill)

      // ── Launch pad ground ──
      const groundGeo = new THREE.PlaneGeometry(600, 600, 64, 64)
      groundGeo.rotateX(-Math.PI / 2)
      const groundMat = new THREE.MeshStandardMaterial({
        color: 0xa0a098,
        roughness: 0.9,
        metalness: 0.05,
        side: THREE.DoubleSide,
      })
      const ground = new THREE.Mesh(groundGeo, groundMat)
      ground.position.y = -7
      scene_.add(ground)

      // Flame trench (darker channel under the rocket)
      const trenchGeo = new THREE.PlaneGeometry(16, 80)
      trenchGeo.rotateX(-Math.PI / 2)
      const trenchMat = new THREE.MeshStandardMaterial({
        color: 0x505050,
        roughness: 0.95,
        metalness: 0.02,
      })
      const trench = new THREE.Mesh(trenchGeo, trenchMat)
      trench.position.set(0, -7.01, 0)
      scene_.add(trench)

      // ── Mobile Launcher Platform (MLP) base ──
      // Thin platform deck below the engine bells so engines remain visible
      const mlpMat = new THREE.MeshStandardMaterial({
        color: 0x808080, roughness: 0.85, metalness: 0.1,
        emissive: 0x404040, emissiveIntensity: 0.1,
      })
      const mlpDeckH = 2.0
      const mlpDeckY = -5.5  // deck top at y=-4.5, well below engine bells
      const mlpGeo = new THREE.BoxGeometry(40, mlpDeckH, 40)
      const mlp = new THREE.Mesh(mlpGeo, mlpMat)
      mlp.position.set(8, mlpDeckY, 0)
      scene_.add(mlp)

      // 4 hold-down posts supporting the rocket above the MLP deck
      const holdDownMat = new THREE.MeshStandardMaterial({
        color: 0x707070, roughness: 0.7, metalness: 0.2,
      })
      const holdDownR = 3.8  // ring radius for hold-down arms
      for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2 + Math.PI / 4
        const postGeo = new THREE.BoxGeometry(1.0, 4.5, 1.0)
        const post = new THREE.Mesh(postGeo, holdDownMat)
        post.position.set(
          Math.cos(angle) * holdDownR,
          mlpDeckY + mlpDeckH / 2 + 2.25,
          Math.sin(angle) * holdDownR
        )
        scene_.add(post)
      }

      // Flame deflector (wedge shape in the trench below MLP)
      const deflectorGeo = new THREE.CylinderGeometry(0.5, 5, 3, 8)
      const deflectorMat = new THREE.MeshStandardMaterial({
        color: 0x505050, roughness: 0.9, metalness: 0.05,
      })
      const deflector = new THREE.Mesh(deflectorGeo, deflectorMat)
      deflector.position.set(0, mlpDeckY - mlpDeckH / 2 - 1.5, 0)
      scene_.add(deflector)

      // ── Launch Umbilical Tower (LUT) ──
      const towerGroup = new THREE.Group()
      const towerMat = new THREE.MeshStandardMaterial({
        color: 0xc04020,
        roughness: 0.7,
        metalness: 0.15,
        emissive: 0x601510,
        emissiveIntensity: 0.15,
      })
      const towerGray = new THREE.MeshStandardMaterial({
        color: 0x909090, roughness: 0.7, metalness: 0.2,
        emissive: 0x606060, emissiveIntensity: 0.1,
      })

      const towerH = 130
      const towerOff = 18   // center of tower from rocket
      const towerWx = 10    // tower width in X (toward/away from rocket)
      const towerWz = 12    // tower width in Z (lateral)

      // 4 main columns (tapered)
      for (let ix = 0; ix < 2; ix++) {
        for (let iz = 0; iz < 2; iz++) {
          const colGeo = new THREE.CylinderGeometry(0.25, 0.4, towerH, 8)
          const col = new THREE.Mesh(colGeo, towerMat)
          col.position.set(
            towerOff + (ix - 0.5) * towerWx,
            towerH / 2,
            (iz - 0.5) * towerWz
          )
          towerGroup.add(col)
        }
      }

      // Denser lattice: horizontal beams every 8m + X-bracing on each face
      const levelSpacing = 8
      for (let y = 4; y < towerH; y += levelSpacing) {
        // Horizontal beams — X direction (front/back faces)
        for (let iz = 0; iz < 2; iz++) {
          const bGeo = new THREE.CylinderGeometry(0.12, 0.12, towerWx, 6)
          bGeo.rotateZ(Math.PI / 2)
          const b = new THREE.Mesh(bGeo, towerMat)
          b.position.set(towerOff, y, (iz - 0.5) * towerWz)
          towerGroup.add(b)
        }
        // Horizontal beams — Z direction (side faces)
        for (let ix = 0; ix < 2; ix++) {
          const bGeo = new THREE.CylinderGeometry(0.12, 0.12, towerWz, 6)
          bGeo.rotateX(Math.PI / 2)
          const b = new THREE.Mesh(bGeo, towerMat)
          b.position.set(towerOff + (ix - 0.5) * towerWx, y, 0)
          towerGroup.add(b)
        }

        // X-bracing on the rocket-facing side (most visible)
        const braceLen = Math.sqrt(towerWz * towerWz + levelSpacing * levelSpacing)
        const brGeo = new THREE.CylinderGeometry(0.06, 0.06, braceLen, 4)
        // Alternating diagonal direction
        const flip = (y / levelSpacing) % 2 === 0 ? 1 : -1
        const br = new THREE.Mesh(brGeo, towerMat)
        br.position.set(towerOff - towerWx / 2, y + levelSpacing / 2, 0)
        br.rotation.x = flip * Math.atan2(towerWz, levelSpacing)
        towerGroup.add(br)

        // X-bracing on far side
        const br2 = new THREE.Mesh(brGeo.clone(), towerMat)
        br2.position.set(towerOff + towerWx / 2, y + levelSpacing / 2, 0)
        br2.rotation.x = -flip * Math.atan2(towerWz, levelSpacing)
        towerGroup.add(br2)

        // X-bracing on side faces
        const sideBrLen = Math.sqrt(towerWx * towerWx + levelSpacing * levelSpacing)
        const sideBrGeo = new THREE.CylinderGeometry(0.06, 0.06, sideBrLen, 4)
        for (let iz = 0; iz < 2; iz++) {
          const sbr = new THREE.Mesh(sideBrGeo.clone(), towerMat)
          sbr.position.set(towerOff, y + levelSpacing / 2, (iz - 0.5) * towerWz)
          sbr.rotation.z = flip * Math.atan2(towerWx, levelSpacing)
          towerGroup.add(sbr)
        }
      }

      // ── Swing arms (9 arms at various heights) ──
      // Approximate heights based on the 9 LUT service arms
      const swingArmHeights = [
        { y: 6,   label: 'Tail Service Mast' },
        { y: 20,  label: 'S-IC Intertank' },
        { y: 38,  label: 'S-IC Forward' },
        { y: 50,  label: 'S-II Aft' },
        { y: 62,  label: 'S-II Intermediate' },
        { y: 70,  label: 'S-II Forward' },
        { y: 80,  label: 'S-IVB' },
        { y: 92,  label: 'Service Module' },
        { y: 102, label: 'Crew Access Arm' }, // Arm 9 — most famous
      ]

      const rocketRadius = 5.05 // Saturn V radius
      for (const arm of swingArmHeights) {
        const armLen = towerOff - rocketRadius - 1.5 // from tower face to near rocket
        const armGeo = new THREE.BoxGeometry(armLen, 1.2, 1.5)
        const armMesh = new THREE.Mesh(armGeo, towerGray)
        armMesh.position.set(towerOff - towerWx / 2 - armLen / 2, arm.y, 0)
        towerGroup.add(armMesh)

        // Umbilical connection plate at rocket end
        const plateGeo = new THREE.BoxGeometry(0.8, 1.8, 2.0)
        const plate = new THREE.Mesh(plateGeo, towerGray)
        plate.position.set(towerOff - towerWx / 2 - armLen - 0.4, arm.y, 0)
        towerGroup.add(plate)
      }

      // Crew Access Arm white room (larger box at arm 9 end)
      const whiteRoomGeo = new THREE.BoxGeometry(2.5, 3.0, 3.0)
      const whiteRoomMat = new THREE.MeshStandardMaterial({
        color: 0xe0e0e0, roughness: 0.6, metalness: 0.05,
        emissive: 0xd0d0d0, emissiveIntensity: 0.3,
      })
      const whiteRoom = new THREE.Mesh(whiteRoomGeo, whiteRoomMat)
      whiteRoom.position.set(rocketRadius + 2.5, 102, 0)
      towerGroup.add(whiteRoom)

      // ── Hammerhead crane on top ──
      // Vertical mast above tower
      const cranePostH = 15
      const cranePost = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.25, cranePostH, 6), towerMat
      )
      cranePost.position.set(towerOff, towerH + cranePostH / 2, 0)
      towerGroup.add(cranePost)

      // Horizontal boom (hammerhead)
      const boomLen = 22
      const boomGeo = new THREE.BoxGeometry(boomLen, 1.0, 1.0)
      const boom = new THREE.Mesh(boomGeo, towerMat)
      boom.position.set(towerOff - boomLen / 2 + 5, towerH + cranePostH, 0)
      towerGroup.add(boom)

      // Counterweight
      const cwGeo = new THREE.BoxGeometry(3, 2, 2)
      const cw = new THREE.Mesh(cwGeo, towerGray)
      cw.position.set(towerOff + 5 + 3, towerH + cranePostH - 1, 0)
      towerGroup.add(cw)

      scene_.add(towerGroup)

      // ── Saturn V model ──
      model_ = createSaturnVModel()
      scene_.add(model_.assembled)
      scene_.add(model_.cutaway)

      // ── CSS2D label renderer ──
      labelRenderer_ = new CSS2DRenderer()
      labelRenderer_.setSize(window.innerWidth, window.innerHeight)
      labelRenderer_.domElement.style.position = 'absolute'
      labelRenderer_.domElement.style.top = '0'
      labelRenderer_.domElement.style.left = '0'
      labelRenderer_.domElement.style.pointerEvents = 'none'
      document.getElementById('special-app')?.appendChild(labelRenderer_.domElement)

      // Create labels from model anchor positions
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

      bloomPass_.strength = 0.25
      bloomPass_.threshold = 0.88
      bloomPass_.radius = 0.35

      cinematicPass_.uniforms.liftR.value = 1.0
      cinematicPass_.uniforms.liftG.value = 1.0
      cinematicPass_.uniforms.liftB.value = 1.01
      cinematicPass_.uniforms.gainR.value = 1.0
      cinematicPass_.uniforms.gainG.value = 1.0
      cinematicPass_.uniforms.gainB.value = 1.005
      cinematicPass_.uniforms.vignetteIntensity.value = 0.25

      transProgress_ = 0
      transTarget_ = 0
    },

    setMode(mode) {
      const newTarget = mode === 'cutaway' ? 1.0 : 0.0
      if (newTarget === transTarget_) return
      transTarget_ = newTarget

      // Smoothly interpolate camera position during mode switch
      if (camera_ && controls_ && !flyAnim_) {
        const dest = newTarget > 0.5 ? CAM_CUTAWAY : CAM_ASSEMBLED
        modeTransAnim_ = {
          startPos: camera_.position.clone(),
          endPos: dest.pos.clone(),
          startTarget: controls_.target.clone(),
          endTarget: dest.target.clone(),
          elapsed: 0,
          duration: 1.2,
        }
      }
    },

    flyTo(featureKey) {
      if (!model_?.labelAnchors?.[featureKey] || !camera_ || !controls_) return

      // Auto-switch to cutaway
      transTarget_ = 1.0

      const target = model_.labelAnchors[featureKey].pos.clone()
      const offset = new THREE.Vector3(20, 10, 20)
      const camTarget = target.clone().add(offset)

      const startPos = camera_.position.clone()
      const startTarget = controls_.target.clone()
      const duration = 1.5
      flyAnim_ = { startPos, camTarget, startTarget, lookTarget: target, elapsed: 0, duration }
    },

    animate() {
      if (!composer_) return {}
      const dt = clock_.getDelta()

      // ── Camera fly-to animation ──
      if (flyAnim_) {
        flyAnim_.elapsed += dt
        const t = Math.min(flyAnim_.elapsed / flyAnim_.duration, 1)
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2

        camera_.position.lerpVectors(flyAnim_.startPos, flyAnim_.camTarget, e)
        controls_.target.lerpVectors(flyAnim_.startTarget, flyAnim_.lookTarget, e)

        if (t >= 1) flyAnim_ = null
        modeTransAnim_ = null // fly-to overrides mode transition
      }

      // ── Camera interpolation during mode switch ──
      if (modeTransAnim_ && !flyAnim_) {
        modeTransAnim_.elapsed += dt
        const t = Math.min(modeTransAnim_.elapsed / modeTransAnim_.duration, 1)
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2

        camera_.position.lerpVectors(modeTransAnim_.startPos, modeTransAnim_.endPos, e)
        controls_.target.lerpVectors(modeTransAnim_.startTarget, modeTransAnim_.endTarget, e)

        if (t >= 1) modeTransAnim_ = null
      }

      // ── Smooth transition between assembled and cutaway ──
      const speed = 2.0
      if (transProgress_ < transTarget_) {
        transProgress_ = Math.min(transProgress_ + dt * speed, transTarget_)
      } else if (transProgress_ > transTarget_) {
        transProgress_ = Math.max(transProgress_ - dt * speed, transTarget_)
      }

      const t = transProgress_

      if (model_) {
        // Toggle assembled/cutaway visibility
        model_.assembled.visible = t < 0.5
        model_.cutaway.visible = t >= 0.5
      }

      // ── Label visibility ──
      for (const label of labels_) {
        const dist = camera_.position.distanceTo(label.obj.position)
        const distFade = 1.0 - Math.max(0, Math.min(1, (dist - 20) / 250))
        const opacity = Math.max(t * 0.8, 0.3) * distFade
        label.div.style.opacity = opacity.toFixed(2)
        label.div.style.display = opacity < 0.02 ? 'none' : ''
      }

      if (camMove_) camMove_.update(dt)
      cinematicPass_.uniforms.time.value = performance.now() * 0.001
      controls_.update()
      composer_.render()
      if (labelRenderer_) labelRenderer_.render(scene_, camera_)

      updateGauges(camera_, t)

      return { camera: camera_ }
    },

    getClickTargets() {
      return model_?.clickTargets ?? []
    },

    showFeatureDetailByKey(key) {
      if (!model_?.features?.[key]) return
      this.showFeatureDetail(model_.features[key])
    },

    showFeatureDetail(feature) {
      if (!feature) return
      const content = document.getElementById('sp2-detail-content')
      if (!content) return

      let rows = ''
      const fields = ['dimensions', 'thrust', 'propellant', 'propellantMass', 'burnTime', 'engines', 'engine', 'manufacturer', 'crewCapacity', 'heatShield', 'payloadLEO', 'payloadTLI', 'flights', 'stages', 'totalMass']
      fields.forEach(f => {
        if (feature[f]) {
          const label = f.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())
          rows += `<div style="display:flex;justify-content:space-between;padding:6px 16px;border-bottom:1px solid rgba(100,160,220,0.08);">
            <span style="color:#305080;font-size:9px;letter-spacing:2px;text-transform:uppercase">${label}</span>
            <span style="color:#4090d0;font-size:11px;letter-spacing:0.5px">${feature[f]}</span>
          </div>`
        }
      })
      if (feature.description) {
        rows += `<div style="padding:12px 16px;color:#5080a0;font-size:11px;line-height:1.6;letter-spacing:0.3px">${feature.description}</div>`
      }

      content.innerHTML = `
        <div style="padding:14px 16px 12px;border-bottom:1px solid rgba(100,160,220,0.3);margin-bottom:4px">
          <div style="color:#4090d0;font-size:13px;letter-spacing:2px;margin-bottom:5px">${feature.name}</div>
          <div style="color:#305080;font-size:9px;letter-spacing:3px">${(feature.type || 'COMPONENT').toUpperCase()}</div>
        </div>
        ${rows}`

      document.getElementById('sp2-detail')?.classList.remove('hidden')
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
      for (const label of labels_) {
        label.obj.removeFromParent()
      }
      labels_ = []
      if (scene_) {
        scene_.traverse(obj => {
          if (obj.geometry) obj.geometry.dispose()
          if (obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
            mats.forEach(m => {
              if (m && m.dispose) m.dispose()
            })
          }
        })
        if (scene_.background && scene_.background.dispose) scene_.background.dispose()
      }
      scene_ = camera_ = controls_ = composer_ = model_ = labelRenderer_ = null
      flyAnim_ = null
    },
  }
}

// ─── HUD helpers ────────────────────────────────────────────────────────────

function updateGauges(camera, t) {
  const el = (id) => document.getElementById(id)
  const p = camera.position

  const elev = el('sp2-gauge-elevation')
  if (elev) elev.textContent = `${Math.round(p.y)} m`

  const dist = el('sp2-gauge-distance')
  if (dist) {
    const d = Math.round(p.distanceTo(new THREE.Vector3(0, 50, 0)))
    dist.textContent = `${d} m`
  }

  const mode = el('sp2-gauge-mode')
  if (mode) mode.textContent = t > 0.5 ? 'CUTAWAY' : 'ASSEMBLED'
}
