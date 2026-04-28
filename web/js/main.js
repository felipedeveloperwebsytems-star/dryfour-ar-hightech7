let scene, camera, renderer, model, video, canvas;
let pigoInitialized = false;
let currentFacingMode = "user";
let isSwitchingCamera = false;

const productDatabase = {
    "bola": { path: 'assets/models/bola.glb', scale: 1.5, y: 0 },
    "carteira": { path: 'assets/models/carteira.glb', scale: 2.0, y: -0.5 },
    "estrela": { path: 'assets/models/estrela.glb', scale: 1.2, y: 0.2 },
    "sino": { path: 'assets/models/sino.glb', scale: 1.8, y: -0.3 }
};

window.move = (axis, val) => { if(model) model.position[axis] += val; };
window.updateScale = (val) => { if(model) model.scale.multiplyScalar(val); };
window.rotate = (axis, val) => { if(model) model.rotation[axis] += val; };

// --- CORREÇÃO DE ASPECT RATIO PARA PAISAGEM ---
window.addEventListener('resize', onWindowResize, false);
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

window.performSearch = () => {
    const term = document.getElementById('search-input').value.toLowerCase().trim();
    if (productDatabase[term]) {
        loadModel(term);
        document.getElementById('search-input').blur();
    } else {
        document.getElementById('status').innerText = "NÃO ENCONTRADO";
    }
};

window.handleSearchKeyPress = (e) => { if (e.key === 'Enter') performSearch(); };

function loadModel(name) {
    const data = productDatabase[name];
    if (model) scene.remove(model);
    new THREE.GLTFLoader().load(data.path, gltf => {
        model = gltf.scene;
        model.traverse(c => { if(c.isMesh){ c.material.metalness=0.7; c.material.roughness=0.2; }});
        model.scale.set(data.scale, data.scale, data.scale);
        model.position.y = data.y;
        scene.add(model);
        document.getElementById('status').innerText = name + " // ATIVO";
    });
}

window.toggleCamera = async () => {
    if (isSwitchingCamera) return;
    isSwitchingCamera = true;
    currentFacingMode = (currentFacingMode === "user") ? "environment" : "user";
    document.getElementById('status').innerText = "AGUARDE...";
    if (video.srcObject) video.srcObject.getTracks().forEach(t => t.stop());
    await new Promise(r => setTimeout(r, 1000));
    try {
        await startVideo();
        video.style.transform = (currentFacingMode === "user") ? "scaleX(-1)" : "scaleX(1)";
        document.getElementById('btn-camera').innerText = (currentFacingMode === "user") ? "BACK" : "FRONT";
        document.getElementById('status').innerText = "CÂMERA OK";
    } finally { isSwitchingCamera = false; }
};

async function startVideo() {
    const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: currentFacingMode } 
    });
    video.srcObject = stream;
    await video.play();
}

function setupTouchEvents() {
    let lastX, lastY, initialDist;
    canvas = document.getElementById('canvas-ar');
    canvas.addEventListener('touchstart', e => {
        if (e.touches.length === 1) { lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; }
        else if (e.touches.length === 2) initialDist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
    }, {passive: false});
    canvas.addEventListener('touchmove', e => {
        if (!model || e.target.id === 'search-input') return;
        e.preventDefault();
        if (e.touches.length === 1) {
            model.rotation.y += (e.touches[0].clientX - lastX) * 0.01;
            model.position.y -= (e.touches[0].clientY - lastY) * 0.01;
            lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
            const dist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
            model.scale.multiplyScalar(dist > initialDist ? 1.02 : 0.98);
            initialDist = dist;
        }
    }, {passive: false});
}

async function init() {
    video = document.getElementById('webcam');
    await startVideo();
    scene = new THREE.Scene();
    // Aumento do FOV de 75 para 80 para cobrir melhor as laterais em landscape
    camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('canvas-ar'), alpha: true, antialias: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    scene.add(new THREE.AmbientLight(0xffffff, 2.5));
    camera.position.z = 5;
    loadModel("bola");
    const go = new Go();
    const result = await WebAssembly.instantiateStreaming(await fetch("main.wasm"), go.importObject);
    go.run(result.instance);
    inicializarDetector(new Uint8Array(await (await fetch('assets/pigo/facefinder')).arrayBuffer()));
    pigoInitialized = true;
    window.addEventListener('keydown', e => {
        if (document.activeElement.id === 'search-input') return;
        const s=0.5, r=0.2;
        switch(e.key) {
            case 'ArrowUp': model.position.z += s; break;
            case 'ArrowDown': model.position.z -= s; break;
            case 'ArrowLeft': model.position.x -= s; break;
            case 'ArrowRight': model.position.x += s; break;
            case 'x': model.rotation.x += r; break;
            case 'z': model.rotation.x -= r; break;
        }
    });
    setupTouchEvents();
    animate();
}

function animate() {
    requestAnimationFrame(animate);
    if (pigoInitialized && video.readyState === video.HAVE_ENOUGH_DATA) {
        const c = document.createElement('canvas'); c.width = 640; c.height = 480;
        const ctx = c.getContext('2d'); ctx.drawImage(video, 0, 0, 640, 480);
        const res = processarRastreamento(new Uint8Array(ctx.getImageData(0,0,640,480).data.buffer), 480, 640);
        // Frustum culling bypass: Garante que o modelo não desapareça nas bordas
        if (model) model.frustumCulled = false;
        if (res && res.detected && model) {
            model.position.x = ((res.x/640)*2-1)*3;
            model.position.y = -((res.y/480)*2-1)*3;
        }
    }
    if (model) model.rotation.y += 0.005;
    renderer.render(scene, camera);
}
window.onload = init;