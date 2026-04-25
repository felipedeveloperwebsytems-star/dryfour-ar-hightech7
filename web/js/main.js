let scene, camera, renderer, model, video;
let pigoInitialized = false;

async function init() {
    // 1. Verificação de Segurança: Garante que as bibliotecas externas carregaram
    if (typeof THREE === 'undefined' || typeof THREE.GLTFLoader === 'undefined') {
        console.warn("Aguardando carregamento do Three.js e GLTFLoader...");
        setTimeout(init, 100);
        return;
    }

    video = document.getElementById('webcam');
    const statusEl = document.getElementById('status');

    // 2. Inicialização da Câmera (Otimizado para Mobile/S21 via HTTPS)
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
            audio: false 
        });
        video.srcObject = stream;
        
        video.setAttribute('autoplay', '');
        video.setAttribute('muted', '');
        video.setAttribute('playsinline', '');
        video.onloadedmetadata = () => video.play();
    } catch (err) {
        statusEl.innerText = "ERRO CÂMERA: " + err.name;
    }

    // 3. Configuração do Motor 3D (Otimizado para Intel HD 32MB)
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    renderer = new THREE.WebGLRenderer({ 
        canvas: document.getElementById('canvas-ar'), 
        alpha: true,
        antialias: false // Performance ganha no hardware antigo
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limita a resolução para não travar a GPU

    // Iluminação Profissional para o Modelo
    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(0, 1, 2);
    scene.add(dirLight);

    camera.position.z = 5;

    // 4. Carregamento do Modelo GLB (Bola)
    const loader = new THREE.GLTFLoader();
    loader.load('assets/models/bola.glb', function (gltf) {
        model = gltf.scene;
        model.scale.set(1.5, 1.5, 1.5);
        scene.add(model);
        statusEl.innerText = "BOLA CARREGADA";
    }, undefined, function (error) {
        console.error("Erro ao carregar GLB:", error);
        // Fallback: Cubo de segurança caso o arquivo falhe
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshNormalMaterial();
        model = new THREE.Mesh(geometry, material);
        scene.add(model);
    });

    // 5. Inicialização do Motor Go (WebAssembly)
    const go = new Go();
    try {
        const response = await fetch("main.wasm");
        const result = await WebAssembly.instantiateStreaming(response, go.importObject);
        go.run(result.instance);
        
        // Carrega o detector de faces Pigo
        const pigoRes = await fetch('assets/pigo/facefinder');
        const pigoData = await pigoRes.arrayBuffer();
        inicializarDetector(new Uint8Array(pigoData));
        
        pigoInitialized = true;
        statusEl.innerText = "SISTEMA ATIVO";
        
        // Ativa controles de teclado para o Desktop
        window.addEventListener('keydown', handleInput);
        animate();
    } catch (e) {
        statusEl.innerText = "ERRO WASM/PIGO";
        console.error(e);
    }
}

// 6. Função de Interação (Escala, Posição e Rotação)
function handleInput(e) {
    if (!model) return;
    const s = 0.5;
    const key = e.key.toLowerCase();
    
    switch(key) {
        case '+': case '=': model.scale.multiplyScalar(1.1); break;
        case '-': case '_': model.scale.multiplyScalar(0.9); break;
        case 'w': model.position.z += s; break;
        case 's': model.position.z -= s; break;
        case 'a': model.position.x -= s; break;
        case 'd': model.position.x += s; break;
        case 'r': model.rotation.y += 0.5; break;
    }
}

// 7. Loop de Animação e Rastreamento
function animate() {
    requestAnimationFrame(animate);
    
    if (pigoInitialized && video.readyState === video.HAVE_ENOUGH_DATA) {
        // Captura frame da webcam para o processamento em Go
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 640;
        tempCanvas.height = 480;
        const ctx = tempCanvas.getContext('2d');
        ctx.drawImage(video, 0, 0, 640, 480);
        
        const imageData = ctx.getImageData(0, 0, 640, 480);
        const res = processarRastreamento(new Uint8Array(imageData.data.buffer), 480, 640);

        // Se o Go detectar o rosto, move o modelo 3D
        if (res && res.detected && model) {
            model.position.x = ((res.x / 640) * 2 - 1) * 3;
            model.position.y = -((res.y / 480) * 2 - 1) * 3;
        }
    }
    
    // Rotação suave de vitrine (DryFour Shopping)
    if (model) model.rotation.y += 0.01;
    
    renderer.render(scene, camera);
}

// Inicia o sistema
window.onload = init;
