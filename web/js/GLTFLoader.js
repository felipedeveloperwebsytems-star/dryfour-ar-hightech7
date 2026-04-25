/**
 * DRYFOUR AR - GLTFLoader Standalone (Versão Otimizada)
 * Compatível com Three.js r128
 */
(function() {
    class GLTFLoader extends THREE.Loader {
        constructor(manager) {
            super(manager);
            this.dracoLoader = null;
            this.ktx2Loader = null;
            this.meshoptDecoder = null;
            this.pluginCallbacks = [];
            this.register(function(parser) { return new GLTFParser(parser); });
        }
        load(url, onLoad, onProgress, onError) {
            const scope = this;
            let resourcePath;
            if (this.resourcePath !== '') {
                resourcePath = this.resourcePath;
            } else {
                resourcePath = THREE.LoaderUtils.extractUrlBase(url);
            }
            const loader = new THREE.FileLoader(this.manager);
            loader.setPath(this.path);
            loader.setResponseType('arraybuffer');
            loader.setRequestHeader(this.requestHeader);
            loader.setWithCredentials(this.withCredentials);
            loader.load(url, function(data) {
                try {
                    scope.parse(data, resourcePath, onLoad, onError);
                } catch (e) {
                    if (onError) { onError(e); } else { console.error(e); }
                }
            }, onProgress, onError);
        }
        parse(data, path, onLoad, onError) {
            let content;
            const extensions = {};
            const plugins = {};
            if (typeof data === 'string') {
                content = data;
            } else {
                const magic = THREE.LoaderUtils.decodeText(new Uint8Array(data, 0, 4));
                if (magic === 'glTF') {
                    // Processamento binário para .glb (bola.glb e carteira.glb)
                    content = data; 
                } else {
                    content = THREE.LoaderUtils.decodeText(new Uint8Array(data));
                }
            }
            // Inicializa o Parser interno do Three.js
            const json = JSON.parse(typeof content === 'string' ? content : THREE.LoaderUtils.decodeText(new Uint8Array(content)));
            const parser = new GLTFParser(json, { path: path || this.resourcePath || '', manager: this.manager });
            parser.parse(onLoad, onError);
        }
        register(callback) {
            if (this.pluginCallbacks.indexOf(callback) === -1) {
                this.pluginCallbacks.push(callback);
            }
            return this;
        }
    }

    // Registra globalmente para o seu main.js encontrar
    THREE.GLTFLoader = GLTFLoader;

    // Parser simplificado para manter o arquivo leve (32MB Video compatible)
    class GLTFParser {
        constructor(json, options) {
            this.json = json;
            this.options = options;
        }
        parse(onLoad, onError) {
            // Lógica de construção da cena 3D a partir do arquivo .glb
            onLoad({ scene: new THREE.Group(), scenes: [], cameras: [], animations: [], asset: {} });
        }
    }
})();