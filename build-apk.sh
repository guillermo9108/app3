#!/bin/bash

# Script de compilación automática del APK de StreamPay
# Este script facilita la compilación del APK usando EAS Build

set -e

echo "🚀 StreamPay APK Builder"
echo "========================"
echo ""

# Navegar a la carpeta frontend
cd "$(dirname "$0")/frontend"

# Verificar si EAS CLI está instalado
if ! command -v eas &> /dev/null; then
    echo "❌ EAS CLI no está instalado"
    echo "📦 Instalando EAS CLI globalmente..."
    npm install -g eas-cli
    echo "✅ EAS CLI instalado correctamente"
fi

# Verificar si está logueado
echo "🔐 Verificando autenticación..."
if ! eas whoami &> /dev/null; then
    echo "❌ No has iniciado sesión en Expo"
    echo "Por favor inicia sesión:"
    eas login
fi

echo "✅ Autenticación verificada"
echo ""

# Verificar si el proyecto está inicializado
if ! grep -q "projectId" app.json; then
    echo "🔧 Inicializando proyecto EAS..."
    eas init
    echo "✅ Proyecto inicializado"
else
    echo "✅ Proyecto ya inicializado"
fi

echo ""
echo "📱 Selecciona el tipo de build:"
echo "1) Preview (APK para distribución manual - Recomendado)"
echo "2) Production (APK optimizado para Play Store)"
echo "3) Development (APK con herramientas de desarrollo)"
echo ""
read -p "Selecciona una opción (1-3): " BUILD_TYPE

case $BUILD_TYPE in
    1)
        PROFILE="preview"
        ;;
    2)
        PROFILE="production"
        ;;
    3)
        PROFILE="development"
        ;;
    *)
        echo "❌ Opción inválida. Usando 'preview' por defecto."
        PROFILE="preview"
        ;;
esac

echo ""
echo "🏗️  Iniciando build con perfil: $PROFILE"
echo ""
echo "⏳ Este proceso tomará entre 10-15 minutos..."
echo "💡 Puedes cerrar esta terminal, el build continuará en los servidores de Expo"
echo ""

# Iniciar el build
eas build --platform android --profile "$PROFILE"

echo ""
echo "✅ Build iniciado correctamente!"
echo ""
echo "📋 Próximos pasos:"
echo "1. Espera a que el build se complete (recibirás un email)"
echo "2. Descarga el APK desde el link que recibirás"
echo "3. O visita: https://expo.dev"
echo ""
echo "🔍 Para ver el estado de tus builds:"
echo "   eas build:list"
echo ""
echo "¡Gracias por usar StreamPay! 🎬"
