# 🔄 Cómo Integrar con tu Repositorio de GitHub

## Opción 1: Crear Nueva Rama en tu Repo Existente

```bash
# 1. Clona tu repositorio de StreamPay
git clone https://github.com/guillermo9108/YouTube.git
cd YouTube

# 2. Crea una nueva rama para el cliente Android
git checkout -b android-client

# 3. Copia los archivos del cliente (ajusta las rutas según donde tengas este proyecto)
# Asumiendo que este proyecto está en /app/

# Copiar la carpeta frontend (renombrarla si quieres)
cp -r /app/frontend ./android-client

# Copiar el workflow de GitHub Actions
mkdir -p .github/workflows
cp /app/.github/workflows/build-apk.yml .github/workflows/

# Copiar la documentación
cp /app/README_CLIENT.md ./android-client/
cp /app/GUIA_RAPIDA_APK.md ./
cp /app/RESUMEN_PROYECTO.md ./
cp /app/build-apk.sh ./

# 4. Agregar los cambios
git add .
git commit -m "Add Android APK client for StreamPay

- Expo React Native WebView wrapper
- Configurable server IP
- Full HTTP support for self-hosted servers
- GitHub Actions workflow for automatic builds
- Complete documentation in Spanish and English"

# 5. Push a GitHub
git push origin android-client

# 6. Crear Pull Request en GitHub
# Ve a https://github.com/guillermo9108/YouTube
# Verás un botón "Compare & pull request"
```

## Opción 2: Agregar al Repo Principal (Main Branch)

```bash
# 1. Clona tu repositorio
git clone https://github.com/guillermo9108/YouTube.git
cd YouTube

# 2. Copia los archivos
cp -r /app/frontend ./android-client
mkdir -p .github/workflows
cp /app/.github/workflows/build-apk.yml .github/workflows/
cp /app/*.md ./

# 3. Commit y push
git add .
git commit -m "Add Android APK client"
git push origin main
```

## Opción 3: Crear Repositorio Separado

```bash
# 1. Crea un nuevo repo en GitHub llamado "StreamPay-Android"

# 2. Inicializa y sube el código
cd /app
git init
git add frontend/ .github/ *.md *.sh
git commit -m "Initial commit - StreamPay Android Client"
git branch -M main
git remote add origin https://github.com/guillermo9108/StreamPay-Android.git
git push -u origin main
```

---

## 📝 Actualizar el README principal

Agrega esta sección al README.md de tu repositorio principal:

\`\`\`markdown
## 📱 Cliente Android (APK)

StreamPay ahora tiene un cliente nativo para Android.

### Descargar APK

[Descargar la última versión](https://github.com/guillermo9108/YouTube/releases)

### Compilar desde el código fuente

\`\`\`bash
cd android-client
./build-apk.sh
\`\`\`

Ver [documentación completa](./android-client/README_CLIENT.md) para más información.

### Características

- ✅ WebView optimizado para StreamPay
- ✅ Configuración dinámica de IP
- ✅ Soporte HTTP para servidores locales
- ✅ Reproducción de video sin interrupciones
- ✅ Tema dark nativo

\`\`\`

---

## 🚀 Configurar GitHub Actions

Después de subir los archivos:

### 1. Obtener Token de Expo

\`\`\`bash
npm install -g eas-cli
eas login
\`\`\`

Ve a: https://expo.dev/accounts/[tu-usuario]/settings/access-tokens
Crea un nuevo token y cópialo.

### 2. Agregar Secret en GitHub

1. Ve a tu repositorio en GitHub
2. **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Nombre: \`EXPO_TOKEN\`
5. Valor: [pega tu token]
6. Click **Add secret**

### 3. Inicializar EAS

\`\`\`bash
cd android-client  # o frontend/
eas init
git add app.json
git commit -m "Add EAS project ID"
git push
\`\`\`

### 4. Ejecutar el Build

**Opción A: Automático (cada push a main)**
- Solo haz push al repositorio
- El workflow se ejecutará automáticamente

**Opción B: Manual**
1. Ve a tu repo en GitHub
2. Pestaña **Actions**
3. Selecciona **Build Android APK**
4. Click **Run workflow**
5. Espera 10-15 minutos
6. Descarga el APK desde expo.dev

---

## 📦 Crear Releases en GitHub

Para distribuir el APK a través de GitHub Releases:

### 1. Descarga el APK de Expo

Después de que el build termine, descarga el APK desde:
https://expo.dev/accounts/[tu-usuario]/projects/streampay/builds

### 2. Crear un Release

\`\`\`bash
# Crear un tag
git tag -a v1.0.0 -m "StreamPay Android v1.0.0"
git push origin v1.0.0
\`\`\`

### 3. En GitHub

1. Ve a tu repositorio
2. Click en **Releases**
3. Click **Create a new release**
4. Selecciona el tag \`v1.0.0\`
5. Título: "StreamPay Android v1.0.0"
6. Descripción:
   \`\`\`
   ## StreamPay Android Client
   
   Primera versión del cliente Android para StreamPay.
   
   ### Características
   - WebView nativo optimizado
   - Configuración dinámica de servidor
   - Soporte para HTTP (self-hosted)
   - Streaming de video sin interrupciones
   
   ### Instalación
   1. Descarga el archivo APK
   2. Instala en tu dispositivo Android
   3. Configura la IP del servidor
   4. ¡Disfruta de StreamPay!
   
   ### Requisitos
   - Android 5.0 o superior
   - Acceso a la red local del servidor
   \`\`\`
7. Arrastra y suelta el archivo APK
8. Click **Publish release**

---

## 🔄 Actualizar la App

Para nuevas versiones:

### 1. Actualiza la versión en \`app.json\`

\`\`\`json
{
  "expo": {
    "version": "1.0.1",
    "android": {
      "versionCode": 2
    }
  }
}
\`\`\`

### 2. Commit y push

\`\`\`bash
git add app.json
git commit -m "Bump version to 1.0.1"
git push
\`\`\`

### 3. Build y release

El workflow se ejecutará automáticamente o manualmente desde Actions.

---

## 📂 Estructura Recomendada del Repo

\`\`\`
YouTube/  (tu repo principal)
├── .github/
│   └── workflows/
│       └── build-apk.yml
│
├── android-client/          # Cliente Android
│   ├── app/
│   ├── assets/
│   ├── app.json
│   ├── eas.json
│   ├── package.json
│   └── README_CLIENT.md
│
├── api/                     # Tu backend PHP existente
├── components/              # Tus componentes web existentes
├── pages/                   # Tus páginas existentes
│
├── README.md                # README principal actualizado
├── README_APK.md            # El README original
├── GUIA_RAPIDA_APK.md      # Guía rápida
└── build-apk.sh            # Script de compilación
\`\`\`

---

## ✅ Checklist Final

Antes de hacer público:

- [ ] Código subido a GitHub
- [ ] Token de Expo configurado como secret
- [ ] \`eas init\` ejecutado y \`projectId\` en \`app.json\`
- [ ] Workflow de GitHub Actions probado
- [ ] APK compilado y funcional
- [ ] README principal actualizado con sección de Android
- [ ] Documentación revisada
- [ ] (Opcional) Release creado con APK adjunto
- [ ] (Opcional) Iconos personalizados agregados

---

## 🎉 ¡Listo!

Tu proyecto StreamPay ahora tiene:
- ✅ Cliente web (PWA) original
- ✅ Cliente Android nativo (APK)
- ✅ Compilación automática con GitHub Actions
- ✅ Documentación completa en español e inglés

**¡Los usuarios ahora pueden acceder a StreamPay desde cualquier dispositivo!**
