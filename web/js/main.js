let scene, camera, renderer, model, video, controls;
let pigoInitialized = false;

async function init() {
    video = document.getElementById('webcam');
    const statusEl = document.getElementById('status');

    try {
        // CORREÇÃO S21: Parâmetros para forçar a inicialização da câmera via HTTPS
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: { ideal: 640 }, 
                height: { ideal: 480 }, 
                facingMode: "user" 
            },
            audio: false 
        });
        video.srcObject = stream;
        
        // Garantir que o hardware mobile acorde
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

    // Iluminação Profissional para os modelos da DryFour
    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(0, 1, 2);
    scene.add(dirLight);

    camera.position.z = 5;

    // --- Carregamento da Bola.glb (Substituindo o Cubo) ---
    const loader = new THREE.GLTFLoader();
    loader.load('./assets/models/bola.glb', function (gltf) {
        model = gltf.scene;
        model.scale.set(1.5, 1.5, 1.5); // Escala ideal para visualização
        model.position.set(0, 0, 0);
        scene.add(model);
        console.log("DryFour AR: bola.glb carregada!");
    }, undefined, function (error) {
        console.error("Erro ao carregar modelo:", error);
    });

    // --- Inicialização WASM do Go ---
    const go = new Go();
    try {
        const response = await fetch("./main.wasm");
        const result = await WebAssembly.instantiateStreaming(response, go.importObject);
        go.run(result.instance);
        
        // Carrega o classificador de face
        const pigoRes = await fetch('./assets/pigo/facefinder');
        const pigoData = await pigoRes.arrayBuffer();
        inicializarDetector(new Uint8Array(pigoData));
        
        statusEl.innerText = "SISTEMA ATIVO";
        pigoInitialized = true;
        
        // Eventos de teclado para o seu i3 (Desktop)
        window.addEventListener('keydown', handleInput);
        
        animate();
    } catch (e) {
        statusEl.innerText = "ERRO WASM/PIGO";
    }
}

// Função de Interação: Escala, Rotação e Z
function handleInput(e) {
    if (!model) return;
    switch(e.key) {
        case '+': model.scale.multiplyScalar(1.1); break;
        case '-': model.scale.multiplyScalar(0.9); break;
        case 'w': model.position.z += 0.5; break;
        case 's': model.position.z -= 0.5; break;
        case 'r': model.rotation.y += 0.5; break;
    }
}

function animate() {
    // Processamento do Rastreamento Facial em tempo real
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 640;
    tempCanvas.height = 480;
    const ctx = tempCanvas.getContext('2d');
    ctx.drawImage(video, 0, 0, 640, 480);
    
    const imageData = ctx.getImageData(0, 0, 640, 480);
    const res = processarRastreamento(new Uint8Array(imageData.data.buffer), 480, 640);

    if (res && res.detected && model) {
        model.visible = true;
        // Mapeamento das coordenadas do Go para o mundo 3D
        model.position.x = ((res.x / 640) * 2 - 1) * 3;
        model.position.y = -((res.y / 480) * 2 - 1) * 3;
    }
    
    if (model) model.rotation.y += 0.01; // Rotação constante de vitrine
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}

window.onload = init;
