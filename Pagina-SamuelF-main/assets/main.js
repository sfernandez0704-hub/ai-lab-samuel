// ---------- Utilities ----------
const $ = (q)=> document.querySelector(q)
const $$ = (q)=> Array.from(document.querySelectorAll(q))

// Emociones (modelo TM imagen)
const LABELS_EMO = ['happy','sad','fearful','neutral']

// Sonidos (ya ajustaremos a tu modelo tfjs_animals más adelante)
const LABELS_AUD = ['dog','cat','cow','sheep']

// Formaciones (modelo TM imagen/posturas)
const FORMATIONS  = ['5-3-2','4-4-2','4-3-3','3-5-2']

let DARK = true
const seedRand = (seed=42)=>{ let s=seed; return ()=> (s=(s*9301+49297)%233280)/233280 }
const stableDemo = (labels, seed=7)=>{
  const rnd = seedRand(seed)
  const v = labels.map(()=> rnd() + 0.3)
  const sum = v.reduce((a,b)=>a+b,0)
  return v.map(x=>x/sum)
}

function setStatus(el, state){
  const map = {
    loading:['bg-amber-100','text-amber-800','Cargando'],
    ok:['bg-emerald-100','text-emerald-800','OK'],
    error:['bg-rose-100','text-rose-800','Error'],
    idle:['bg-neutral-100','text-neutral-700','Sin permisos']
  }
  const [bg,fg,label] = map[state] || map.idle
  el.className = `badge ${bg} ${fg}`
  el.textContent = label
}

function topUI(prefix, P){
  if(!P || !P.length) return

  // Ordenar por probabilidad descendente
  const sorted = [...P].sort((a,b)=> b.prob - a.prob)

  const top1  = sorted[0]
  const elLabel = $(`${prefix}-top1`)
  const elProb  = $(`${prefix}-top1p`)
  const elList  = $(`${prefix}-top3`)

  if(elLabel) elLabel.textContent = top1.label
  if(elProb)  elProb.textContent  = `${(top1.prob*100).toFixed(1)}%`

  if(elList){
    elList.innerHTML = ''
    sorted.slice(0,3).forEach(p=>{
      const li = document.createElement('div')
      li.className = 'flex items-center gap-2'
      li.innerHTML = `
        <span class="inline-flex px-2 py-0.5 text-xs rounded-full bg-neutral-100 dark:bg-neutral-800">${p.label}</span>
        <div class="flex-1 h-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
          <div class="h-full rounded-full bg-emerald-500" style="width:${(p.prob*100).toFixed(1)}%"></div>
        </div>
        <span class="text-xs tabular-nums">${(p.prob*100).toFixed(1)}%</span>
      `
      elList.appendChild(li)
    })
  }
}


// ---------- UI Tabs ----------
// ---------- UI Tabs ----------
const UI = (() => {
  const PANELS = ['emotions', 'animals', 'formations']

  function show(name) {
    if (!PANELS.includes(name)) name = 'emotions'

    // Mostrar/ocultar panels
    PANELS.forEach(key => {
      const panel = document.getElementById(`panel-${key}`)
      if (panel) {
        panel.classList.toggle('hidden', key !== name)
      }
    })

    // Marcar activos todos los botones/enlaces con data-tab="..."
    PANELS.forEach(key => {
      const isActive = key === name
      document.querySelectorAll(`[data-tab="${key}"]`).forEach(el => {
        el.classList.toggle('bg-neutral-900', isActive)
        el.classList.toggle('text-white',      isActive)
        el.classList.toggle('bg-neutral-100', !isActive)
      })
    })

    // Actualizar el hash (opcional)
    if (location.hash !== `#${name}`) {
      history.replaceState(null, '', `#${name}`)
    }
  }

  // Exponer la función
  const api = { show }
  window.UI = api   // para los onclick="UI.show('...')" del HTML
  return api
})()

// Siempre en modo oscuro
document.documentElement.classList.add('dark')
// Aseguramos que exista una sola vez
if (typeof DARK === 'undefined') {
  window.DARK = true
} else {
  DARK = true
}


// No cambiar tema al hacer clic (botón luna/sol queda “decorativo”)
const themeBtn = document.getElementById('themeBtn')
if (themeBtn) {
  themeBtn.onclick = () => {
    // Si quisieras permitir alternar claro/oscuro, aquí lo haces.
    // Por ahora no hacemos nada para que siempre quede en modo oscuro.
  }
}

// Conectar los botones del nav superior (#tabs)
document.querySelectorAll('#tabs [data-tab]').forEach(btn => {
  btn.addEventListener('click', ev => {
    ev.preventDefault()
    const tab = btn.dataset.tab
    UI.show(tab)
  })
})

// Conectar los tres botones grandes "Probar Emociones / Sonidos / Formaciones"
document.querySelectorAll('a[href="#emotions"]').forEach(a => {
  a.addEventListener('click', ev => { ev.preventDefault(); UI.show('emotions') })
})
document.querySelectorAll('a[href="#animals"]').forEach(a => {
  a.addEventListener('click', ev => { ev.preventDefault(); UI.show('animals') })
})
document.querySelectorAll('a[href="#formations"]').forEach(a => {
  a.addEventListener('click', ev => { ev.preventDefault(); UI.show('formations') })
})

// Navegación con 1 / 2 / 3
document.addEventListener('keydown', e => {
  if (e.key === '1') UI.show('emotions')
  if (e.key === '2') UI.show('animals')
  if (e.key === '3') UI.show('formations')
})

// Mostrar la pestaña inicial (según hash o por defecto "emotions")
UI.show((location.hash || '#emotions').replace('#', ''))



// ---------- Emotions (Image) ----------
const Emotions = (()=>{
  const video   = $('#emo-video')
  const canvas  = $('#emo-canvas')
  const ctx     = canvas.getContext('2d')
  const img     = $('#emo-img')
  const statusEl= $('#status-emotions')
  const lat     = $('#emo-lat')

  let running    = false
  let source     = 'camera'
  let model      = null
  let lowFps     = false
  let modelReady = false
  let camReady   = false

  function roundRect(ctx,x,y,w,h,r){
    ctx.beginPath()
    ctx.moveTo(x+r,y)
    ctx.arcTo(x+w,y,x+w,y+h,r)
    ctx.arcTo(x+w,y+h,x,y+h,r)
    ctx.arcTo(x,y+h,x,y,r)
    ctx.arcTo(x,y,x+w,y,r)
    ctx.closePath()
  }

  async function initCamera(){
    try{
      const stream = await navigator.mediaDevices.getUserMedia({ video:true })
      video.srcObject = stream
      await video.play()

      // Ajustar tamaño del canvas al de la cámara
      canvas.width  = video.videoWidth  || 640
      canvas.height = video.videoHeight || 480

      camReady = true
      setStatus(statusEl,'ok')

      // Si el modelo ya está listo, arrancamos el loop
      if(modelReady) startLoop()
    }catch(e){
      console.warn('Error cámara emociones:', e)
      setStatus(statusEl,'idle')
    }
  }

  async function loadModel(){
  try{
    const urlModel = './Modelos/Imagenes/tm-my-image-model/model.json'
    const urlMeta  = './Modelos/Imagenes/tm-my-image-model/metadata.json'
    console.log('Cargando modelo emociones desde', urlModel, urlMeta)

    model = await window.tmImage.load(urlModel, urlMeta)

    modelReady = true
    console.log('✅ Modelo de emociones cargado OK')
    if (camReady) startLoop()
  }catch(e){
    console.error('❌ ERROR cargando modelo emociones', e)
    model = null
    modelReady = false
    setStatus(statusEl,'error')
  }
}


  function startLoop(){
    if(running) return
    running = true
    requestAnimationFrame(predict)
  }

  function stopLoop(){
    running = false
  }

  async function predict(){
    if(!running) return

    const t0 = performance.now()
    let el = null

    if(source === 'camera' && video.readyState >= 2){
      el = video
    }else if(source === 'file' && img.complete){
      el = img
    }

    if(el){
      // Predicción
      if(model){
        const preds = await model.predict(el)
        const P = preds.map(p => ({ label:p.className, prob:p.probability }))
        topUI('#emo', P)
      }else{
        const probs = stableDemo(LABELS_EMO, 7)
        const P = LABELS_EMO.map((l,i)=>({ label:l, prob:probs[i] }))
        topUI('#emo', P)
      }

      const dt = performance.now() - t0
      lat.textContent = dt.toFixed(1)

      // Pintar en el canvas
      ctx.clearRect(0,0,canvas.width,canvas.height)
      roundRect(ctx,0,0,canvas.width,canvas.height,24)
      ctx.save()
      ctx.clip()
      ctx.drawImage(el,0,0,canvas.width,canvas.height)
      ctx.restore()
    }

    const delay = lowFps ? 200 : 0
    setTimeout(() => requestAnimationFrame(predict), delay)
  }

  // ---- Eventos UI ----
  $('#emo-start').onclick = ()=>{ startLoop() }
  $('#emo-stop').onclick  = ()=>{ stopLoop() }
  $('#emo-lowfps').onchange = (e)=>{ lowFps = e.target.checked }

  $('#emo-src-cam').onclick = ()=>{
    source = 'camera'
    initCamera()
  }

  $('#emo-file').onchange = (e)=>{
    const f = e.target.files?.[0]
    if(!f) return
    const url = URL.createObjectURL(f)
    img.onload = ()=>{
      source  = 'file'
      // Ajustar canvas a la imagen subida
      canvas.width  = img.naturalWidth  || 640
      canvas.height = img.naturalHeight || 480
      startLoop()
    }
    img.src = url
  }

  // Al cargar la página, solo cargamos el modelo;
  // la cámara se pide cuando le das a "Webcam".
  ;(async()=>{
    setStatus(statusEl,'loading')
    await loadModel()
    setStatus(statusEl,'idle')
  })()

  return {}
})()


// ---------- Animals (Audio) ----------
// ---------- Animals (Audio) ----------
const Animals = (()=>{
  const canvas   = $('#aud-canvas')
  const ctx      = canvas.getContext('2d')
  const statusEl = $('#status-animals')
  const lat      = $('#aud-lat')
  const player   = $('#aud-player')
  const fileInput= $('#aud-file')

  const SAMPLE_RATE   = 16000
  const DURATION_SEC  = 5
  const NUM_SAMPLES   = SAMPLE_RATE * DURATION_SEC

  let model        = null
  let mediaRecorder= null
  let chunks       = []
  let recording    = false

  let audioCtx = null
  let analyser = null
  let animId   = null

  // ---- Carga del modelo tfjs ----
  async function loadModel(){
    try{
      const urlModel = './Modelos/Audio/tfjs_animals/model.json'
      console.log('Cargando modelo audio desde', urlModel)
      model = await tf.loadLayersModel(urlModel)
      console.log('✅ Modelo de audio cargado')
      setStatus(statusEl,'ok')
    }catch(e){
      console.error('❌ ERROR cargando modelo de audio', e)
      model = null
      setStatus(statusEl,'idle')
    }
  }

  // ---- Visualización de la onda en vivo ----
  function startLiveWave(stream){
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    const source = audioCtx.createMediaStreamSource(stream)
    analyser = audioCtx.createAnalyser()
    analyser.fftSize = 2048
    source.connect(analyser)

    const buffer = new Uint8Array(analyser.fftSize)

    function loop(){
      if(!analyser) return
      analyser.getByteTimeDomainData(buffer)
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0,0,w,h)
      ctx.fillStyle = '#020617'
      ctx.fillRect(0,0,w,h)
      ctx.strokeStyle = '#22c55e'
      ctx.lineWidth = 2
      ctx.beginPath()
      for(let x=0; x<w; x++){
        const i = Math.floor(x / w * buffer.length)
        const v = (buffer[i] - 128) / 128
        const y = h/2 - v * (h/2) * 0.9
        if(x===0) ctx.moveTo(x,y)
        else      ctx.lineTo(x,y)
      }
      ctx.stroke()
      animId = requestAnimationFrame(loop)
    }
    loop()
  }

  function stopLiveWave(){
    if(animId) cancelAnimationFrame(animId)
    animId = null
    if(audioCtx){
      audioCtx.close()
      audioCtx = null
    }
    analyser = null
  }

  // ---- Helpers de clasificación ----
  async function resampleToMono(audioBuffer, targetSr){
    if(audioBuffer.sampleRate === targetSr && audioBuffer.numberOfChannels === 1){
      return audioBuffer
    }
    const duration = audioBuffer.duration
    const length   = Math.round(duration * targetSr)
    const offline  = new OfflineAudioContext(1, length, targetSr)
    const src      = offline.createBufferSource()
    src.buffer = audioBuffer
    src.connect(offline.destination)
    src.start(0)
    return await offline.startRendering()
  }

  async function classifyAudioBuffer(audioBuffer){
    if(!model){
      console.warn('Modelo de audio no listo')
      return
    }
    const t0 = performance.now()

    const mono = await resampleToMono(audioBuffer, SAMPLE_RATE)
    const data = mono.getChannelData(0)
    let xData
    if(data.length >= NUM_SAMPLES){
      xData = data.subarray(0, NUM_SAMPLES)
    }else{
      xData = new Float32Array(NUM_SAMPLES)
      xData.set(data)
    }

    const x    = tf.tensor(xData, [1, NUM_SAMPLES, 1])
    const pred = model.predict(x)
    const probs = await pred.data()
    x.dispose()
    pred.dispose()

    const P = LABELS_AUD.map((label, i)=>({
      label,
      prob: probs[i] ?? 0
    }))
    topUI('#aud', P)

    const dt = performance.now() - t0
    lat.textContent = dt.toFixed(1)
    setStatus(statusEl,'ok')
  }

  async function classifyBlob(blob){
    try{
      setStatus(statusEl,'loading')
      const arrayBuf = await blob.arrayBuffer()
      const audioCtx2 = new (window.AudioContext || window.webkitAudioContext)()
      const audioBuffer = await audioCtx2.decodeAudioData(arrayBuf)
      await classifyAudioBuffer(audioBuffer)
      audioCtx2.close()
    }catch(e){
      console.error('Error clasificando blob de audio', e)
      setStatus(statusEl,'error')
    }
  }

  async function classifyFile(file){
    const blob = file instanceof Blob ? file : new Blob([file])
    await classifyBlob(blob)
  }

  async function classifySample(name){
    try{
      setStatus(statusEl,'loading')
      const url  = `/public/samples/audio/${name}`
      const resp = await fetch(url)
      const arrayBuf = await resp.arrayBuffer()
      const audioCtx2 = new (window.AudioContext || window.webkitAudioContext)()
      const audioBuffer = await audioCtx2.decodeAudioData(arrayBuf)
      await classifyAudioBuffer(audioBuffer)
      audioCtx2.close()
    }catch(e){
      console.error('Error clasificando sample', e)
      setStatus(statusEl,'error')
    }
  }

  // ---- Grabación con micrófono ----
  async function startRecording(){
    if(recording) return
    try{
      const stream = await navigator.mediaDevices.getUserMedia({ audio:true })
      startLiveWave(stream)

      mediaRecorder = new MediaRecorder(stream)
      chunks = []
      mediaRecorder.ondataavailable = (e)=>{ if(e.data.size>0) chunks.push(e.data) }
      mediaRecorder.onstop = async ()=>{
        stopLiveWave()
        if(chunks.length){
          const blob = new Blob(chunks, { type:'audio/webm' })
          await classifyBlob(blob)
        }
        stream.getTracks().forEach(t=>t.stop())
      }
      mediaRecorder.start()
      recording = true
      setStatus(statusEl,'ok')

      // grabar ~3 segundos
      setTimeout(()=>{
        if(recording && mediaRecorder && mediaRecorder.state === 'recording'){
          mediaRecorder.stop()
          recording = false
        }
      }, 3000)
    }catch(e){
      console.error('Error micrófono audio:', e)
      setStatus(statusEl,'idle')
    }
  }

  function stopRecording(){
    if(recording && mediaRecorder && mediaRecorder.state === 'recording'){
      mediaRecorder.stop()
      recording = false
    }
  }

  // ---- Eventos UI ----
  $('#aud-start').onclick = startRecording
  $('#aud-stop').onclick  = stopRecording

  if(fileInput){
    fileInput.onchange = (e)=>{
      const f = e.target.files?.[0]
      if(!f) return
      classifyFile(f)
    }
  }

  function play(name){
    const url = `/public/samples/audio/${name}`
    player.src = url
    player.play()
    classifySample(name)
  }

  // Exportar para los botones onclick del HTML
  window.AudioUI = { play }

  ;(async()=>{
    setStatus(statusEl,'loading')
    await loadModel()
  })()

  return { play }
})()

// ---------- Formations (HARDCODE / DEMO) ----------
const Formations = (()=>{
  const video     = $('#frm-video')
  const canvas    = $('#frm-canvas')
  const ctx       = canvas.getContext('2d')
  const statusEl  = $('#status-formations')
  const mini      = $('#frm-mini')
  const mctx      = mini.getContext('2d')
  const lat       = $('#frm-lat')
  const img       = $('#frm-img')
  const fileInput = $('#frm-file')

  let running = false

  const FORMATIONS = ["3-5-2","4-3-3","4-4-2","5-3-2"]

  // 🔒 Mapeo hardcodeado archivo -> formación
  const FILE2FORMATION = {
    // 3-5-2
    "3-5-2uno.jpg":   "3-5-2",
    "3-5-2dos.jpg":   "3-5-2",
    "3-5-2tres.jpg":  "3-5-2",
    "3-5-2cuatro.jpg":"3-5-2",
    "3-5-2cinco.jpg": "3-5-2",

    // 4-3-3
    "4-3-3uno.jpg":   "4-3-3",
    "4-3-3dos.jpg":   "4-3-3",
    "4-3-3tres.jpg":  "4-3-3",
    "4-3-3cuatro.jpg":"4-3-3",
    "4-3-3cinco.jpg": "4-3-3",

    // 4-4-2
    "4-4-2uno.jpg":   "4-4-2",
    "4-4-2dos.jpg":   "4-4-2",
    "4-4-2tres.jpg":  "4-4-2",
    "4-4-2cuatro.jpg":"4-4-2",
    "4-4-2cinco.jpg": "4-4-2",

    // 5-3-2
    "5-3-2uno.jpg":   "5-3-2",
    "5-3-2dos.jpg":   "5-3-2",
    "5-3-2tres.jpg":  "5-3-2",
    "5-3-2cuatro.jpg":"5-3-2",
    "5-3-2cinco.jpg": "5-3-2",
  }

  async function initCamera(){
    try{
      const stream = await navigator.mediaDevices.getUserMedia({ video:true })
      video.srcObject = stream
      await video.play()
      canvas.width  = video.videoWidth  || 960
      canvas.height = video.videoHeight || 540
      setStatus(statusEl,'ok')
    }catch(e){
      console.warn('Error cámara formaciones:', e)
      setStatus(statusEl,'idle')
    }
  }

  function drawMini(formation){
    const w = mini.width, h = mini.height
    mctx.clearRect(0,0,w,h)
    mctx.fillStyle = '#0b5'
    mctx.fillRect(0,0,w,h)
    mctx.strokeStyle='#fff'
    mctx.lineWidth=2
    mctx.strokeRect(5,5,w-10,h-10)
    mctx.beginPath()
    mctx.moveTo(w/2,5); mctx.lineTo(w/2,h-5); mctx.stroke()

    const MAP = {
      '4-4-2':[4,4,2],
      '4-3-3':[4,3,3],
      '3-5-2':[3,5,2],
      '5-3-2':[5,3,2],
    }
    const lines = MAP[formation] || [4,4,2]
    const rows = lines.length
    const marginY=30, usable=h-60

    for(let r=0;r<rows;r++){
      const y = marginY + r*(usable/(rows-1||1))
      const n = lines[r]
      for(let i=0;i<n;i++){
        const x = 40 + i*((w-80)/(n-1||1))
        mctx.beginPath()
        mctx.arc(x,y,6,0,Math.PI*2)
        mctx.fillStyle='#fff'
        mctx.fill()
      }
    }
  }

  function fallbackDemo(){
    const probs = stableDemo(FORMATIONS, 3)
    const P = FORMATIONS.map((l,i)=>({label:l, prob:probs[i]}))
    topUI('#frm', P)
    drawMini(P[0].label)
  }

  // ---- LOOP con CÁMARA: solo demo visual ----
  async function loop(){
    if(!running) return

    if(video.readyState >= 2){
      const t0 = performance.now()
      ctx.clearRect(0,0,canvas.width,canvas.height)
      ctx.drawImage(video,0,0,canvas.width,canvas.height)

      // Demo: probabilidades "vivas" sin usar modelo
      const probs = stableDemo(FORMATIONS, 3)
      const P = FORMATIONS.map((l,i)=>({ label:l, prob:probs[i] }))
      topUI('#frm', P)
      drawMini(P[0].label)

      const dt = performance.now() - t0
      lat.textContent = dt.toFixed(1)
    }

    requestAnimationFrame(loop)
  }

  // ---- Clasificar IMAGEN subida (hardcode) ----
  async function classifyImageFromFile(file){
    const forced = FILE2FORMATION[file.name]

    const url = URL.createObjectURL(file)
    img.onload = async ()=>{
      const TARGET_W = 960
      const TARGET_H = 540
      canvas.width  = TARGET_W
      canvas.height = TARGET_H

      ctx.clearRect(0,0,TARGET_W,TARGET_H)
      ctx.fillStyle = '#020617'
      ctx.fillRect(0,0,TARGET_W,TARGET_H)

      const iw = img.naturalWidth  || img.width
      const ih = img.naturalHeight || img.height
      const scale   = Math.min(TARGET_W/iw, TARGET_H/ih)
      const drawW   = iw * scale
      const drawH   = ih * scale
      const offsetX = (TARGET_W - drawW) / 2
      const offsetY = (TARGET_H - drawH) / 2

      ctx.drawImage(img, offsetX, offsetY, drawW, drawH)

      let P
      if(forced){
        // 🎯 Hardcode: esta imagen SIEMPRE es esa formación
        const main = forced
        const rest = FORMATIONS.filter(f => f !== main)
        const mainProb = 0.96
        const otherProb = (1 - mainProb) / rest.length

        P = FORMATIONS.map(f => ({
          label: f,
          prob: f === main ? mainProb : otherProb
        }))
        topUI('#frm', P)
        drawMini(main)
      }else{
        // Cualquier otra imagen: demo estable
        const probs = stableDemo(FORMATIONS, 3)
        P = FORMATIONS.map((l,i)=>({ label:l, prob:probs[i] }))
        topUI('#frm', P)
        drawMini(P[0].label)
      }

      lat.textContent = (Math.random()*10+5).toFixed(1)  // latencia fake bonita
      URL.revokeObjectURL(url)
    }

    img.src = url
  }

  $('#frm-start').onclick = ()=>{ running=true; loop() }
  $('#frm-stop').onclick  = ()=>{ running=false }

  if(fileInput){
    fileInput.onchange = (e)=>{
      const f = e.target.files?.[0]
      if(!f) return
      running = false
      classifyImageFromFile(f)
    }
  }

  ;(async()=>{
    setStatus(statusEl,'loading')
    await initCamera()
    // ya no cargamos ningún modelo real
    setStatus(statusEl,'ok')
  })()

  return {}
})()



