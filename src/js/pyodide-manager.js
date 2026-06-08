/**
 * SciLn Protocol - Pyodide Execution Manager (Fase 2)
 * Ubicación: src/js/pyodide-manager.js
 * * Gestiona el ciclo de vida del Web Worker de Pyodide, canaliza el código
 * hacia el hilo secundario y delega la actualización de la UI al recibir respuestas.
 */

let scienceWorker = null;
let onStatusChangeCallback = null;
let onResultCallback = null;

/**
 * Inicializa el Web Worker asíncronamente.
 * @param {Function} statusCallback - Escucha las actualizaciones de carga (WASM, paquetes).
 * @param {Function} resultCallback - Escucha los retornos de ejecución (consola, imágenes).
 */
function initScienceEngine(statusCallback, resultCallback) {
    onStatusChangeCallback = statusCallback;
    onResultCallback = resultCallback;

    // Crear la instancia del Web Worker apuntando a la ruta del hilo aislado
    scienceWorker = new Worker('./worker/pyodide.worker.js');

    // Escuchar los mensajes provenientes del Web Worker
    scienceWorker.onmessage = function(e) {
        const { type, status, stdout, graphics, error } = e.data;

        switch (type) {
            case "status":
                if (onStatusChangeCallback) onStatusChangeCallback(status);
                break;
                
            case "ready":
                if (onStatusChangeCallback) onStatusChangeCallback("Entorno Python WASM Listo 🟢");
                break;
                
            case "result":
                if (onResultCallback) onResultCallback({ stdout, graphics });
                break;
                
            case "error":
                if (onStatusChangeCallback) onStatusChangeCallback(`⚠️ Error: ${error}`);
                break;
        }
    };

    // Ordenar al Worker que inicie la descarga y compilación del entorno
    scienceWorker.postMessage({ type: "init" });
}

/**
 * Despacha un bloque de código Python para su ejecución ininterrumpida.
 * @param {string} code - Script puro extraído del editor de SciLn.
 */
function runScientificCode(code) {
    if (!scienceWorker) {
        console.error("El motor científico no ha sido inicializado.");
        return;
    }
    scienceWorker.postMessage({ type: "execute", code: code });
}

export { initScienceEngine, runScientificCode };