const TYPE_HEX = {
  mineral:    '#e07820',
  energy:     '#00c8e0',
  biological: '#40e068',
  rare:       '#c060ff',
}

const startTime = Date.now()
let _featureClickCb = null

// ─── Shared setters ───────────────────────────────────────────────────────────

export function setStatus(text) {
  const el = document.getElementById('status-text')
  if (el) el.textContent = text
}

export function setTerrainLabel(text) {
  const el = document.getElementById('terrain-label')
  if (el) el.textContent = text
}

export function setFeatureClickCallback(fn) {
  _featureClickCb = fn
}

// ─── Procedural HUD ───────────────────────────────────────────────────────────

export function initProceduralHUD(deposits) {
  document.getElementById('hud-system-title').textContent = 'SURFACE ANALYSIS SYSTEM'
  document.getElementById('deposit-panel').style.display  = ''
  document.getElementById('mars-panel').style.display     = 'none'

  const list = document.getElementById('deposit-list')
  list.innerHTML = ''

  deposits.forEach((dep) => {
    const col  = TYPE_HEX[dep.type]
    const item = document.createElement('div')
    item.className = 'deposit-item'
    item.innerHTML = `
      <div class="deposit-item-header">
        <span class="deposit-dot" style="background:${col};box-shadow:0 0 7px ${col}"></span>
        <span class="deposit-name">${dep.name}</span>
      </div>
      <div class="deposit-meta">
        <span class="deposit-quantity">${dep.quantity} ${dep.unit}</span>
        <span class="deposit-grade grade-${dep.grade}">${dep.grade}</span>
      </div>`
    item.addEventListener('click', () => showDepositDetail(dep))
    list.appendChild(item)
  })

  document.getElementById('deposit-count').textContent = deposits.length
  _fadeOutLoading()
}

// ─── Mars HUD ─────────────────────────────────────────────────────────────────

export function initMarsHUD(region, featuresWithPos, systemTitle = 'MARTIAN SURFACE SURVEY') {
  document.getElementById('hud-system-title').textContent = systemTitle
  document.getElementById('deposit-panel').style.display  = 'none'
  document.getElementById('mars-panel').style.display     = ''
  document.getElementById('mars-region-label').textContent = region.subtitle

  const list = document.getElementById('mars-feature-list')
  list.innerHTML = ''

  featuresWithPos.forEach((f, i) => {
    const item = document.createElement('div')
    item.className = 'deposit-item feature-item'
    item.innerHTML = `
      <div class="deposit-item-header">
        <span class="deposit-dot" style="background:#c8440a;box-shadow:0 0 7px #c8440a88"></span>
        <span class="deposit-name">${f.name}</span>
      </div>
      <div class="deposit-meta">
        <span class="deposit-quantity">${f.width !== '---' ? f.width : f.type}</span>
        <span class="deposit-grade grade-HIGH">${f.type.toUpperCase()}</span>
      </div>`

    item.addEventListener('mouseenter', () => item.classList.add('feature-targeted'))
    item.addEventListener('mouseleave', () => item.classList.remove('feature-targeted'))
    item.addEventListener('click', () => {
      item.classList.add('feature-activated')
      setTimeout(() => item.classList.remove('feature-activated'), 600)
      if (_featureClickCb) _featureClickCb(f, i)
    })

    list.appendChild(item)
  })

  document.getElementById('mars-feature-count').textContent = featuresWithPos.length
  _fadeOutLoading()
}

// ─── Per-frame ────────────────────────────────────────────────────────────────

export function updateHUD(camera) {
  const p   = camera.position
  document.getElementById('coord-lat').textContent = (-(p.z / 100) * 90).toFixed(3)
  document.getElementById('coord-lon').textContent = ((p.x / 100) * 180).toFixed(3)
  document.getElementById('coord-alt').textContent = Math.round(p.y * 10)

  const ms = Date.now() - startTime
  const ss = String(Math.floor(ms / 1000)   % 60).padStart(2, '0')
  const mm = String(Math.floor(ms / 60000)  % 60).padStart(2, '0')
  const hh = String(Math.floor(ms / 3600000)   ).padStart(2, '0')
  document.getElementById('mission-time').textContent = `T+ ${hh}:${mm}:${ss}`
}

// ─── Deposit detail ───────────────────────────────────────────────────────────

export function showDepositDetail(dep) {
  const col = TYPE_HEX[dep.type]
  document.getElementById('deposit-detail-content').innerHTML = `
    <div style="padding:14px 16px 12px;border-bottom:1px solid ${col}30;margin-bottom:4px;">
      <div style="color:${col};font-size:13px;letter-spacing:2px;margin-bottom:5px;text-shadow:0 0 12px ${col}60">${dep.name}</div>
      <div style="color:#4a6070;font-size:9px;letter-spacing:3px;">${dep.type.toUpperCase()} DEPOSIT</div>
    </div>
    <div class="detail-body">
      <div class="detail-row"><span class="label">QUANTITY</span><span class="value">${dep.quantity} ${dep.unit}</span></div>
      <div class="detail-row"><span class="label">GRADE</span><span class="value deposit-grade grade-${dep.grade}">${dep.grade}</span></div>
      <div class="detail-row"><span class="label">DEPTH</span><span class="value">${dep.depth}</span></div>
      <div class="detail-row"><span class="label">DEPOSIT ID</span><span class="value">SV-${String(dep.id).padStart(4, '0')}</span></div>
      <div class="detail-row"><span class="label">STATUS</span><span class="value" style="color:#40e068;">CONFIRMED</span></div>
    </div>`
  document.getElementById('deposit-detail').classList.remove('hidden')
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function _fadeOutLoading() {
  const el = document.getElementById('loading')
  if (!el) return
  el.classList.add('fade-out')
  setTimeout(() => el.remove(), 950)
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('close-detail')?.addEventListener('click', () =>
    document.getElementById('deposit-detail').classList.add('hidden'))

  document.getElementById('hud')?.addEventListener('click', (e) => {
    const panel = document.getElementById('deposit-detail')
    if (!panel.classList.contains('hidden') && !panel.contains(e.target))
      panel.classList.add('hidden')
  })
})
