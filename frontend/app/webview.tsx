import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  BackHandler,
  Alert,
  Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Notifications from 'expo-notifications';
import * as FileSystem from 'expo-file-system';

// Configurar notificaciones
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export default function WebViewScreen() {
  const webViewRef = useRef<WebView>(null);
  const router = useRouter();
  const [serverUrl, setServerUrl] = useState('');
  const [streamingPort, setStreamingPort] = useState('3001');
  const [canGoBack, setCanGoBack] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    loadServerUrl();
    setupNotifications();
    
    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      handleBackPress
    );

    return () => {
      backHandler.remove();
      // Restaurar orientación al salir
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
    };
  }, [canGoBack]);

  const setupNotifications = async () => {
    // Solicitar permisos de notificaciones
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      console.log('Permission for notifications not granted');
    }
  };

  const loadServerUrl = async () => {
    try {
      const url = await AsyncStorage.getItem('SERVER_URL');
      const port = await AsyncStorage.getItem('STREAMING_PORT');
      if (url) {
        setServerUrl(url);
        if (port) setStreamingPort(port);
      } else {
        router.replace('/config');
      }
    } catch (error) {
      console.error('Error loading server URL:', error);
      router.replace('/config');
    }
  };

  const handleBackPress = () => {
    if (isFullscreen) {
      // Si está en fullscreen, salir de fullscreen primero
      exitFullscreen();
      return true;
    }
    if (canGoBack && webViewRef.current) {
      webViewRef.current.goBack();
      return true;
    }
    return false;
  };

  const exitFullscreen = () => {
    // Enviar mensaje al WebView para salir de fullscreen
    webViewRef.current?.injectJavaScript(`
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else if (document.webkitFullscreenElement) {
        document.webkitExitFullscreen();
      }
      true;
    `);
  };

  const handleNavigationStateChange = (navState: any) => {
    setCanGoBack(navState.canGoBack);
  };

  const handleMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      
      // Manejar fullscreen
      if (data.type === 'fullscreenchange') {
        setIsFullscreen(data.isFullscreen);
        if (data.isFullscreen) {
          // Permitir todas las orientaciones en fullscreen
          await ScreenOrientation.unlockAsync();
        } else {
          // Volver a portrait cuando no está en fullscreen
          await ScreenOrientation.lockAsync(
            ScreenOrientation.OrientationLock.PORTRAIT
          );
        }
      }
      
      // Manejar descargas
      if (data.type === 'download') {
        handleDownload(data.url, data.filename);
      }
      
      // Manejar notificaciones de audio
      if (data.type === 'audio') {
        if (data.action === 'playing') {
          showAudioNotification(data.title, data.artist);
        } else if (data.action === 'paused') {
          await Notifications.dismissAllNotificationsAsync();
        }
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  };

  const handleDownload = async (url: string, filename: string) => {
    try {
      // Mostrar notificación de inicio de descarga
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '📥 Descargando',
          body: filename,
          data: { url, filename },
        },
        trigger: null,
      });

      const downloadResumable = FileSystem.createDownloadResumable(
        url,
        FileSystem.documentDirectory + filename,
        {},
        (downloadProgress) => {
          const progress =
            downloadProgress.totalBytesWritten /
            downloadProgress.totalBytesExpectedToWrite;
          
          // Actualizar notificación con progreso
          if (progress > 0 && progress < 1) {
            Notifications.scheduleNotificationAsync({
              content: {
                title: '📥 Descargando',
                body: `${filename} - ${Math.round(progress * 100)}%`,
                data: { url, filename, progress },
              },
              trigger: null,
            });
          }
        }
      );

      const result = await downloadResumable.downloadAsync();
      
      if (result) {
        // Notificación de descarga completa
        await Notifications.scheduleNotificationAsync({
          content: {
            title: '✅ Descarga completa',
            body: filename,
            data: { url, filename, uri: result.uri },
          },
          trigger: null,
        });
      }
    } catch (error) {
      console.error('Download error:', error);
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '❌ Error en descarga',
          body: filename,
        },
        trigger: null,
      });
    }
  };

  const showAudioNotification = async (title: string, artist: string) => {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🎵 Reproduciendo',
        body: `${title}${artist ? ` - ${artist}` : ''}`,
        sound: false,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        sticky: true,
      },
      trigger: null,
    });
  };

  // JavaScript que se inyecta en el WebView
  const injectedJavaScript = `
    (function() {
      // Detectar cambios de fullscreen
      document.addEventListener('fullscreenchange', function() {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'fullscreenchange',
          isFullscreen: !!document.fullscreenElement
        }));
      });
      
      document.addEventListener('webkitfullscreenchange', function() {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'fullscreenchange',
          isFullscreen: !!document.webkitFullscreenElement
        }));
      });

      // Interceptar descargas
      document.addEventListener('click', function(e) {
        const target = e.target.closest('a[download], a[href*="/download"]');
        if (target) {
          e.preventDefault();
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'download',
            url: target.href,
            filename: target.download || target.href.split('/').pop()
          }));
        }
      }, true);

      // Detectar reproducción de audio
      document.addEventListener('play', function(e) {
        if (e.target.tagName === 'AUDIO' || e.target.tagName === 'VIDEO') {
          const title = e.target.title || e.target.getAttribute('data-title') || 'Audio';
          const artist = e.target.getAttribute('data-artist') || '';
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'audio',
            action: 'playing',
            title: title,
            artist: artist
          }));
        }
      }, true);

      document.addEventListener('pause', function(e) {
        if (e.target.tagName === 'AUDIO' || e.target.tagName === 'VIDEO') {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'audio',
            action: 'paused'
          }));
        }
      }, true);

      // Mejorar soporte para videos en fullscreen
      const videos = document.querySelectorAll('video');
      videos.forEach(video => {
        video.addEventListener('dblclick', function() {
          if (this.requestFullscreen) {
            this.requestFullscreen();
          } else if (this.webkitRequestFullscreen) {
            this.webkitRequestFullscreen();
          }
        });
      });
    })();
    true;
  `;

  if (!serverUrl) {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" hidden={isFullscreen} />
      
      {/* WebView sin barra superior */}
      <WebView
        ref={webViewRef}
        source={{ uri: serverUrl }}
        style={styles.webview}
        onNavigationStateChange={handleNavigationStateChange}
        onMessage={handleMessage}
        injectedJavaScript={injectedJavaScript}
        // Configuración crítica para StreamPay
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowFileAccess={true}
        mediaPlaybackRequiresUserAction={false}
        allowsFullscreenVideo={true}
        allowsInlineMediaPlayback={true}
        mixedContentMode="always"
        // User Agent personalizado
        userAgent="Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 StreamPayAPK/2.0"
        // Mejoras de rendimiento
        cacheEnabled={true}
        incognito={false}
        // Android specific
        androidLayerType="hardware"
        androidHardwareAccelerationDisabled={false}
        // Permitir apertura de ventanas
        setSupportMultipleWindows={false}
        // Gestión de menú contextual
        onShouldStartLoadWithRequest={(request) => {
          // Permitir navegación dentro del dominio
          return true;
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  webview: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
});