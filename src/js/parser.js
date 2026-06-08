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
 * 2. ENSAMBLADOR PRINCIPAL Y PURIFICADOR CIENTÍFICO
 * Punto de entrada único de la interfaz de usuario.
 * Procesa el pipeline completo garantizando blindaje total contra XSS en redes P2P.
 * Usa placeholders para que marked preserve la estructura del documento completo
 * y las ecuaciones inline fluyan con el texto.
 * * @ param {string} rawText - Markdown + LaTeX en bruto desde el editor o un relay Nostr.
 * @ returns {string} HTML final sanitizado, listo para asignarse de forma segura al DOM.
 */
function parseScientificContent(rawText) {
    if (!rawText) return "";

    // Paso 1: Tokenizar (separa markdown de math)
    const tokens = tokenizeMath(rawText);

    // Paso 2: Reconstruir el texto completo reemplazando cada math por un placeholder único.
    // Esto permite que marked procese el documento completo con su estructura de bloques intacta.
    // Usamos «§§» como wrapper — son caracteres seguros que ni marked ni DOMPurify modifican.
    const placeholders = [];
    let fullText = "";
    for (const token of tokens) {
        if (token.type === 'markdown') {
            fullText += token.content;
        } else {
            const ph = `\xA7\xA7MATH-IDX-${placeholders.length}-END\xA7\xA7`;
            placeholders.push({ ph, token });
            fullText += ph;
        }
    }

    // Paso 3: Parsear el documento COMPLETO con marked (preserva párrafos, listas, etc.)
    const rawHtml = marked.parse(fullText);

    // Paso 4: Reemplazar placeholders con KaTeX compilado
    let html = rawHtml;
    for (const { ph, token } of placeholders) {
        let mathHtml;
        try {
            mathHtml = katex.renderToString(token.content, {
                displayMode: token.displayMode,
                throwOnError: false
            });
        } catch (error) {
            mathHtml = `<span class="text-red-500 font-mono text-xs" title="${error.message}">[Error LaTeX: ${token.content}]</span>`;
        }
        html = html.replace(ph, mathHtml);
    }

    // Paso 5: Sanitizar
    return DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true }
    });
}

// Exportación modular limpia para su uso en main.js u otros orquestadores del cliente
export { parseScientificContent, tokenizeMath };
