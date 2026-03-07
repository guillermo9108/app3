import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  BackHandler,
  Alert,
  TouchableOpacity,
  Text,
  Animated,
  ScrollView,
  Platform,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Notifications from 'expo-notifications';
import * as FileSystem from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';

// Regex para detectar extensiones de archivos descargables
const DOWNLOAD_EXTENSIONS = /\.(mp4|mkv|avi|mov|wmv|flv|webm|mp3|aac|flac|wav|ogg|pdf|zip|rar|7z|doc|docx|xls|xlsx|ppt|pptx|apk|exe|dmg|iso)/i;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

interface DownloadItem {
  id: string;
  filename: string;
  url: string;
  progress: number;
  speed: string;
  status: 'downloading' | 'completed' | 'failed' | 'paused';
  filePath?: string;
  size?: string;
  totalSize?: number;
  downloadedBytes?: number;
  downloadedAt?: Date;
  error?: string;
}

interface PermissionStatus {
  notifications: boolean;
  mediaLibrary: boolean;
  allGranted: boolean;
}

export default function WebViewScreen() {
  const webViewRef = useRef<WebView>(null);
  const router = useRouter();
  const [serverUrl, setServerUrl] = useState('');
  const [canGoBack, setCanGoBack] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showFab, setShowFab] = useState(false);
  const [showDownloads, setShowDownloads] = useState(false);
  const [activeDownloads, setActiveDownloads] = useState<DownloadItem[]>([]);
  const [downloadHistory, setDownloadHistory] = useState<DownloadItem[]>([]);
  const [permissionsChecked, setPermissionsChecked] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [permissions, setPermissions] = useState<PermissionStatus>({
    notifications: false,
    mediaLibrary: false,
    allGranted: false,
  });

  const isVideoPlayingRef = useRef(false);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const showMenuRef = useRef(false);
  const showDownloadsRef = useRef(false);
  const downloadResumablesRef = useRef<Map<string, FileSystem.DownloadResumable>>(new Map());

  const fabPosition = useRef(new Animated.Value(-60)).current;
  const swipeIndicatorOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => { showMenuRef.current = showMenu; }, [showMenu]);
  useEffect(() => { showDownloadsRef.current = showDownloads; }, [showDownloads]);

  // ==================== SISTEMA DE PERMISOS ====================
  const checkPermissions = async (): Promise<PermissionStatus> => {
    try {
      const notifStatus = await Notifications.getPermissionsAsync();
      const notificationsGranted = notifStatus.status === 'granted';

      const mediaStatus = await MediaLibrary.getPermissionsAsync();
      const mediaLibraryGranted = mediaStatus.status === 'granted';

      const status: PermissionStatus = {
        notifications: notificationsGranted,
        mediaLibrary: mediaLibraryGranted,
        allGranted: notificationsGranted && mediaLibraryGranted,
      };

      setPermissions(status);
      return status;
    } catch (error) {
      console.error('[StreamPay] Error verificando permisos:', error);
      return { notifications: false, mediaLibrary: false, allGranted: false };
    }
  };

  const requestAllPermissions = async () => {
    try {
      const notifResult = await Notifications.requestPermissionsAsync();
      const notificationsGranted = notifResult.status === 'granted';

      const mediaResult = await MediaLibrary.requestPermissionsAsync();
      const mediaLibraryGranted = mediaResult.status === 'granted';

      const newStatus: PermissionStatus = {
        notifications: notificationsGranted,
        mediaLibrary: mediaLibraryGranted,
        allGranted: notificationsGranted && mediaLibraryGranted,
      };

      setPermissions(newStatus);
      setShowPermissionModal(false);

      if (!newStatus.allGranted) {
        const missingPerms = [];
        if (!notificationsGranted) missingPerms.push('Notificaciones');
        if (!mediaLibraryGranted) missingPerms.push('Almacenamiento');

        Alert.alert(
          'Permisos pendientes',
          `Los siguientes permisos no fueron otorgados: ${missingPerms.join(', ')}.\n\nPuedes otorgarlos más tarde desde la configuración de la aplicación.`,
          [
            { text: 'Abrir Configuración', onPress: () => Linking.openSettings() },
            { text: 'Continuar', style: 'cancel' }
          ]
        );
      }

      return newStatus;
    } catch (error) {
      console.error('[StreamPay] Error solicitando permisos:', error);
      setShowPermissionModal(false);
      return permissions;
    }
  };

  const initializePermissions = async () => {
    const status = await checkPermissions();
    setPermissionsChecked(true);

    if (!status.allGranted) {
      setShowPermissionModal(true);
    }
  };

  // ==================== FUNCIONES FAB ====================
  const clearHideTimeout = useCallback(() => {
    if (hideTimeoutRef.current) { 
      clearTimeout(hideTimeoutRef.current); 
      hideTimeoutRef.current = null; 
    }
  }, []);

  const hideFabButton = useCallback(() => {
    clearHideTimeout();
    Animated.spring(fabPosition, { toValue: -60, useNativeDriver: true, tension: 50, friction: 7 }).start(() => {
      setShowFab(false);
      setShowMenu(false);
    });
    Animated.timing(swipeIndicatorOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [fabPosition, swipeIndicatorOpacity, clearHideTimeout]);

  const startHideTimeout = useCallback(() => {
    clearHideTimeout();
    hideTimeoutRef.current = setTimeout(() => {
      if (!showMenuRef.current && !showDownloadsRef.current) hideFabButton();
    }, 3000);
  }, [clearHideTimeout, hideFabButton]);

  const showFabButton = useCallback(() => {
    setShowFab(true);
    Animated.spring(fabPosition, { toValue: 16, useNativeDriver: true, tension: 50, friction: 7 }).start();
    Animated.timing(swipeIndicatorOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    startHideTimeout();
  }, [fabPosition, swipeIndicatorOpacity, startHideTimeout]);

  const handleIndicatorPress = useCallback(() => { showFabButton(); }, [showFabButton]);

  // ==================== FUNCIONES FULLSCREEN ====================
  const enterVideoFullscreen = useCallback(() => {
    webViewRef.current?.injectJavaScript(`
      (function() {
        try {
          const v = document.querySelector('video');
          if (v) {
            if (v.requestFullscreen) v.requestFullscreen();
            else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
            v.style.position = 'fixed';
            v.style.top = '0';
            v.style.left = '0';
            v.style.width = '100vw';
            v.style.height = '100vh';
            v.style.zIndex = '999999';
            v.style.backgroundColor = 'black';
            v.style.objectFit = 'contain';
          }
        } catch(e) {}
      })();
      true;
    `);
  }, []);

  const exitFullscreen = () => {
    webViewRef.current?.injectJavaScript(`
      try {
        if (document.fullscreenElement) document.exitFullscreen();
        const v = document.querySelector('video');
        if (v) { v.style.position = ''; v.style.width = ''; v.style.height = ''; }
      } catch(e) {}
      true;
    `);
  };

  const handleBackPress = useCallback(() => {
    if (showDownloadsRef.current) { setShowDownloads(false); return true; }
    if (showMenuRef.current) { setShowMenu(false); startHideTimeout(); return true; }
    if (isFullscreen) { exitFullscreen(); return true; }
    if (showFab) { hideFabButton(); return true; }
    if (canGoBack && webViewRef.current) { webViewRef.current.goBack(); return true; }
    return false;
  }, [canGoBack, showFab, isFullscreen, hideFabButton, startHideTimeout]);

  // ==================== EFECTOS ====================
  useEffect(() => {
    loadServerUrl();
    loadDownloadHistory();
    initializePermissions();

    const subscription = ScreenOrientation.addOrientationChangeListener((event) => {
      const orientation = event.orientationInfo.orientation;
      if (isVideoPlayingRef.current && (orientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT || orientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT)) {
        setIsFullscreen(true);
        enterVideoFullscreen();
      } else if (orientation === ScreenOrientation.Orientation.PORTRAIT_UP) {
        setIsFullscreen(false);
      }
    });

    const backHandler = BackHandler.addEventListener('hardwareBackPress', handleBackPress);

    return () => {
      backHandler.remove();
      subscription.remove();
      clearHideTimeout();
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT).catch(() => {});
    };
  }, [handleBackPress, enterVideoFullscreen]);

  const loadServerUrl = async () => {
    try {
      const url = await AsyncStorage.getItem('SERVER_URL');
      if (url) setServerUrl(url); 
      else router.replace('/config');
    } catch (error) { 
      router.replace('/config'); 
    }
  };

  const loadDownloadHistory = async () => {
    try {
      const history = await AsyncStorage.getItem('DOWNLOAD_HISTORY');
      if (history) setDownloadHistory(JSON.parse(history));
    } catch (error) {
      console.error('[StreamPay] Error cargando historial:', error);
    }
  };

  const saveDownloadHistory = async (history: DownloadItem[]) => {
    try { 
      await AsyncStorage.setItem('DOWNLOAD_HISTORY', JSON.stringify(history.slice(0, 100))); 
    } catch (error) {
      console.error('[StreamPay] Error guardando historial:', error);
    }
  };

  // ==================== SISTEMA DE DESCARGAS MEJORADO ====================
  
  const extractFilenameFromUrl = (url: string, fallbackId: string): string => {
    try {
      const urlObj = new URL(url);
      
      const filenameParam = urlObj.searchParams.get('filename') || 
                           urlObj.searchParams.get('file') ||
                           urlObj.searchParams.get('name') ||
                           urlObj.searchParams.get('title');
      
      if (filenameParam) {
        return decodeURIComponent(filenameParam);
      }

      const pathParts = urlObj.pathname.split('/').filter(p => p.length > 0);
      const lastPart = pathParts[pathParts.length - 1];
      
      if (lastPart && lastPart.includes('.')) {
        return decodeURIComponent(lastPart);
      }

      const queryString = urlObj.search;
      const extMatch = queryString.match(/\.(mp4|mkv|avi|mov|mp3|pdf|zip|rar|apk|doc|docx|xls|xlsx)/i);
      if (extMatch) {
        const fullMatch = queryString.match(/[&?]filename=([^&]+)/i) || 
                         queryString.match(/[&?]file=([^&]+)/i);
        if (fullMatch) {
          return decodeURIComponent(fullMatch[1]);
        }
      }

      return `descarga_${fallbackId}.mp4`;
    } catch (error) {
      console.error('[StreamPay] Error extrayendo nombre:', error);
      return `descarga_${fallbackId}.mp4`;
    }
  };

  const sanitizeFilename = (filename: string): string => {
    let clean = filename.replace(/[<>:"\/\\|?*-\x1F]/g, '_');
    clean = clean.replace(/_+/g, '_');
    clean = clean.replace(/^_+|_+$/g, '');
    
    if (clean.length > 200) {
      const ext = clean.match(/\.[^.]+$/)?.[0] || '';
      clean = clean.substring(0, 200 - ext.length) + ext;
    }
    
    if (!/\.[a-z0-9]+$/i.test(clean)) {
      clean += '.mp4';
    }
    
    return clean || 'descarga.mp4';
  };

  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSecond: number): string => {
    return formatBytes(bytesPerSecond) + '/s';
  };

  const handleMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      
      if (data.type === 'fullscreenchange') {
        setIsFullscreen(data.isFullscreen);
        if (data.isFullscreen) await ScreenOrientation.unlockAsync();
        else await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
      }
      
      if (data.type === 'videoState') {
        isVideoPlayingRef.current = data.isPlaying;
        if (data.isPlaying) await ScreenOrientation.unlockAsync();
      }
      
      if (data.type === 'download') {
        handleDownload(data.url, data.filename || '');
      }
    } catch (error) {
      console.error('[StreamPay] Error mensaje:', error);
    }
  };

  const handleDownload = async (url: string, suggestedFilename: string = '') => {
    const downloadId = Date.now().toString();
    
    if (!permissions.mediaLibrary) {
      const newStatus = await requestAllPermissions();
      if (!newStatus.mediaLibrary) {
        Alert.alert(
          'Permiso requerido',
          'Se necesita acceso al almacenamiento para descargar archivos.',
          [
            { text: 'Abrir Configuración', onPress: () => Linking.openSettings() },
            { text: 'Cancelar', style: 'cancel' }
          ]
        );
        return;
      }
    }

    let filename = suggestedFilename || extractFilenameFromUrl(url, downloadId);
    filename = sanitizeFilename(filename);

    console.log('[StreamPay] Iniciando descarga:', { url: url.substring(0, 100), filename });

    const newDownload: DownloadItem = {
      id: downloadId,
      filename,
      url,
      progress: 0,
      speed: '0 B/s',
      status: 'downloading',
      downloadedBytes: 0,
      totalSize: 0,
    };

    setActiveDownloads(prev => [...prev, newDownload]);
    setShowDownloads(true);

    let lastBytes = 0;
    let lastTime = Date.now();

    try {
      const downloadPath = `${FileSystem.cacheDirectory}${filename}`;
      
      const downloadResumable = FileSystem.createDownloadResumable(
        url,
        downloadPath,
        {
          headers: {
            'Accept': '*/*',
            'Accept-Encoding': 'identity',
            'Connection': 'keep-alive',
          },
        },
        (downloadProgress) => {
          const { totalBytesWritten, totalBytesExpectedToWrite } = downloadProgress;
          
          let progress = 0;
          if (totalBytesExpectedToWrite > 0) {
            progress = (totalBytesWritten / totalBytesExpectedToWrite) * 100;
          } else if (totalBytesWritten > 0) {
            progress = Math.min(99, totalBytesWritten / 1000000);
          }

          const now = Date.now();
          const timeDiff = (now - lastTime) / 1000;
          let speed = '0 B/s';
          
          if (timeDiff > 0.5) {
            const bytesDiff = totalBytesWritten - lastBytes;
            speed = formatSpeed(bytesDiff / timeDiff);
            lastBytes = totalBytesWritten;
            lastTime = now;
          }

          setActiveDownloads(prev => prev.map(d => 
            d.id === downloadId 
              ? { 
                  ...d, 
                  progress: Math.min(progress, 99.9),
                  speed,
                  downloadedBytes: totalBytesWritten,
                  totalSize: totalBytesExpectedToWrite,
                  size: totalBytesExpectedToWrite > 0 
                    ? `${formatBytes(totalBytesWritten)} / ${formatBytes(totalBytesExpectedToWrite)}`
                    : formatBytes(totalBytesWritten),
                } 
              : d
          ));
        }
      );

      downloadResumablesRef.current.set(downloadId, downloadResumable);

      const result = await downloadResumable.downloadAsync();

      downloadResumablesRef.current.delete(downloadId);

      if (result && result.uri) {
        const fileInfo = await FileSystem.getInfoAsync(result.uri);
        const fileSize = fileInfo.exists ? (fileInfo as any).size || 0 : 0;

        let savedToGallery = false;
        try {
          const asset = await MediaLibrary.createAssetAsync(result.uri);
          const album = await MediaLibrary.getAlbumAsync('StreamPay');
          if (album) {
            await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
          } else {
            await MediaLibrary.createAlbumAsync('StreamPay', asset, false);
          }
          savedToGallery = true;
        } catch (mediaError) {
          console.warn('[StreamPay] No se pudo guardar en galería:', mediaError);
        }

        const completedDownload: DownloadItem = {
          id: downloadId,
          filename,
          url,
          progress: 100,
          speed: '0 B/s',
          status: 'completed',
          filePath: result.uri,
          size: formatBytes(fileSize),
          downloadedAt: new Date(),
        };

        setActiveDownloads(prev => prev.filter(d => d.id !== downloadId));
        setDownloadHistory(prev => {
          const newHistory = [completedDownload, ...prev.filter(d => d.id !== downloadId)].slice(0, 100);
          saveDownloadHistory(newHistory);
          return newHistory;
        });

        if (permissions.notifications) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: '✅ Descarga completada',
              body: filename,
              data: { filePath: result.uri },
            },
            trigger: null,
          });
        }

        console.log('[StreamPay] Descarga completada:', { filename, size: formatBytes(fileSize), savedToGallery });

      } else {
        throw new Error('No se recibió URI del archivo descargado');
      }

    } catch (error: any) {
      console.error('[StreamPay] Error en descarga:', error);
      
      downloadResumablesRef.current.delete(downloadId);

      const errorMessage = error?.message || 'Error desconocido';
      
      setActiveDownloads(prev => prev.map(d => 
        d.id === downloadId 
          ? { ...d, status: 'failed', error: errorMessage } 
          : d
      ));

      Alert.alert(
        'Error en descarga',
        `No se pudo descargar: ${filename}\n\nError: ${errorMessage}\n\n¿Qué desea hacer?`,
        [
          { 
            text: 'Cancelar', 
            style: 'cancel',
            onPress: () => setActiveDownloads(prev => prev.filter(d => d.id !== downloadId))
          },
          { 
            text: 'Reintentar', 
            onPress: () => {
              setActiveDownloads(prev => prev.filter(d => d.id !== downloadId));
              handleDownload(url, filename);
            }
          },
          {
            text: 'Abrir en navegador',
            onPress: () => {
              setActiveDownloads(prev => prev.filter(d => d.id !== downloadId));
              Linking.openURL(url);
            }
          }
        ]
      );
    }
  };

  const cancelDownload = async (downloadId: string) => {
    const resumable = downloadResumablesRef.current.get(downloadId);
    if (resumable) {
      try {
        await resumable.pauseAsync();
      } catch (e) {}
      downloadResumablesRef.current.delete(downloadId);
    }
    setActiveDownloads(prev => prev.filter(d => d.id !== downloadId));
  };

  const retryDownload = (item: DownloadItem) => {
    setActiveDownloads(prev => prev.filter(d => d.id !== item.id));
    handleDownload(item.url, item.filename);
  };

  const handleShouldStartLoadWithRequest = (request: WebViewNavigation): boolean => {
    const { url } = request;
    
    const hasDownloadParam = url.includes('download=1') || url.includes('download=true');
    const hasDownloadExtension = DOWNLOAD_EXTENSIONS.test(url);
    const isStreamAction = url.includes('action=stream') && !url.includes('download=1');
    
    const shouldDownload = hasDownloadParam || (hasDownloadExtension && !isStreamAction);

    if (shouldDownload) {
      console.log('[StreamPay] Descarga detectada:', url.substring(0, 100));
      handleDownload(url, '');
      return false;
    }
    
    return true;
  };

  const openFile = async (item: DownloadItem) => {
    if (!item.filePath) {
      Alert.alert('Error', 'Archivo no encontrado');
      return;
    }

    try {
      const fileInfo = await FileSystem.getInfoAsync(item.filePath);
      if (!fileInfo.exists) {
        Alert.alert('Error', 'El archivo ya no existe en el dispositivo');
        const newHistory = downloadHistory.filter(d => d.id !== item.id);
        setDownloadHistory(newHistory);
        saveDownloadHistory(newHistory);
        return;
      }

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(item.filePath, {
          mimeType: getMimeType(item.filename),
          dialogTitle: `Abrir ${item.filename}`,
        });
      } else {
        Alert.alert('Error', 'Compartir archivos no está disponible');
      }
    } catch (error) {
      console.error('[StreamPay] Error abriendo archivo:', error);
      Alert.alert('Error', 'No se pudo abrir el archivo');
    }
  };

  const getMimeType = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase();
    const mimeTypes: { [key: string]: string } = {
      'mp4': 'video/mp4',
      'mkv': 'video/x-matroska',
      'avi': 'video/x-msvideo',
      'mov': 'video/quicktime',
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'pdf': 'application/pdf',
      'zip': 'application/zip',
      'rar': 'application/x-rar-compressed',
      'apk': 'application/vnd.android.package-archive',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    return mimeTypes[ext || ''] || 'application/octet-stream';
  };

  const deleteDownload = async (item: DownloadItem) => {
    Alert.alert(
      'Eliminar descarga',
      `¿Eliminar "${item.filename}" del historial y dispositivo?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            if (item.filePath) {
              try {
                await FileSystem.deleteAsync(item.filePath, { idempotent: true });
              } catch (e) {
                console.warn('[StreamPay] Error eliminando archivo:', e);
              }
            }
            
            const newHistory = downloadHistory.filter(d => d.id !== item.id);
            setDownloadHistory(newHistory);
            saveDownloadHistory(newHistory);
          }
        }
      ]
    );
  };

  const clearAllHistory = () => {
    Alert.alert(
      'Limpiar historial',
      '¿Eliminar todo el historial de descargas? Los archivos descargados NO serán eliminados.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Limpiar',
          style: 'destructive',
          onPress: () => {
            setDownloadHistory([]);
            saveDownloadHistory([]);
          }
        }
      ]
    );
  };

  const injectedJavaScript = `
    (function() {
      if (window.__streamPayInjected) return;
      window.__streamPayInjected = true;
      
      const notify = (type, payload) => {
        try { 
          window.ReactNativeWebView.postMessage(JSON.stringify({ type, ...payload })); 
        } catch(e) {
          console.error('StreamPay notify error:', e);
        }
      };
      
      document.addEventListener('click', function(e) {
        const a = e.target.closest('a');
        if (a && a.href) {
          const url = a.href;
          const hasDownloadAttr = a.hasAttribute('download');
          const hasDownloadParam = url.includes('download=1') || url.includes('download=true');
          const hasDownloadExt = /\\.(mp4|mkv|avi|mov|mp3|wav|pdf|zip|rar|apk|doc|docx)/i.test(url);
          const isStream = url.includes('action=stream') && !hasDownloadParam;
          
          if (hasDownloadAttr || hasDownloadParam || (hasDownloadExt && !isStream)) {
            e.preventDefault();
            e.stopPropagation();
            const filename = a.getAttribute('download') || a.getAttribute('data-filename') || '';
            notify('download', { url: url, filename: filename });
            return false;
          }
        }
      }, true);

      const checkVideos = () => {
        document.querySelectorAll('video').forEach(v => {
          if (!v.hasAttribute('data-sp-observed')) {
            v.setAttribute('data-sp-observed', '1');
            v.addEventListener('play', () => notify('videoState', { isPlaying: true }));
            v.addEventListener('pause', () => notify('videoState', { isPlaying: false }));
            v.addEventListener('ended', () => notify('videoState', { isPlaying: false }));
          }
        });
      };
      
      setInterval(checkVideos, 2000);
      checkVideos();
      
      document.addEventListener('fullscreenchange', () => {
        notify('fullscreenchange', { isFullscreen: !!document.fullscreenElement });
      });
      
      document.addEventListener('webkitfullscreenchange', () => {
        notify('fullscreenchange', { isFullscreen: !!document.webkitFullscreenElement });
      });
    })();
    true;
  `;

  if (!serverUrl) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" hidden={isFullscreen} />
      
      {showPermissionModal && (
        <View style={styles.permissionModal}>
          <View style={styles.permissionContent}>
            <Ionicons name="shield-checkmark" size={48} color="#6366f1" style={{ marginBottom: 16 }} />
            <Text style={styles.permissionTitle}>Permisos necesarios</Text>
            <Text style={styles.permissionText}>
              StreamPay necesita los siguientes permisos para funcionar correctamente:
            </Text>
            
            <View style={styles.permissionList}>
              <View style={styles.permissionItem}>
                <Ionicons 
                  name={permissions.mediaLibrary ? "checkmark-circle" : "close-circle"} 
                  size={24} 
                  color={permissions.mediaLibrary ? "#10b981" : "#ef4444"} 
                />
                <Text style={styles.permissionItemText}>Almacenamiento (para guardar descargas)</Text>
              </View>
              <View style={styles.permissionItem}>
                <Ionicons 
                  name={permissions.notifications ? "checkmark-circle" : "close-circle"} 
                  size={24} 
                  color={permissions.notifications ? "#10b981" : "#ef4444"} 
                />
                <Text style={styles.permissionItemText}>Notificaciones (alertas de descarga)</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.permissionButton} onPress={requestAllPermissions}>
              <Text style={styles.permissionButtonText}>Otorgar permisos</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.permissionSkipButton} 
              onPress={() => setShowPermissionModal(false)}
            >
              <Text style={styles.permissionSkipText}>Continuar sin permisos</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <WebView
        ref={webViewRef}
        source={{ uri: serverUrl }}
        style={styles.webview}
        onNavigationStateChange={(navState) => setCanGoBack(navState.canGoBack)}
        onMessage={handleMessage}
        injectedJavaScript={injectedJavaScript}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowsFullscreenVideo={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
        onFileDownload={({ nativeEvent }) => {
          console.log('[StreamPay] onFileDownload:', nativeEvent);
          handleDownload(nativeEvent.downloadUrl, '');
        }}
        originWhitelist={['*']}
        mixedContentMode="always"
        allowUniversalAccessFromFileURLs={true}
        allowFileAccessFromFileURLs={true}
        cacheEnabled={true}
        thirdPartyCookiesEnabled={true}
      />

      {!isFullscreen && (
        <>
          {!showFab && (
            <TouchableOpacity style={styles.swipeIndicator} onPress={handleIndicatorPress}>
              <Animated.View style={{ opacity: swipeIndicatorOpacity }}>
                <Ionicons name="chevron-forward" size={20} color="#6366f1" />
              </Animated.View>
            </TouchableOpacity>
          )}
          
          <Animated.View style={[styles.fabContainer, { transform: [{ translateX: fabPosition }] }]}>
            <TouchableOpacity style={styles.fab} onPress={() => setShowMenu(!showMenu)}>
              <Ionicons name={showMenu ? "close" : "menu"} size={24} color="#ffffff" />
            </TouchableOpacity>
          </Animated.View>
          
          {showMenu && (
            <>
              <TouchableOpacity style={styles.menuOverlay} onPress={() => setShowMenu(false)} />
              <Animated.View style={[styles.menu, { transform: [{ translateX: fabPosition }] }]}>
                <TouchableOpacity 
                  style={styles.menuItem} 
                  onPress={() => { setShowMenu(false); webViewRef.current?.reload(); }}
                >
                  <Ionicons name="refresh-outline" size={20} color="#e2e8f0" />
                  <Text style={styles.menuText}>Recargar</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.menuItem} 
                  onPress={() => { setShowMenu(false); setShowDownloads(true); }}
                >
                  <Ionicons name="download-outline" size={20} color="#e2e8f0" />
                  <Text style={styles.menuText}>Descargas</Text>
                  {(activeDownloads.length > 0 || downloadHistory.length > 0) && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>
                        {activeDownloads.length > 0 ? activeDownloads.length : downloadHistory.length}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.menuItem} 
                  onPress={() => router.push('/config')}
                >
                  <Ionicons name="settings-outline" size={20} color="#e2e8f0" />
                  <Text style={styles.menuText}>Configuración</Text>
                </TouchableOpacity>
              </Animated.View>
            </>
          )}
        </>
      )}

      {showDownloads && !isFullscreen && (
        <View style={styles.downloadsModal}>
          <View style={styles.downloadsHeader}>
            <Text style={styles.downloadsTitle}>Descargas</Text>
            <View style={styles.headerActions}>
              {downloadHistory.length > 0 && (
                <TouchableOpacity onPress={clearAllHistory} style={styles.headerButton}>
                  <Ionicons name="trash-outline" size={22} color="#ef4444" />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setShowDownloads(false)} style={styles.headerButton}>
                <Ionicons name="close" size={24} color="#e2e8f0" />
              </TouchableOpacity>
            </View>
          </View>
          
          <ScrollView style={styles.downloadsContent} showsVerticalScrollIndicator={false}>
            {activeDownloads.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>
                  <Ionicons name="cloud-download" size={16} color="#6366f1" /> Descargando
                </Text>
                {activeDownloads.map(item => (
                  <View key={item.id} style={styles.downloadItem}>
                    <View style={styles.downloadInfo}>
                      <Text style={styles.downloadFilename} numberOfLines={2}>{item.filename}</Text>
                      <View style={styles.downloadMeta}>
                        <Text style={styles.downloadSize}>{item.size || '0 B'}</Text>
                        <Text style={styles.downloadSpeed}>{item.speed}</Text>
                      </View>
                    </View>
                    
                    <View style={styles.progressContainer}>
                      <View style={styles.progressBg}>
                        <View 
                          style={[
                            styles.progressBar, 
                            { width: `${item.progress}%` },
                            item.status === 'failed' && styles.progressBarFailed
                          ]} 
                        />
                      </View>
                      <Text style={styles.progressText}>{Math.round(item.progress)}%</Text>
                    </View>
                    
                    {item.status === 'failed' && (
                      <View style={styles.errorContainer}>
                        <Text style={styles.errorText}>{item.error || 'Error desconocido'}</Text>
                      </View>
                    )}
                    
                    <View style={styles.downloadActions}>
                      {item.status === 'failed' ? (
                        <>
                          <TouchableOpacity 
                            style={styles.actionButton} 
                            onPress={() => retryDownload(item)}
                          >
                            <Ionicons name="refresh" size={20} color="#6366f1" />
                            <Text style={styles.actionText}>Reintentar</Text>
                          </TouchableOpacity>
                          <TouchableOpacity 
                            style={styles.actionButton} 
                            onPress={() => cancelDownload(item.id)}
                          >
                            <Ionicons name="close" size={20} color="#ef4444" />
                            <Text style={[styles.actionText, { color: '#ef4444' }]}>Cancelar</Text>
                          </TouchableOpacity>
                        </>
                      ) : (
                        <TouchableOpacity 
                          style={styles.actionButton} 
                          onPress={() => cancelDownload(item.id)}
                        >
                          <Ionicons name="stop" size={20} color="#ef4444" />
                          <Text style={[styles.actionText, { color: '#ef4444' }]}>Cancelar</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))}
              </>
            )}
            
            {downloadHistory.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>
                  <Ionicons name="time" size={16} color="#6366f1" /> Historial
                </Text>
                {downloadHistory.map(item => (
                  <View key={item.id} style={styles.downloadItem}>
                    <View style={styles.downloadInfo}>
                      <Text style={styles.downloadFilename} numberOfLines={2}>{item.filename}</Text>
                      <View style={styles.downloadMeta}>
                        <Text style={styles.downloadSize}>{item.size}</Text>
                        {item.downloadedAt && (
                          <Text style={styles.downloadDate}>
                            {new Date(item.downloadedAt).toLocaleDateString()}
                          </Text>
                        )}
                      </View>
                    </View>
                    
                    <View style={styles.downloadActions}>
                      <TouchableOpacity 
                        style={styles.actionButton} 
                        onPress={() => openFile(item)}
                      >
                        <Ionicons name="share-outline" size={20} color="#6366f1" />
                        <Text style={styles.actionText}>Abrir</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={styles.actionButton} 
                        onPress={() => deleteDownload(item)}
                      >
                        <Ionicons name="trash-outline" size={20} color="#ef4444" />
                        <Text style={[styles.actionText, { color: '#ef4444' }]}>Eliminar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </>
            )}
            
            {activeDownloads.length === 0 && downloadHistory.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="cloud-download-outline" size={64} color="#475569" />
                <Text style={styles.emptyTitle}>Sin descargas</Text>
                <Text style={styles.emptyText}>
                  Las descargas aparecerán aquí cuando descargues archivos desde la web.
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#0f172a',
    justifyContent: 'center',
  },
  webview: { 
    flex: 1 
  },
  swipeIndicator: { 
    position: 'absolute', 
    top: 60, 
    left: 0, 
    width: 28, 
    height: 44, 
    backgroundColor: 'rgba(30, 41, 59, 0.9)', 
    borderTopRightRadius: 10, 
    borderBottomRightRadius: 10, 
    justifyContent: 'center', 
    alignItems: 'center', 
    zIndex: 100 
  },
  fabContainer: { 
    position: 'absolute', 
    top: 50, 
    left: 0, 
    zIndex: 101 
  },
  fab: { 
    width: 48, 
    height: 48, 
    borderRadius: 24, 
    backgroundColor: '#6366f1', 
    justifyContent: 'center', 
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  menuOverlay: { 
    ...StyleSheet.absoluteFillObject, 
    backgroundColor: 'rgba(0,0,0,0.5)', 
    zIndex: 102 
  },
  menu: { 
    position: 'absolute', 
    top: 105, 
    left: 0, 
    backgroundColor: '#1e293b', 
    borderRadius: 12, 
    paddingVertical: 8, 
    minWidth: 220, 
    zIndex: 103,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  menuItem: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  menuText: { 
    color: '#e2e8f0', 
    fontSize: 16, 
    marginLeft: 12,
    flex: 1,
  },
  badge: {
    backgroundColor: '#6366f1',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  downloadsModal: { 
    ...StyleSheet.absoluteFillObject, 
    backgroundColor: '#0f172a', 
    zIndex: 200 
  },
  downloadsHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50, 
    paddingBottom: 16,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  downloadsTitle: { 
    color: '#e2e8f0', 
    fontSize: 22, 
    fontWeight: 'bold' 
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerButton: {
    padding: 8,
  },
  downloadsContent: { 
    flex: 1,
    padding: 16 
  },
  sectionTitle: { 
    color: '#94a3b8', 
    fontSize: 14, 
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  downloadItem: { 
    backgroundColor: '#1e293b', 
    borderRadius: 12, 
    padding: 14, 
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  downloadInfo: {
    marginBottom: 10,
  },
  downloadFilename: { 
    color: '#e2e8f0',
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 4,
  },
  downloadMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  downloadSize: {
    color: '#94a3b8',
    fontSize: 13,
  },
  downloadSpeed: {
    color: '#6366f1',
    fontSize: 13,
    fontWeight: '500',
  },
  downloadDate: {
    color: '#64748b',
    fontSize: 12,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  progressBg: {
    flex: 1,
    height: 6,
    backgroundColor: '#334155',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: { 
    height: '100%',
    backgroundColor: '#6366f1',
    borderRadius: 3,
  },
  progressBarFailed: {
    backgroundColor: '#ef4444',
  },
  progressText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
    minWidth: 40,
    textAlign: 'right',
  },
  errorContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 6,
    padding: 8,
    marginBottom: 10,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
  },
  downloadActions: { 
    flexDirection: 'row', 
    gap: 12,
    marginTop: 4,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderRadius: 8,
  },
  actionText: {
    color: '#6366f1',
    fontSize: 14,
    fontWeight: '500',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    color: '#e2e8f0',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    color: '#64748b',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 20,
  },
  permissionModal: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 300,
    padding: 20,
  },
  permissionContent: {
    backgroundColor: '#1e293b',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  permissionTitle: {
    color: '#e2e8f0',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  permissionText: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  permissionList: {
    width: '100%',
    marginBottom: 24,
  },
  permissionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  permissionItemText: {
    color: '#e2e8f0',
    fontSize: 14,
    flex: 1,
  },
  permissionButton: {
    backgroundColor: '#6366f1',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    marginBottom: 12,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  permissionSkipButton: {
    paddingVertical: 10,
  },
  permissionSkipText: {
    color: '#64748b',
    fontSize: 14,
  },
});