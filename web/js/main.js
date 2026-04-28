let scene, camera, renderer, model, video, canvas;
let pigoInitialized = false;
let currentFacingMode = "user";
let isSwitchingCamera = false;

// --- CONFIGURAÇÃO DO BANCO DE DADOS DE PRODUTOS (DryFour Shopping) ---
const productDatabase = {
    "bola": { path: 'assets/models/bola.glb', scale: 1.5, yOffset: 0 },
    "carteira": { path: 'assets/models/carteira.glb', scale: 2.0, yOffset: -0.5 },
    "estrela": { path: 'assets/models/estrela.glb', scale: 1.2, yOffset: 0.2 },
    "sino": { path: 'assets/models/sino.glb', scale: 1.8, yOffset: -0.3 }
};
let currentProductName = "bola"; // Produto inicial

// Funções de Controle Global (Botões)
window.move = (axis, val) => { if(model) model.position[axis] += val; };
window.updateScale = (val) => { if(model) model.scale.multiplyScalar(val); };
window.rotate = (axis, val) => { if(model) model.rotation[axis] += val; };

// --- SISTEMA DE PESQUISA E TROCA DE MODELO ---
window.performSearch = () => {
    const input = document.getElementById('search-input');
    const searchTerm = input.value.toLowerCase().trim();
    const statusEl = document.getElementById('status');

    if (productDatabase[searchTerm]) {
        statusEl.innerText = `CARREGANDO ${searchTerm.toUpperCase()}...`;
        loadModel(searchTerm);
        input.value = ""; // Limpa a barra
        input.blur(); // Tira o foco para esconder o teclado mobile
    } else {
        statusEl.innerText = "PRODUTO NÃO ENCONTRADO";
        input.style.borderColor = "#f00"; // Feedback de erro vermelho
        setTimeout(() => input.style.borderColor = "#0f0", 1500);
    }
};

// Atalho 'Enter' na pesquisa
window.handleSearchKeyPress = (e) => {
    if (e.key === 'Enter') performSearch();
};

// Função Genérica de Carregamento de Modelo
function loadModel(productKey) {
    const product = productDatabase[productKey];
    if (!product) return;

    const statusEl = document.getElementById('status');
    const loader = new THREE.GLTFLoader();

    // 1. Remove o modelo anterior da cena para poupar memória (32MB HD Graphics)
    if (model) {
        scene.remove(model);
        // Idealmente, libertar geometria e materiais aqui para otimização agressiva
    }

    // 2. Carrega o novo modelo
    loader.load(product.path, function (gltf) {
        model = gltf.scene;
        
        // Aplica materiais otimizados (brilho DryFour)
        model.traverse(child => { 
            if (child.isMesh) { 
                child.material.metalness = 0.7; 
                child.material.roughness = 0.2; 
                child.material.envMapIntesity = 1.0;
            } 
        });

        // Aplica configurações específicas do banco de dados
        model.scale.set(product.scale, product.scale, product.scale);
        model.position.set(0, product.yOffset, 0); // Ajusta altura inicial
        
        scene.add(model);
        currentProductName = productKey;
        statusEl.innerText = `${productKey.toUpperCase()} CARREGADO // ATIVO`;
        console.log(`Sucesso: ${productKey} carregado.`);
    }, undefined, function (error) {
        console.error("Erro no carregamento:", error);
        statusEl.innerText = "ERRO NO MODELO 3D";
        // Fallback para cubo
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        model = new THREE.Mesh(geometry, new THREE.MeshNormalMaterial());
        scene.add(model);
    });
}


// --- TROCA DE CÂMERA BLINDADA (S21) ---
window.toggleCamera = async () => {
    if (isSwitchingCamera) return; 
    isSwitchingCamera = true;
    currentFacingMode = (currentFacingMode === "user") ? "environment" : "user";
    const btn = document.getElementById('btn-camera');
    const statusEl = document.getElementById('status');
    
    btn.disabled = true;
    btn.innerText = "WAIT...";
    statusEl.innerText = "REINICIANDO SENSORES...";

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
    } catch (e) {
        statusEl.innerText = "ERRO FATAL CÂMERA";
    } finally {
        btn.disabled = false;
        isSwitchingCamera = false;
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

// --- INTERAÇÕES TOUCH (Mobile Premium) ---
function setupTouchEvents() {
    let lastTouchX = 0;
    let lastTouchY = 0;
    let initialPinchDistance = null;

    canvas = document.getElementById('canvas-ar');

    canvas.addEventListener('touchstart', e => {
        if (e.touches.length === 1) {
            lastTouchX = e.touches[0].clientX;
            lastTouchY = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
            initialPinchDistance = Math.hypot(
                e.touches[0].pageX - e.touches[1].pageX,
                e.touches[0].pageY - e.touches[1].pageY
            );
        }
    }, {passive: false});

    canvas.addEventListener('touchmove', e => {
        if (!model) return;
        
        // Se o toque começou na barra de pesquisa, não move o 3D
        if (e.target.id === 'search-input') return;

        e.preventDefault(); 

        if (e.touches.length === 1) {
            let deltaX = e.touches[0].clientX - lastTouchX;
            let deltaY = e.touches[0].clientY - lastTouchY;
            model.rotation.y += deltaX * 0.01;
            model.position.y -= deltaY * 0.01;
            lastTouchX = e.touches[0].clientX;
            lastTouchY = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
            const currentDistance = Math.hypot(
                e.touches[0].pageX - e.touches[1].pageX,
                e.touches[0].pageY - e.touches[1].pageY
            );
            if (initialPinchDistance) {
                const factor = currentDistance / initialPinchDistance;
                if (factor > 1) model.scale.multiplyScalar(1.02);
                else model.scale.multiplyScalar(0.98);
                initialPinchDistance = currentDistance;
            }
        }
    }, {passive: false});
}

// --- INICIALIZAÇÃO PRINCIPAL ---
async function init() {
    const statusEl = document.getElementById('status');
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

    // Carrega o modelo inicial (bola) usando a nova função genérica
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
    } catch (e) {
        statusEl.innerText = "ERRO WASM";
    }
}

function handleInput(e) {
    if (!model) return;
    const s = 0.5;
    // Impede que comandos de teclado funcionem se o usuário estiver digitando na pesquisa
    if (document.activeElement.id === 'search-input') return;

    switch(e.key) {
        case 'w': case 'ArrowUp': model.position.z += s; break;
        case 's': case 'ArrowDown': model.position.z -= s; break;
        case 'a': case 'ArrowLeft': model.position.x -= s; break;
        case 'd': case 'ArrowRight': model.position.x += s; break;
        case '+': case '=': model.scale.multiplyScalar(1.1); break;
        case '-': case '_': model.scale.multiplyScalar(0.9); break;
        case 'r': model.rotation.y += 0.5; break;
    }
}

function animate() {
    requestAnimationFrame(animate);
    if (pigoInitialized && video.readyState === video.HAVE_ENOUGH_DATA) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 640;
        tempCanvas.height = 480;
        const ctx = tempCanvas.getContext('2d');
        ctx.drawImage(video, 0, 0, 640, 480);
        const imageData = ctx.getImageData(0, 0, 640, 480);
        const res = processarRastreamento(new Uint8Array(imageData.data.buffer), 480, 640);
        if (res && res.detected && model) {
            model.position.x = ((res.x / 640) * 2 - 1) * 3;
            model.position.y = -((res.y / 480) * 2 - 1) * 3;
        }
    }
    // Rotação automática suave (Estilo vitrine)
    if (model) model.rotation.y += 0.005;
    renderer.render(scene, camera);
}
window.onload = init;