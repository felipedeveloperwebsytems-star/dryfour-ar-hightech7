let scene, camera, renderer, model, video, canvas;
let pigoInitialized = false;
let currentFacingMode = "user";
let isSwitchingCamera = false;

const productDatabase = {
    "bola": { path: 'assets/models/bola.glb', scale: 1.5, yOffset: 0 },
    "carteira": { path: 'assets/models/carteira.glb', scale: 2.0, yOffset: -0.5 },
    "estrela": { path: 'assets/models/estrela.glb', scale: 1.2, yOffset: 0.2 },
    "sino": { path: 'assets/models/sino.glb', scale: 1.8, yOffset: -0.3 }
};
let currentProductName = "bola";

// Funções de Controle Global
window.move = (axis, val) => { if(model) model.position[axis] += val; };
window.updateScale = (val) => { if(model) model.scale.multiplyScalar(val); };
window.rotate = (axis, val) => { if(model) model.rotation[axis] += val; };

// --- CORREÇÃO DE REDIMENSIONAMENTO (Evita tela comprimida) ---
window.addEventListener('resize', () => {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- SISTEMA DE PESQUISA ---
window.performSearch = () => {
    const input = document.getElementById('search-input');
    const searchTerm = input.value.toLowerCase().trim();
    const statusEl = document.getElementById('status');

    if (productDatabase[searchTerm]) {
        statusEl.innerText = `CARREGANDO ${searchTerm.toUpperCase()}...`;
        loadModel(searchTerm);
        input.value = "";
        input.blur();
    } else {
        statusEl.innerText = "NÃO ENCONTRADO";
        input.style.borderColor = "#f00";
        setTimeout(() => input.style.borderColor = "#0f0", 1500);
    }
};

window.handleSearchKeyPress = (e) => { if (e.key === 'Enter') performSearch(); };

function loadModel(productKey) {
    const product = productDatabase[productKey];
    if (!product) return;
    const loader = new THREE.GLTFLoader();
    if (model) scene.remove(model);

    loader.load(product.path, function (gltf) {
        model = gltf.scene;
        model.traverse(child => { 
            if (child.isMesh) { 
                child.material.metalness = 0.7; 
                child.material.roughness = 0.2; 
                child.material.envMapIntensity = 1.0;
            } 
        });
        model.scale.set(product.scale, product.scale, product.scale);
        model.position.set(0, product.yOffset, 0);
        model.frustumCulled = false; // Impede sumiço nas bordas
        scene.add(model);
        document.getElementById('status').innerText = `${productKey.toUpperCase()} ATIVO`;
    });
}

// --- CONTROLE DE CÂMERA ---
window.toggleCamera = async () => {
    if (isSwitchingCamera) return; 
    isSwitchingCamera = true;
    currentFacingMode = (currentFacingMode === "user") ? "environment" : "user";
    const btn = document.getElementById('btn-camera');
    const statusEl = document.getElementById('status');
    btn.disabled = true; btn.innerText = "WAIT...";
    
    if (video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
    try {
        await startVideo();
        video.style.transform = (currentFacingMode === "user") ? "scaleX(-1)" : "scaleX(1)";
        btn.innerText = (currentFacingMode === "user") ? "BACK" : "FRONT";
        statusEl.innerText = "CÂMERA ATIVA";
    } finally {
        btn.disabled = false; isSwitchingCamera = false;
    }
};

async function startVideo() {
    const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: currentFacingMode },
        audio: false 
    });
    video.srcObject = stream;
    await video.play();
}

// --- INTERAÇÕES TOUCH RESTAURADAS ---
function setupTouchEvents() {
    let lastTouchX = 0, lastTouchY = 0, initialPinchDistance = null;
    canvas = document.getElementById('canvas-ar');

    canvas.addEventListener('touchstart', e => {
        if (e.touches.length === 1) {
            lastTouchX = e.touches[0].clientX; lastTouchY = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
            initialPinchDistance = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
        }
    }, {passive: false});

    canvas.addEventListener('touchmove', e => {
        if (!model || e.target.id === 'search-input') return;
        e.preventDefault(); 
        if (e.touches.length === 1) {
            model.rotation.y += (e.touches[0].clientX - lastTouchX) * 0.01;
            model.position.y -= (e.touches[0].clientY - lastTouchY) * 0.01;
            lastTouchX = e.touches[0].clientX; lastTouchY = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
            const currentDistance = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
            if (initialPinchDistance) {
                model.scale.multiplyScalar(currentDistance / initialPinchDistance > 1 ? 1.02 : 0.98);
                initialPinchDistance = currentDistance;
            }
        }
    }, {passive: false});
}

// --- INICIALIZAÇÃO E TECLADO RESTAURADO ---
async function init() {
    video = document.getElementById('webcam');
    await startVideo();
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('canvas-ar'), alpha: true, antialias: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;

    scene.add(new THREE.AmbientLight(0xffffff, 2.5));
    const pointLight = new THREE.PointLight(0xffffff, 2);
    pointLight.position.set(5, 5, 5);
    scene.add(pointLight);

    camera.position.z = 5;
    loadModel(currentProductName);

    const go = new Go();
    try {
        const response = await fetch("main.wasm");
        const result = await WebAssembly.instantiateStreaming(response, go.importObject);
        go.run(result.instance);
        const pigoRes = await fetch('assets/pigo/facefinder');
        const pigoData = await pigoRes.arrayBuffer();
        inicializarDetector(new Uint8Array(pigoData));
        pigoInitialized = true;
        
        window.addEventListener('keydown', handleInput);
        setupTouchEvents();
        animate();
    } catch (e) { document.getElementById('status').innerText = "ERRO WASM"; }
}

function handleInput(e) {
    if (!model || document.activeElement.id === 'search-input') return;
    const s = 0.5, r = 0.2;
    switch(e.key.toLowerCase()) {
        case 'w': case 'arrowup': model.position.z += s; break;
        case 's': case 'arrowdown': model.position.z -= s; break;
        case 'a': case 'arrowleft': model.position.x -= s; break;
        case 'd': case 'arrowright': model.position.x += s; break;
        case '+': case '=': model.scale.multiplyScalar(1.1); break;
        case '-': case '_': model.scale.multiplyScalar(0.9); break;
        case 'r': model.rotation.y += 0.5; break;
    }
}

function animate() {
    requestAnimationFrame(animate);
    if (pigoInitialized && video.readyState === video.HAVE_ENOUGH_DATA) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 640; tempCanvas.height = 480;
        const ctx = tempCanvas.getContext('2d');
        ctx.drawImage(video, 0, 0, 640, 480);
        const res = processarRastreamento(new Uint8Array(ctx.getImageData(0,0,640,480).data.buffer), 480, 640);
        if (res && res.detected && model) {
            model.position.x = ((res.x / 640) * 2 - 1) * 3;
            model.position.y = -((res.y / 480) * 2 - 1) * 3;
        }
    }
    if (model) model.rotation.y += 0.005;
    renderer.render(scene, camera);
}
window.onload = init;