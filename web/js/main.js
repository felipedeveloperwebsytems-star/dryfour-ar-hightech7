let scene, camera, renderer, model, video;
let pigoInitialized = false;

async function init() {
    const statusEl = document.getElementById('status');
    video = document.getElementById('webcam');

    // 1. Inicialização da Câmera
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
            audio: false 
        });
        video.srcObject = stream;
        video.onloadedmetadata = () => video.play();
    } catch (err) {
        statusEl.innerText = "ERRO CÂMERA: " + err.name;
    }

    // 2. Configuração Three.js (Otimizada para Cores e Performance)
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    renderer = new THREE.WebGLRenderer({ 
        canvas: document.getElementById('canvas-ar'), 
        alpha: true,
        antialias: false 
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    
    // CORREÇÃO DE COR: Essencial para texturas GLB aparecerem corretamente
    renderer.outputEncoding = THREE.sRGBEncoding;

    // ILUMINAÇÃO REFORÇADA: Para evitar que o objeto fique preto
    const ambientLight = new THREE.AmbientLight(0xffffff, 2.5); // Luz geral forte
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0xffffff, 2); // Luz de brilho (reflexo)
    pointLight.position.set(5, 5, 5);
    scene.add(pointLight);

    camera.position.z = 5;

    // 3. CARREGAMENTO DO MODELO GLB com Correção de Material
    const loader = new THREE.GLTFLoader();
    loader.load('assets/models/bola.glb', function (gltf) {
        model = gltf.scene;

        // Script de Aperfeiçoamento de Material (Caso a textura falhe ou fique escura)
        model.traverse(function (child) {
            if (child.isMesh) {
                // Se o objeto estiver muito escuro, garantimos um vermelho natalino metálico
                if (child.material) {
                    child.material.metalness = 0.7; // Brilho metálico
                    child.material.roughness = 0.2; // Superfície lisa/polida
                    
                    // Se você quiser forçar a cor vermelha da DryFour:
                    // child.material.color.set(0xff0000); 
                }
            }
        });

        model.scale.set(1.5, 1.5, 1.5);
        scene.add(model);
        statusEl.innerText = "BOLA CARREGADA";
        console.log("Sucesso: Modelo GLB com materiais otimizados.");
    }, undefined, function (error) {
        console.error("Erro detalhado no GLB:", error);
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshNormalMaterial();
        model = new THREE.Mesh(geometry, material);
        scene.add(model);
    });

    // 4. Inicialização WASM (Go)
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
        animate();
    } catch (e) {
        statusEl.innerText = "ERRO WASM";
    }
}

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
    if (model) model.rotation.y += 0.01;
    renderer.render(scene, camera);
}
window.onload = init;
