let scene, camera, renderer, model, video, canvas;
let pigoInitialized = false;
let currentFacingMode = "user";
let isSwitchingCamera = false;

// Funções de Controle Global (Botões)
window.move = (axis, val) => { if(model) model.position[axis] += val; };
window.updateScale = (val) => { if(model) model.scale.multiplyScalar(val); };
window.rotate = (axis, val) => { if(model) model.rotation[axis] += val; };

// --- TROCA DE CÂMERA BLINDADA (S21) ---
window.toggleCamera = async () => {
    if (isSwitchingCamera) return; 
    isSwitchingCamera = true;
    currentFacingMode = (currentFacingMode === "user") ? "environment" : "user";
    const btn = document.getElementById('btn-camera');
    const statusEl = document.getElementById('status');
    btn.innerText = "AGUARDE...";
    if (video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
    try {
        await startVideo();
        video.style.transform = (currentFacingMode === "user") ? "scaleX(-1)" : "scaleX(1)";
        btn.innerText = (currentFacingMode === "user") ? "BACK" : "FRONT";
        statusEl.innerText = "CÂMERA ALTERNADA";
    } catch (e) {
        statusEl.innerText = "ERRO AO ALTERNAR";
    } finally {
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

// --- RESTAURAÇÃO DAS INTERAÇÕES TOUCH (Mobile Premium) ---
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
            // Prepara para o Pinch Zoom (Escala)
            initialPinchDistance = Math.hypot(
                e.touches[0].pageX - e.touches[1].pageX,
                e.touches[0].pageY - e.touches[1].pageY
            );
        }
    }, {passive: false});

    canvas.addEventListener('touchmove', e => {
        if (!model) return;
        e.preventDefault(); // Impede o scroll da página

        if (e.touches.length === 1) {
            // Rotação e Movimento Vertical
            let deltaX = e.touches[0].clientX - lastTouchX;
            let deltaY = e.touches[0].clientY - lastTouchY;

            model.rotation.y += deltaX * 0.01;
            model.position.y -= deltaY * 0.01;

            lastTouchX = e.touches[0].clientX;
            lastTouchY = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
            // Pinch to Zoom (Escala do Objeto)
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

    new THREE.GLTFLoader().load('assets/models/bola.glb', gltf => {
        model = gltf.scene;
        model.traverse(child => { if (child.isMesh) { child.material.metalness = 0.7; child.material.roughness = 0.2; } });
        model.scale.set(1.5, 1.5, 1.5);
        scene.add(model);
        document.getElementById('status').innerText = "BOLA CARREGADA";
    });

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
        setupTouchEvents(); // Ativa a interação mobile rica
        animate();
    } catch (e) {
        document.getElementById('status').innerText = "ERRO WASM";
    }
}

function handleInput(e) {
    if (!model) return;
    const s = 0.5;
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
    if (model) model.rotation.y += 0.01;
    renderer.render(scene, camera);
}
window.onload = init;