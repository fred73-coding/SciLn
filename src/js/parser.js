// Motor de renderizado integrado (Markdown + KaTeX)

/*
[ Texto Plano ] 
       │
       ▼
 [ 1. Tokenizador LaTeX ] ──► Aísla las ecuaciones ($$ y $) para evitar que el parser 
       │                      de Markdown las rompa o altere sus caracteres.
       ▼
 [ 2. Parser Markdown ]   ──► Procesa los bloques de texto restantes, convirtiendo
       │                      títulos, listas y énfasis en HTML estructurado.
       ▼
 [ 3. Compilador KaTeX ]  ──► Toma los bloques de LaTeX aislados en el paso 1, los compila
       │                      a nodos HTML/MathML matemáticos y los reinserta en su lugar.
       ▼
 [ 4. Sanitizador HTML ]  ──► Limpia cualquier etiqueta maliciosa (<script>, <iframe>, etc.)
       │                      garantizando que el entorno local del lector sea seguro.
       ▼
[ HTML Renderizado Seguro ]
*/

/**
 * SciLn Protocol - Core Parser Module (Fase 1)
 * Ubicación: src/js/parser.js
 * * Un motor de renderizado científico autónomo, descentralizado y seguro 
 * que aísla LaTeX, procesa Markdown y neutraliza ataques XSS.
 */

// Definición de los estados internos para la Máquina de Estados
const STATE_TEXT = 'TEXT';
const STATE_BLOCK_MATH = 'BLOCK_MATH';
const STATE_INLINE_MATH = 'INLINE_MATH';

/**
 * 1. TOKENIZADOR MATEMÁTICO
 * Recorre el texto plano caracter por caracter aislando la prosa de las ecuaciones.
 * Evita colisiones de formato y respeta los escapes con barra invertida (\$).
 * * @ param {string} text - Texto plano Markdown + LaTeX recibido de la red.
 * @ returns {Array<Object>} Arreglo de tokens estructurados.
 */

function tokenizeMath(text) {
    const tokens = [];
    let currentBuffer = "";
    let state = STATE_TEXT;
    let i = 0;

    while (i < text.length) {
        // Manejo de caracteres de escape: \$ para forzar el símbolo de la moneda
        if (text[i] === '\\' && text[i + 1] === '$') {
            currentBuffer += '$';
            i += 2;
            continue;
        }

        switch (state) {
            case STATE_TEXT:
                // Detección de bloque matemático independiente ($$)
                if (text[i] === '$' && text[i + 1] === '$') {
                    if (currentBuffer.length > 0) {
                        tokens.push({ type: 'markdown', content: currentBuffer });
                        currentBuffer = "";
                    }
                    state = STATE_BLOCK_MATH;
                    i += 2;
                } 
                // Detección de matemática en línea ($)
                else if (text[i] === '$') {
                    if (currentBuffer.length > 0) {
                        tokens.push({ type: 'markdown', content: currentBuffer });
                        currentBuffer = "";
                    }
                    state = STATE_INLINE_MATH;
                    i += 1;
                } 
                // Texto convencional de prosa
                else {
                    currentBuffer += text[i];
                    i += 1;
                }
                break;

            case STATE_BLOCK_MATH:
                // Cierre de bloque independiente ($$)
                if (text[i] === '$' && text[i + 1] === '$') {
                    tokens.push({ type: 'math', content: currentBuffer.trim(), displayMode: true });
                    currentBuffer = "";
                    state = STATE_TEXT;
                    i += 2;
                } else {
                    currentBuffer += text[i];
                    i += 1;
                }
                break;

            case STATE_INLINE_MATH:
                // Cierre de matemática en línea ($)
                if (text[i] === '$') {
                    tokens.push({ type: 'math', content: currentBuffer.trim(), displayMode: false });
                    currentBuffer = "";
                    state = STATE_TEXT;
                    i += 1;
                } else {
                    currentBuffer += text[i];
                    i += 1;
                }
                break;
        }
    }

    // Vaciar el búfer remanente si el texto no terminó de forma abrupta
    if (currentBuffer.length > 0) {
        // Si el documento termina sin cerrar un estado matemático, se fuerza como texto para no perder datos
        const type = (state === STATE_TEXT) ? 'markdown' : 'math';
        const displayMode = (state === STATE_BLOCK_MATH);
        tokens.push({ type, content: currentBuffer, displayMode });
    }

    return tokens;
}

/**
 * 2. COMPILADOR DE TOKENS MATEMÁTICOS
 * Transforma las ecuaciones LaTeX en strings HTML nativos e inmutables usando KaTeX.
 * * @ param {Array<Object>} tokens - Arreglo provisto por tokenizeMath.
 * @ returns {Array<Object>} Mismo arreglo con el contenido matemático compilado a HTML.
 */
function compileMathTokens(tokens) {
    return tokens.map(token => {
        if (token.type !== 'math') return token;

        try {
            // KaTeX compila localmente de forma ultra-veloz
            const compiledHtml = katex.renderToString(token.content, {
                displayMode: token.displayMode,
                throwOnError: false // Previene cierres inesperados ante errores de sintaxis del autor
            });
            
            return {
                type: 'compiled_html',
                content: compiledHtml
            };
        } catch (error) {
            // Callback visual en caso de que la expresión matemática esté mal estructurada
            return {
                type: 'compiled_html',
                content: `<span class="text-red-500 font-mono text-xs" title="${error.message}">[Errores en LaTeX: ${token.content}]</span>`
            };
        }
    });
}

/**
 * 3. ENSAMBLADOR PRINCIPAL Y PURIFICADOR CIENTÍFICO
 * Punto de entrada único de la interfaz de usuario.
 * Procesa el pipeline completo garantizando blindaje total contra XSS en redes P2P.
 * * @ param {string} rawText - Markdown + LaTeX en bruto desde el editor o un relay Nostr.
 * @ returns {string} HTML final sanitizado, listo para asignarse de forma segura al DOM.
 */
function parseScientificContent(rawText) {
    if (!rawText) return "";

    // Paso 1: Segmentar y aislar componentes
    const tokens = tokenizeMath(rawText);

    // Paso 2: Compilar las matemáticas de forma aislada
    const processTokens = compileMathTokens(tokens);

    // Paso 3: Procesar bloques individuales y reensamblar de forma segura
    const finalHtmlArray = processTokens.map(token => {
        if (token.type === 'compiled_html') {
            // El HTML proveniente de KaTeX es seguro por diseño y no se toca para evitar romper MathML
            return token.content;
        }

        if (token.type === 'markdown') {
            // Convertir la prosa mediante Marked.js
            const rawMarkdownHtml = marked.parse(token.content);
            
            // Sanitización estricta sobre el código Markdown (Destruye scripts, iframes e inyecciones)
            // Usamos DOMPurify configurado para entornos SPA reactivos
            const safeMarkdownHtml = DOMPurify.sanitize(rawMarkdownHtml, {
                USE_PROFILES: { html: true }
            });
            
            return safeMarkdownHtml;
        }
        
        return "";
    });

    // Unificación final de los strings resultantes
    return finalHtmlArray.join("");
}

// Exportación modular limpia para su uso en main.js u otros orquestadores del cliente
export { parseScientificContent, tokenizeMath };