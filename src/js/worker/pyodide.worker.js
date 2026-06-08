/**
 * SciLn Protocol - Isolated Cómputo Científico Worker (Fase 2)
 * Ubicación: src/js/worker/pyodide.worker.js
 * * Entorno WASM aislado que ejecuta Python científico, captura stdout y
 * exporta gráficos de Matplotlib sin bloquear el hilo principal de la UI.
 */

// Importar los scripts oficiales de Pyodide desde CDN público
importScripts("https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js");

let pyodide = null;
let stdoutBuffer = "";

/**
 * Capturador personalizado de la salida estándar (sys.stdout) de Python.
 * Agrupa los textos impresos mediante comandos `print()` para la consola virtual.
 */
function addToStdout(text) {
    stdoutBuffer += text + "\n";
}

/**
 * Inicialización asíncrona del entorno WebAssembly.
 * Carga Pyodide y prepara los paquetes de datos esenciales del ecosistema STEM.
 */
async function initPyodideWorker() {
    try {
        self.postMessage({ type: "status", status: "Cargando WebAssembly (Pyodide)..." });
        
        // Instanciar el entorno CPython mapeando la consola de salida
        pyodide = await loadPyodide({
            stdout: addToStdout,
            stderr: addToStdout
        });

        self.postMessage({ type: "status", status: "Instalando paquetes científicos (NumPy, Matplotlib)..." });
        
        // Pre-cargar las librerías fundamentales en el sistema de archivos virtual de WASM
        await pyodide.loadPackage(["numpy", "matplotlib"]);

        // Configuración interna de Python: Forzar el backend virtual AGG de Matplotlib 
        // Esto es obligatorio ya que los Web Workers no tienen acceso al DOM ni a tags <canvas> directos.
        await pyodide.runPythonAsync(`
            import sys
            import matplotlib
            matplotlib.use('Agg') # Backend in-memory para renderizado de imágenes crudas
            import matplotlib.pyplot as plt
            import io
            import base64
        `);

        self.postMessage({ type: "ready" });
    } catch (error) {
        self.postMessage({ type: "error", error: `Fallo de inicialización WASM: ${error.message}` });
    }
}

// Escuchar peticiones de ejecución del hilo principal (Editor UI)
self.onmessage = async function(e) {
    const { type, code } = e.data;

    // Disparador de arranque
    if (type === "init") {
        if (!pyodide) await initPyodideWorker();
        return;
    }

    // Pipeline de ejecución de código científico
    if (type === "execute") {
        if (!pyodide) {
            self.postMessage({ type: "error", error: "El entorno de ejecución aún no está listo." });
            return;
        }

        // Limpiar buffers previos
        stdoutBuffer = "";
        
        try {
            self.postMessage({ type: "status", status: "Ejecutando simulación..." });

            // Pasar el código del usuario como variable Python segura
            pyodide.globals.set("__user_code__", code);

            const interceptorWrapper = `
def __sciln_run_code__():
    import matplotlib.pyplot as plt
    import io
    import base64
    
    plt.clf()
    plt.close('all')
    
    local_vars = {}
    exec(__user_code__, globals(), local_vars)
    
    images_base64 = []
    if plt.get_fignums():
        for fig_num in plt.get_fignums():
            fig = plt.figure(fig_num)
            buf = io.BytesIO()
            fig.savefig(buf, format='png', bbox_inches='tight')
            buf.seek(0)
            img_str = "data:image/png;base64," + base64.b64encode(buf.read()).decode('utf-8')
            images_base64.append(img_str)
            buf.close()
            
    return images_base64

__sciln_outputs__ = __sciln_run_code__()
`;

            // Ejecutar el script acoplado en la máquina virtual WASM
            await pyodide.runPythonAsync(interceptorWrapper);
            
            // Extraer las referencias de las imágenes del entorno de Python a JavaScript
            const pyImages = pyodide.globals.get("__sciln_outputs__");
            const javascriptImages = pyImages.toJs();
            
            // Limpieza de referencias en el colector de basura de Python
            pyImages.destroy();
            if (pyodide.globals.has("__user_code__")) {
                pyodide.globals.delete("__user_code__");
            }

            self.postMessage({
                type: "result",
                stdout: stdoutBuffer,
                graphics: javascriptImages
            });

        } catch (error) {
            if (pyodide.globals.has("__user_code__")) {
                pyodide.globals.delete("__user_code__");
            }
            self.postMessage({
                type: "result",
                stdout: stdoutBuffer + `\n⚠️ [Python Error]: ${error.message}`,
                graphics: []
            });
        }
    }
};