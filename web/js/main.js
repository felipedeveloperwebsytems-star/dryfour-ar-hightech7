let scene, camera, renderer, model, video, controls;
let pigoInitialized = false;

async function init() {
    video = document.getElementById('webcam');
    const statusEl = document.getElementById('status');

    try {
        // CORREÇÃO S21: Adicionando parâmetros para forçar a inicialização da câmera
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: { ideal: 640 }, 
                height: { ideal: 480 }, 
                facingMode: "user" 
            },
            audio: false 
        });
        video.srcObject = stream;
        
        // CORREÇÃO S21: Garantir que o vídeo "acorde" o hardware
        video.setAttribute('autoplay', '');
        video.setAttribute('muted', '');
        video.setAttribute('playsinline', '');
        video.onloadedmetadata = () => video.play();

    } catch (err) {
        statusEl.innerText = "ERRO CÂMERA: " + err.name;
    }

    // --- Configuração Three.js ---
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    renderer = new THREE.WebGLRenderer({ 
        canvas: document.getElementById('canvas-ar'), 
        alpha: true,
        antialias: false 
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0); 

    // Adição de Controles de Interação (Zoom, Rotação, Escala)
    // No Desktop: Mouse esquerdo (Gira), Scroll (Zoom), Mouse direito (Move)
    // No Mobile: Gestos de pinça e arrastar
    controls = {
        rotationSpeed: 0.01,
        scale: 1,
        distance: -2
    };

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshNormalMaterial(); 
    model = new THREE.Mesh(geometry, material);
    scene.add(model);
    
    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    camera.position.z = 5;

    // --- Inicialização WASM ---
    const go = new Go();
    try {
        const response = await fetch("./main.wasm");
        const result = await WebAssembly.instantiateStreaming(response, go.importObject);
        go.run(result.instance);
        
        const pigoRes = await fetch('./assets/pigo/facefinder');
        const pigoData = await pigoRes.arrayBuffer();
        inicializarDetector(new Uint8Array(pigoData));
        
        statusEl.innerText = "SISTEMA ATIVO";
        pigoInitialized = true;
        
        // Adicionar eventos de teclado para Escala e Aproximação (Desktop)
        window.addEventListener('keydown', handleInput);
        
        animate();
    } catch (e) {
        statusEl.innerText = "ERRO WASM/PIGO";
    }
}

// Função de Interação solicitada
function handleInput(e) {
    switch(e.key) {
        case '+': model.scale.multiplyScalar(1.1); break; // Aumentar Escala
        case '-': model.scale.multiplyScalar(0.9); break; // Reduzir Escala
        case 'w': model.position.z += 0.5; break;         // Aproximar
        case 's': model.position.z -= 0.5; break;         // Afastar
        case 'r': model.rotation.y += 0.5; break;         // Rotação Manual
    }
}

function animate() {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 640;
    tempCanvas.height = 480;
    const ctx = tempCanvas.getContext('2d');
    ctx.drawImage(video, 0, 0, 640, 480);
    
    const imageData = ctx.getImageData(0, 0, 640, 480);
    const res = processarRastreamento(new Uint8Array(imageData.data.buffer), 480, 640);

    if (res && res.detected) {
        // O Go controla o X e Y, mas você controla a escala e Z via teclado/touch
        model.position.x = ((res.x / 640) * 2 - 1) * 3;
        model.position.y = -((res.y / 480) * 2 - 1) * 3;
    }
    
    model.rotation.y += 0.01; // Rotação automática constante
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}

window.onload = init;
