let scene, camera, renderer, model, video;
let pigoInitialized = false;

// Funções Globais para os Botões (Desktop Click / Mobile Touch)
window.move = (axis, val) => { if(model) model.position[axis] += val; };
window.updateScale = (val) => { if(model) model.scale.multiplyScalar(val); };
window.rotate = (axis, val) => { if(model) model.rotation[axis] += val; };

async function init() {
    const statusEl = document.getElementById('status');
    video = document.getElementById('webcam');

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

    const loader = new THREE.GLTFLoader();
    loader.load('assets/models/bola.glb', function (gltf) {
        model = gltf.scene;
        model.traverse(child => { 
            if (child.isMesh) { 
                child.material.metalness = 0.7; 
                child.material.roughness = 0.2; 
            } 
        });
        model.scale.set(1.5, 1.5, 1.5);
        scene.add(model);
        statusEl.innerText = "BOLA CARREGADA";
    }, undefined, function (error) {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        model = new THREE.Mesh(geometry, new THREE.MeshNormalMaterial());
        scene.add(model);
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
        animate();
    } catch (e) {
        statusEl.innerText = "ERRO WASM";
    }
}

function handleInput(e) {
    if (!model) return;
    const s = 0.5;
    const key = e.key;

    switch(key) {
        // Z: Frente e Trás
        case 'w': case 'ArrowUp': model.position.z += s; break;
        case 's': case 'ArrowDown': model.position.z -= s; break;
        // X: Esquerda e Direita
        case 'a': case 'ArrowLeft': model.position.x -= s; break;
        case 'd': case 'ArrowRight': model.position.x += s; break;
        // Escala e Rotação
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
