# Planes a Futuro

## Mejora del Sistema de Inicio de Sesión — NIP-06 Frase Semilla

### Resumen
Agregar generación y restauración de identidad mediante frase semilla de 12/24 palabras en español (BIP39/NIP-06), manteniendo compatibilidad con el sistema actual (llave local y extensión).

### Cambios por archivo

#### 1. `index.html` — Importmap + vista de login

**Añadir importmap** (antes de cualquier script):
```html
<script type="importmap">
{
  "imports": {
    "@scure/bip39": "https://cdn.jsdelivr.net/npm/@scure/bip39@1.3.0/esm/index.js",
    "@scure/bip39/wordlists/spanish": "https://cdn.jsdelivr.net/npm/@scure/bip39@1.3.0/esm/wordlists/spanish.js",
    "@scure/bip32": "https://cdn.jsdelivr.net/npm/@scure/bip32@1.4.0/esm/index.js",
    "@noble/hashes": "https://cdn.jsdelivr.net/npm/@noble/hashes@1.4.0/esm/index.js",
    "@noble/curves": "https://cdn.jsdelivr.net/npm/@noble/curves@1.4.0/esm/index.js"
  }
}
</script>
```

**Añadir sección `#view-login`** (vista de onboarding con 3 modos):
- `#login-mnemonic-create` → "Crear nueva identidad": genera frase, la muestra, pide confirmación de respaldo
- `#login-mnemonic-restore` → "Restaurar desde frase": textarea para pegar la frase de 12/24 palabras, botón validar
- `#login-extension` → "Usar extensión" (flujo existente)
- `#mnemonic-display` → grid de palabras generadas, oculto hasta crear
- `#btn-copy-mnemonic`, `#btn-confirm-backup`

#### 2. `src/js/crypto.js` — Funciones NIP-06

Nuevos imports ESM vía importmap:
```js
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/spanish';
import { HDKey } from '@scure/bip32';
```

Nuevas funciones:
| Función | Propósito |
|---|---|
| `createMnemonicIdentity(strength = 128)` | Genera frase → deriva sk → almacena sciln_* + sciln_mnemonic temporal |
| `restoreMnemonicIdentity(mnemonic)` | Valida frase → deriva sk → almacena sciln_* |
| `derivePrivateKeyFromMnemonic(mnemonic)` | BIP39 seed → BIP32 path `m/44'/1237'/0'/0/0` → hex sk |
| `confirmBackup()` | Limpia sciln_mnemonic de localStorage (confirmación de respaldo) |
| `getCurrentMnemonic()` | Retorna la frase temporal si existe |

Derivación BIP32:
```
mnemonic → PBKDF2(2048, SHA512) → seed (64 bytes)
seed → HMAC-SHA512("Bitcoin seed") → master key
m/44'/1237'/0'/0/0 → HDKey.derive() → privateKey
```

La función `generateIdentity()` existente se modifica para que, si hay importmap disponible, use el nuevo flujo con frase; si no, mantenga el comportamiento actual (random bytes directos) como fallback.

#### 3. `src/js/app.js` — Handlers de UI

Nuevos event listeners:
- `#btn-create-identity` → llama `createMnemonicIdentity()`, muestra frase en `#mnemonic-display`
- `#btn-copy-mnemonic` → copia frase al portapapeles
- `#btn-confirm-backup` → llama `confirmBackup()`, cierra onboarding, redirige a feed
- `#btn-restore-identity` → lee textarea, llama `restoreMnemonicIdentity()`
- `#btn-login-extension` → flujo existente (sin cambios)
- `#btn-backup-later` → permite omitir respaldo con advertencia

El router se actualiza para reconocer `#/login` como ruta que muestra `#view-login`.

#### 4. `src/js/router.js` — Nueva ruta

Añadir `#/login` a las rutas reconocidas, con callback que muestra `#view-login` y oculta otras vistas.

#### 5. `index.html` — Navbar

En estado logged-out, el botón "⚡ Llave Local" redirige a `#/login` (en vez de generar inmediatamente). El botón "🔑 Extensión" sigue funcionando directo.

#### 6. Tests

- `tests/verify.mjs`: añadir checks para nuevos IDs del DOM (`#view-login`, `#mnemonic-display`, etc.)
- `tests/verify.mjs`: verificar que los nuevos imports ESM son sintácticamente válidos

### Flujo de usuario completo

```
Usuario abre app (sin sesión)
       │
       ▼
  [#/login] — 3 opciones:
       │
       ├── "Crear nueva identidad"
       │      │
       │      ▼
       │   Genera frase de 12 palabras
       │   Muestra: "abandonar ... zinc"
       │   ┌─────────────────────────┐
       │   │ 📋 frase semilla respaldo │
       │   │ palabra1 palabra2 ...    │
       │   │ palabra7 palabra8 ...    │
       │   │ [📋 Copiar]              │
       │   │ ☐ He respaldado mi frase │
       │   │ [Continuar → Feed]       │
       │   └─────────────────────────┘
       │   Backup confirmado → se limpia sciln_mnemonic
       │   → #/feed (sesión activa)
       │
       ├── "Restaurar desde frase"
       │      │
       │      ▼
       │   Textarea: pegar 12/24 palabras
       │   [Validar y restaurar]
       │   Si válida → deriva sk → #/feed
       │   Si inválida → muestra error con palabra erronea
       │
       └── "Usar extensión" → window.nostr → #/feed
```

### Seguridad

- La frase semilla **no se persiste** en localStorage después de la confirmación de respaldo
- La clave privada derivada se almacena igual que antes (sk en localStorage), manteniendo el mismo nivel de seguridad para la sesión activa
- La frase se almacena **temporalmente** durante el onboarding para mostrarla y permitir copia
- El usuario puede regenerar una nueva frase si no respaldó (pierde la identidad anterior)

---

## Otras mejoras consideradas (no priorizadas)

- **Importar/Exportar nsec/npub**: Poder pegar una clave nsec existente o exportar la generada en formato bech32
- **Cifrado con contraseña**: La clave privada se cifra en localStorage con una contraseña (PBKDF2), requiere ingresarla al iniciar sesión
- **UX de onboarding completo**: Vista de bienvenida con explicaciones, advertencia de respaldo, wizard de primer uso
- **Modo invitado explícito**: Navegación en solo-lectura sin generar clave, con estado explícito
- **Multi-cuenta**: Guardar múltiples identidades y cambiar entre ellas
- **Bloqueo por inactividad**: Cerrar sesión tras período de inactividad configurable
