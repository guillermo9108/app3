# ✅ CHECKLIST: Pasos para Compilar tu APK

Usa esta guía paso a paso para compilar exitosamente el APK de StreamPay.

---

## 📋 Fase 1: Preparación (15 minutos)

### ✅ 1.1 Crear Cuenta en Expo
- [ ] Ve a https://expo.dev
- [ ] Click en "Sign Up"
- [ ] Completa el registro
- [ ] Verifica tu email
- [ ] Anota tu username: `________________`

### ✅ 1.2 Instalar Herramientas
```bash
# Instalar EAS CLI globalmente
npm install -g eas-cli

# Verificar instalación
eas --version
```
- [ ] EAS CLI instalado correctamente
- [ ] Versión mostrada: `________________`

### ✅ 1.3 Iniciar Sesión
```bash
eas login
```
- [ ] Email: `________________`
- [ ] Password: `________________`
- [ ] Sesión iniciada correctamente

---

## 📋 Fase 2: Configurar Proyecto (10 minutos)

### ✅ 2.1 Navegar al Proyecto
```bash
cd /app/frontend
# o donde esté tu proyecto
```
- [ ] Ubicado en la carpeta correcta

### ✅ 2.2 Inicializar EAS
```bash
eas init
```
**Opciones:**
- "Create a new project" → YES
- Project name: StreamPay (o el que prefieras)

- [ ] Project ID generado
- [ ] app.json actualizado con projectId
- [ ] Anotar Project ID: `________________`

### ✅ 2.3 Verificar Configuración
```bash
cat app.json | grep projectId
```
- [ ] projectId presente en app.json

---

## 📋 Fase 3: Primera Compilación (15-20 min)

### ✅ 3.1 Iniciar Build
```bash
eas build --platform android --profile preview
```

**Durante el proceso:**
- [ ] "Generate a new Android Keystore?" → YES
- [ ] Build iniciado correctamente
- [ ] URL del build recibida
- [ ] Anotar URL: `________________`

### ✅ 3.2 Esperar Compilación
⏳ **Tiempo estimado: 10-15 minutos**

Puedes:
- Cerrar la terminal (el build sigue en los servidores)
- Ver progreso en: https://expo.dev
- Revisar tu email

- [ ] Build completado
- [ ] Email recibido con link de descarga
- [ ] APK descargado

---

## 📋 Fase 4: Probar el APK (10 minutos)

### ✅ 4.1 Transferir a Android
```bash
# Opción 1: Descarga directa en el teléfono
# Ve a la URL en el navegador del teléfono

# Opción 2: Transferencia manual
# Descarga en PC y pasa al teléfono via USB/Cloud
```
- [ ] APK en el dispositivo Android

### ✅ 4.2 Instalar
- [ ] Abrir archivo APK
- [ ] Permitir "Instalar de fuentes desconocidas" (si pregunta)
- [ ] Click en "Instalar"
- [ ] Instalación completada
- [ ] Ícono de StreamPay visible

### ✅ 4.3 Configurar y Probar
- [ ] Abrir app
- [ ] Pantalla de configuración mostrada
- [ ] Ingresar IP del servidor: `http://192.168.43.101`
- [ ] Ingresar puerto: `3001`
- [ ] Click "Guardar y Continuar"
- [ ] WebView cargado correctamente
- [ ] PWA de StreamPay visible
- [ ] Videos se reproducen correctamente
- [ ] Navegación funciona
- [ ] Botón atrás funciona

---

## 📋 Fase 5: Automatización con GitHub Actions (Opcional - 20 min)

### ✅ 5.1 Generar Token de Expo
- [ ] Ve a: https://expo.dev/accounts/[tu-usuario]/settings/access-tokens
- [ ] Click "Create Token"
- [ ] Nombre: `GitHub Actions`
- [ ] Click "Create"
- [ ] Copiar token (solo se muestra una vez)
- [ ] Guardar token seguro: `________________`

### ✅ 5.2 Subir Código a GitHub
```bash
cd /app
git init
git add .
git commit -m "Add StreamPay Android client"
git remote add origin https://github.com/[tu-usuario]/[tu-repo].git
git push -u origin main
```
- [ ] Código en GitHub
- [ ] URL del repo: `________________`

### ✅ 5.3 Configurar Secret en GitHub
- [ ] Ir al repositorio en GitHub
- [ ] Settings → Secrets and variables → Actions
- [ ] New repository secret
- [ ] Name: `EXPO_TOKEN`
- [ ] Value: [pegar token de 5.1]
- [ ] Add secret

### ✅ 5.4 Ejecutar Workflow
- [ ] Ir a pestaña "Actions"
- [ ] Seleccionar "Build Android APK"
- [ ] Click "Run workflow"
- [ ] Workflow en progreso
- [ ] Build completado
- [ ] APK disponible en expo.dev

---

## 📋 Fase 6: Distribución (Opcional - 15 min)

### ✅ 6.1 Crear Release en GitHub
- [ ] Ir a repositorio en GitHub
- [ ] Click "Releases"
- [ ] "Create a new release"
- [ ] Tag: `v1.0.0`
- [ ] Title: "StreamPay Android v1.0.0"
- [ ] Descripción agregada
- [ ] APK adjunto
- [ ] "Publish release"

### ✅ 6.2 Compartir
- [ ] Link de release copiado
- [ ] Compartir con usuarios
- [ ] Instrucciones de instalación incluidas

---

## 🎯 Resumen de Comandos Esenciales

```bash
# Instalar EAS CLI
npm install -g eas-cli

# Login
eas login

# Inicializar proyecto
cd frontend
eas init

# Compilar APK
eas build --platform android --profile preview

# Ver builds
eas build:list

# Ver estado de build específico
eas build:view [build-id]
```

---

## 🐛 Troubleshooting Rápido

### Error: "Not logged in"
```bash
eas login
```

### Error: "No project ID"
```bash
cd frontend
eas init
```

### Error: Build failed
```bash
# Limpiar cache y reintentar
eas build --clear-cache --platform android --profile preview
```

### Error: "Module not found"
```bash
cd frontend
rm -rf node_modules
yarn install
eas build --platform android --profile preview
```

---

## ⏱️ Tiempos Estimados

| Fase | Tiempo | Acumulado |
|------|--------|-----------|
| 1. Preparación | 15 min | 15 min |
| 2. Configuración | 10 min | 25 min |
| 3. Primera compilación | 20 min | 45 min |
| 4. Prueba | 10 min | 55 min |
| 5. GitHub Actions (opcional) | 20 min | 1h 15min |
| 6. Distribución (opcional) | 15 min | 1h 30min |

**Tiempo total mínimo:** ~45 minutos
**Tiempo total completo:** ~1.5 horas

---

## 📞 Contactos de Soporte

- **Documentación Expo:** https://docs.expo.dev
- **Foro Expo:** https://forums.expo.dev
- **Discord Expo:** https://chat.expo.dev
- **Stack Overflow:** Tag `expo`

---

## ✨ ¡Felicitaciones!

Si completaste todos los checks ✅, ahora tienes:

- ✅ APK funcional de StreamPay
- ✅ Pipeline de compilación automático
- ✅ Sistema de distribución configurado
- ✅ App instalada y funcionando en Android

**¡Tu plataforma StreamPay ahora está disponible como app nativa! 🎉**

---

## 📝 Notas Adicionales

**Fecha primera compilación:** ___/___/______

**Versión actual:** 1.0.0

**Próxima actualización:** ___/___/______

**Usuarios beta:** ________________

**Feedback recibido:**
- ________________
- ________________
- ________________

**Mejoras planificadas:**
- [ ] ________________
- [ ] ________________
- [ ] ________________
