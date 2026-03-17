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
  AppState,
  AppStateStatus,
  Image,
  Dimensions,
} from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Notifications from 'expo-notifications';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import * as IntentLauncher from 'expo-intent-launcher';
import * as MediaLibrary from 'expo-media-library';
import * as VideoThumbnails from 'expo-video-thumbnails';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const DOWNLOAD_EXTENSIONS = /\.(mp4|mkv|avi|mov|wmv|flv|webm|mp3|aac|flac|wav|ogg|pdf|zip|rar|7z|doc|docx|xls|xlsx|ppt|pptx|apk|exe|dmg|iso)/i;

// Configurar canales de notificaciones para Android
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('downloads', {
    name: 'Descargas',
    importance: Notifications.AndroidImportance.LOW,
    vibrationPattern: [0],
    lightColor: '#6366f1',
    enableVibrate: false,
    showBadge: false,
    sound: undefined,
  });

  Notifications.setNotificationChannelAsync('downloads-complete', {
    name: 'Descargas Completadas',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250],
    lightColor: '#10b981',
    enableVibrate: true,
    showBadge: true,
    sound: 'default',
  });

  // Canal para notificaciones del sitio web
  Notifications.setNotificationChannelAsync('web-notifications', {
    name: 'Notificaciones del Sitio',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#6366f1',
    enableVibrate: true,
    showBadge: true,
    sound: 'default',
  });

  // Canal para controles de audio en segundo plano
  Notifications.setNotificationChannelAsync('media-playback', {
    name: 'Reproducción de Audio',
    importance: Notifications.AndroidImportance.LOW,
    vibrationPattern: [0],
    lightColor: '#6366f1',
    enableVibrate: false,
    showBadge: false,
    sound: undefined,
  });
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    priority: Notifications.AndroidNotificationPriority.HIGH,
  }),
});

interface DownloadItem {
  id: string;
  filename: string;
  url: string;
  progress: number;
  speed: string;
  status: 'downloading' | 'completed' | 'failed' | 'paused' | 'queued';
  filePath?: string;
  size?: string;
  totalSize?: number;
  downloadedBytes?: number;
  downloadedAt?: Date;
  error?: string;
  notificationId?: string;
  thumbnailUri?: string;
  duration?: string;
  resumeData?: string;
}

interface PermissionStatus {
  notifications: boolean;
  mediaLibrary: boolean;
  allGranted: boolean;
}

interface MediaInfo {
  isPlaying: boolean;
  isVideo: boolean;
  isAudio: boolean;
  title?: string;
  artist?: string;
  thumbnail?: string;
  duration?: number;
  currentTime?: number;
  videoWidth?: number;
  videoHeight?: number;
  isLandscape?: boolean;
}

interface WebNotification {
  id: string;
  title: string;
  body: string;
  icon?: string;
  image?: string;
  tag?: string;
  timestamp: number;
}

interface PlaybackHistoryItem {
  id: string;
  url: string;
  title: string;
  currentTime: number;
  duration: number;
  progress: number;
  thumbnail?: string;
  lastPlayed: Date;
  completed: boolean;
}

const MIME_TYPES: { [key: string]: string } = {
  'mp4': 'video/mp4',
  'mkv': 'video/x-matroska',
  'avi': 'video/x-msvideo',
  'mov': 'video/quicktime',
  'wmv': 'video/x-ms-wmv',
  'flv': 'video/x-flv',
  'webm': 'video/webm',
  '3gp': 'video/3gpp',
  'm4v': 'video/x-m4v',
  'mp3': 'audio/mpeg',
  'wav': 'audio/wav',
  'aac': 'audio/aac',
  'flac': 'audio/flac',
  'ogg': 'audio/ogg',
  'm4a': 'audio/mp4',
  'wma': 'audio/x-ms-wma',
  'pdf': 'application/pdf',
  'doc': 'application/msword',
  'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'xls': 'application/vnd.ms-excel',
  'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'ppt': 'application/vnd.ms-powerpoint',
  'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'txt': 'text/plain',
  'rtf': 'application/rtf',
  'zip': 'application/zip',
  'rar': 'application/x-rar-compressed',
  '7z': 'application/x-7z-compressed',
  'tar': 'application/x-tar',
  'gz': 'application/gzip',
  'apk': 'application/vnd.android.package-archive',
  'exe': 'application/x-msdownload',
  'dmg': 'application/x-apple-diskimage',
  'iso': 'application/x-iso9660-image',
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'gif': 'image/gif',
  'webp': 'image/webp',
  'bmp': 'image/bmp',
};

const isVideoFile = (filename: string): boolean => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', '3gp', 'm4v'].includes(ext);
};

const isAudioFile = (filename: string): boolean => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a', 'wma'].includes(ext);
};

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
  const [downloadQueue, setDownloadQueue] = useState<DownloadItem[]>([]);
  const [permissionsChecked, setPermissionsChecked] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [permissions, setPermissions] = useState<PermissionStatus>({
    notifications: false,
    mediaLibrary: false,
    allGranted: false,
  });

  const [currentMedia, setCurrentMedia] = useState<MediaInfo | null>(null);
  const [isInBackground, setIsInBackground] = useState(false);
  
  const [playbackHistory, setPlaybackHistory] = useState<PlaybackHistoryItem[]>([]);
  const [showPlaybackHistory, setShowPlaybackHistory] = useState(false);

  const isVideoPlayingRef = useRef(false);
  const showMenuRef = useRef(false);
  const showDownloadsRef = useRef(false);
  const showPlaybackHistoryRef = useRef(false);
  const downloadResumablesRef = useRef<Map<string, FileSystem.DownloadResumable>>(new Map());
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const activeDownloadsRef = useRef<DownloadItem[]>([]);
  const downloadQueueRef = useRef<DownloadItem[]>([]);
  const isDownloadingRef = useRef(false);

  const speedHistoryRef = useRef<Map<string, number[]>>(new Map());
  const lastUpdateTimeRef = useRef<Map<string, number>>(new Map());

  const fabPosition = useRef(new Animated.Value(80)).current;
  const fabOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    activeDownloadsRef.current = activeDownloads;
  }, [activeDownloads]);

  useEffect(() => {
    downloadQueueRef.current = downloadQueue;
  }, [downloadQueue]);

  useEffect(() => { showMenuRef.current = showMenu; }, [showMenu]);
  useEffect(() => { showDownloadsRef.current = showDownloads; }, [showDownloads]);
  useEffect(() => { showPlaybackHistoryRef.current = showPlaybackHistory; }, [showPlaybackHistory]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [currentMedia]);

  const handleAppStateChange = async (nextAppState: AppStateStatus) => {
    if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
      console.log('[StreamPay] App en primer plano');
      setIsInBackground(false);
      await Notifications.dismissNotificationAsync('audio-playback');
    } else if (nextAppState.match(/inactive|background/)) {
      console.log('[StreamPay] App en segundo plano');
      setIsInBackground(true);
      if (currentMedia?.isPlaying && currentMedia?.isAudio) {
        await showAudioNotificationControls();
      }
      if (activeDownloadsRef.current.length > 0) {
        await showBackgroundDownloadNotification();
      }
    }
    appStateRef.current = nextAppState;
  };

  const showAudioNotificationControls = async () => {
    if (!permissions.notifications || !currentMedia) return;

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: currentMedia.title || 'Reproduciendo audio',
          body: currentMedia.artist || 'StreamPay',
          data: { type: 'audio-control' },
          sticky: true,
          autoDismiss: false,
          categoryIdentifier: 'media-playback',
        },
        trigger: null,
        identifier: 'audio-playback',
      });
    } catch (error) {
      console.error('[StreamPay] Error mostrando notificación de audio:', error);
    }
  };

  const showBackgroundDownloadNotification = async () => {
    const activeCount = activeDownloadsRef.current.length;
    if (activeCount > 0 && permissions.notifications) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Descargando en segundo plano',
          body: `${activeCount} descarga(s) en progreso`,
          sticky: true,
          autoDismiss: false,
        },
        trigger: null,
        identifier: 'background-download',
      });
    }
  };

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

  const showFabButton = useCallback(() => {
    setShowFab(true);
    Animated.parallel([
      Animated.spring(fabPosition, { toValue: 0, useNativeDriver: true, tension: 50, friction: 7 }),
      Animated.timing(fabOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [fabPosition, fabOpacity]);

  const hideFabButton = useCallback(() => {
    Animated.parallel([
      Animated.spring(fabPosition, { toValue: 80, useNativeDriver: true, tension: 50, friction: 7 }),
      Animated.timing(fabOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      setShowFab(false);
      setShowMenu(false);
    });
  }, [fabPosition, fabOpacity]);

  const handleIndicatorPress = useCallback(() => {
    if (showFab) {
      hideFabButton();
    } else {
      showFabButton();
    }
  }, [showFab, showFabButton, hideFabButton]);

  const handleVideoFullscreen = useCallback(async (videoWidth: number, videoHeight: number, enterFullscreen: boolean) => {
    if (enterFullscreen) {
      const isLandscapeVideo = videoWidth > videoHeight;
      setIsFullscreen(true);
      
      if (isLandscapeVideo) {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      } else {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
      }
      
      webViewRef.current?.injectJavaScript(`
        (function() {
          const video = document.querySelector('video');
          if (video) {
            video.style.position = 'fixed';
            video.style.top = '0';
            video.style.left = '0';
            video.style.width = '100vw';
            video.style.height = '100vh';
            video.style.zIndex = '999999';
            video.style.backgroundColor = 'black';
            video.style.objectFit = 'contain';
            
            const downloadButtons = document.querySelectorAll('[download], [data-download], .download-btn, .download-button');
            downloadButtons.forEach(btn => btn.style.display = 'none');
          }
        })();
        true;
      `);
    } else {
      setIsFullscreen(false);
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
      
      webViewRef.current?.injectJavaScript(`
        (function() {
          const video = document.querySelector('video');
          if (video) {
            video.style.position = '';
            video.style.top = '';
            video.style.left = '';
            video.style.width = '';
            video.style.height = '';
            video.style.zIndex = '';
            video.style.objectFit = '';
          }
        })();
        true;
      `);
    }
  }, []);

  const exitFullscreen = async () => {
    setIsFullscreen(false);
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
    
    webViewRef.current?.injectJavaScript(`
      try {
        if (document.fullscreenElement) document.exitFullscreen();
        const v = document.querySelector('video');
        if (v) { 
          v.style.position = ''; 
          v.style.width = ''; 
          v.style.height = ''; 
          v.style.top = '';
          v.style.left = '';
          v.style.zIndex = '';
        }
      } catch(e) {}
      true;
    `);
  };

  const handleBackPress = useCallback(() => {
    if (showPlaybackHistoryRef.current) {
      setShowPlaybackHistory(false);
      return true;
    }
    if (showDownloadsRef.current) { 
      setShowDownloads(false); 
      return true; 
    }
    if (showMenuRef.current) { 
      setShowMenu(false);
      hideFabButton();
      return true; 
    }
    if (isFullscreen) { 
      exitFullscreen(); 
      return true; 
    }
    if (showFab) { 
      hideFabButton(); 
      return true; 
    }
    if (canGoBack && webViewRef.current) { 
      webViewRef.current.goBack(); 
      return true; 
    }
    return false;
  }, [canGoBack, showFab, isFullscreen, hideFabButton]);

  useEffect(() => {
    loadServerUrl();
    loadDownloadHistory();
    loadDownloadQueue();
    loadPlaybackHistory();
    initializePermissions();
    
    const backHandler = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    setupWebNotificationListener();
    
    return () => {
      backHandler.remove();
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT).catch(() => {});
    };
  }, [handleBackPress]);

  const setupWebNotificationListener = async () => {
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      if (data?.type === 'web-notification' && data?.url) {
        webViewRef.current?.injectJavaScript(`
          window.location.href = '${data.url}';
          true;
        `);
      }
    });
    return () => subscription.remove();
  };

  const showWebNotification = async (notification: WebNotification) => {
    if (!permissions.notifications) return;

    try {
      const content: any = {
        title: notification.title,
        body: notification.body,
        data: { 
          type: 'web-notification', 
          id: notification.id,
          tag: notification.tag,
        },
        categoryIdentifier: 'web-notifications',
      };

      if (notification.image) {
        content.attachments = [{ url: notification.image }];
      }

      await Notifications.scheduleNotificationAsync({
        content,
        trigger: null,
        identifier: `web-notif-${notification.id}`,
      });
    } catch (error) {
      console.error('[StreamPay] Error mostrando notificación web:', error);
    }
  };

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

  const loadDownloadQueue = async () => {
    try {
      const queue = await AsyncStorage.getItem('DOWNLOAD_QUEUE');
      if (queue) {
        const parsedQueue = JSON.parse(queue);
        setDownloadQueue(parsedQueue);
        if (parsedQueue.length > 0) {
          processDownloadQueue(parsedQueue);
        }
      }
    } catch (error) {
      console.error('[StreamPay] Error cargando cola:', error);
    }
  };

  const saveDownloadHistory = async (history: DownloadItem[]) => {
    try {
      await AsyncStorage.setItem('DOWNLOAD_HISTORY', JSON.stringify(history.slice(0, 100)));
    } catch (error) {
      console.error('[StreamPay] Error guardando historial:', error);
    }
  };

  const saveDownloadQueue = async (queue: DownloadItem[]) => {
    try {
      await AsyncStorage.setItem('DOWNLOAD_QUEUE', JSON.stringify(queue));
    } catch (error) {
      console.error('[StreamPay] Error guardando cola:', error);
    }
  };

  const loadPlaybackHistory = async () => {
    try {
      const history = await AsyncStorage.getItem('PLAYBACK_HISTORY');
      if (history) setPlaybackHistory(JSON.parse(history));
    } catch (error) {
      console.error('[StreamPay] Error cargando historial de reproducción:', error);
    }
  };

  const savePlaybackHistory = async (history: PlaybackHistoryItem[]) => {
    try {
      await AsyncStorage.setItem('PLAYBACK_HISTORY', JSON.stringify(history.slice(0, 50)));
    } catch (error) {
      console.error('[StreamPay] Error guardando historial de reproducción:', error);
    }
  };

  const updatePlaybackPosition = (url: string, title: string, currentTime: number, duration: number, thumbnail?: string) => {
    if (!url || duration <= 0 || currentTime < 5) return;
    
    const progress = Math.round((currentTime / duration) * 100);
    const completed = progress >= 95;
    const id = btoa(url).replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
    
    setPlaybackHistory(prev => {
      const existingIndex = prev.findIndex(item => item.id === id);
      
      const newItem: PlaybackHistoryItem = {
        id,
        url,
        title: title || 'Video sin título',
        currentTime,
        duration,
        progress,
        thumbnail,
        lastPlayed: new Date(),
        completed,
      };
      
      let newHistory: PlaybackHistoryItem[];
      if (existingIndex >= 0) {
        newHistory = [newItem, ...prev.filter((_, i) => i !== existingIndex)];
      } else {
        newHistory = [newItem, ...prev];
      }
      
      newHistory = newHistory.slice(0, 50);
      savePlaybackHistory(newHistory);
      return newHistory;
    });
  };

  const resumeFromHistory = (item: PlaybackHistoryItem) => {
    setShowPlaybackHistory(false);
    
    webViewRef.current?.injectJavaScript(`
      (function() {
        window.location.href = '${item.url}';
        
        const checkVideo = setInterval(() => {
          const video = document.querySelector('video');
          if (video && video.readyState >= 2) {
            video.currentTime = ${item.currentTime};
            clearInterval(checkVideo);
          }
        }, 500);
        
        setTimeout(() => clearInterval(checkVideo), 10000);
      })();
      true;
    `);
  };

  const deletePlaybackItem = (id: string) => {
    setPlaybackHistory(prev => {
      const newHistory = prev.filter(item => item.id !== id);
      savePlaybackHistory(newHistory);
      return newHistory;
    });
  };

  const clearPlaybackHistory = () => {
    Alert.alert(
      'Limpiar historial',
      '¿Eliminar todo el historial de reproducción?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Limpiar',
          style: 'destructive',
          onPress: () => {
            setPlaybackHistory([]);
            savePlaybackHistory([]);
          }
        }
      ]
    );
  };

  const formatDuration = (seconds: number): string => {
    if (!seconds || seconds <= 0) return '0:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTimeAgo = (date: Date): string => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Ahora';
    if (minutes < 60) return `Hace ${minutes}m`;
    if (hours < 24) return `Hace ${hours}h`;
    if (days < 7) return `Hace ${days}d`;
    return new Date(date).toLocaleDateString();
  };

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
      return `descarga_${fallbackId}.mp4`;
    } catch (error) {
      return `descarga_${fallbackId}.mp4`;
    }
  };

  const sanitizeFilename = (filename: string): string => {
    let clean = filename.replace(/[<>:"/\\|?*]/g, '_').replace(/[-\x1F]/g, '');
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

  const calculateSmoothedSpeed = (downloadId: string, currentSpeed: number): number => {
    const alpha = 0.3;
    const history = speedHistoryRef.current.get(downloadId) || [];
    history.push(currentSpeed);
    if (history.length > 5) history.shift();
    speedHistoryRef.current.set(downloadId, history);
    if (history.length === 1) return currentSpeed;
    let ema = history[0];
    for (let i = 1; i < history.length; i++) {
      ema = alpha * history[i] + (1 - alpha) * ema;
    }
    return Math.round(ema);
  };

  const formatTimeRemaining = (bytesRemaining: number, bytesPerSecond: number): string => {
    if (bytesPerSecond <= 0 || bytesRemaining <= 0) return '';
    const seconds = Math.ceil(bytesRemaining / bytesPerSecond);
    if (seconds < 60) return `${seconds}s restantes`;
    if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}m ${secs}s restantes`;
    }
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m restantes`;
  };

  const getMimeType = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return MIME_TYPES[ext] || 'application/octet-stream';
  };

  const generateThumbnail = async (filePath: string, filename: string): Promise<string | null> => {
    try {
      if (!isVideoFile(filename)) return null;
      const { uri } = await VideoThumbnails.getThumbnailAsync(filePath, { time: 1000 });
      const thumbnailFilename = `thumb_${Date.now()}.jpg`;
      const thumbnailPath = `${FileSystem.documentDirectory}thumbnails/`;
      const dirInfo = await FileSystem.getInfoAsync(thumbnailPath);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(thumbnailPath, { intermediates: true });
      }
      const finalThumbnailPath = `${thumbnailPath}${thumbnailFilename}`;
      await FileSystem.copyAsync({ from: uri, to: finalThumbnailPath });
      return finalThumbnailPath;
    } catch (error) {
      console.warn('[StreamPay] Error generando miniatura:', error);
      return null;
    }
  };

  const updateDownloadNotification = async (
    downloadId: string,
    filename: string,
    progress: number,
    speed: string,
    timeRemaining: string,
    isComplete: boolean = false,
    isFailed: boolean = false
  ) => {
    if (!permissions.notifications) return;

    try {
      const notificationId = `download-${downloadId}`;

      if (isComplete) {
        await Notifications.dismissNotificationAsync(notificationId);
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Descarga completada',
            body: filename,
            data: { downloadId, type: 'complete' },
            sound: 'default',
            categoryIdentifier: 'downloads-complete',
          },
          trigger: null,
          identifier: `${notificationId}-complete`,
        });
      } else if (isFailed) {
        await Notifications.dismissNotificationAsync(notificationId);
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Descarga fallida',
            body: filename,
            data: { downloadId, type: 'failed' },
          },
          trigger: null,
          identifier: notificationId,
        });
      } else {
        const progressText = `${Math.round(progress)}%`;
        const bodyText = timeRemaining ? `${speed} • ${timeRemaining}` : speed;

        await Notifications.scheduleNotificationAsync({
          content: {
            title: `Descargando: ${filename}`,
            body: `${progressText} - ${bodyText}`,
            data: { downloadId, type: 'progress', progress },
            sticky: true,
            autoDismiss: false,
            categoryIdentifier: 'downloads',
          },
          trigger: null,
          identifier: notificationId,
        });
      }
    } catch (error) {
      console.error('[StreamPay] Error en notificación:', error);
    }
  };

  const processDownloadQueue = async (queue?: DownloadItem[]) => {
    const currentQueue = queue || downloadQueueRef.current;
    
    if (isDownloadingRef.current || currentQueue.length === 0) return;
    
    const nextDownload = currentQueue.find(d => d.status === 'queued');
    if (!nextDownload) return;
    
    isDownloadingRef.current = true;
    
    setDownloadQueue(prev => prev.map(d => 
      d.id === nextDownload.id ? { ...d, status: 'downloading' } : d
    ));
    setActiveDownloads(prev => [...prev, { ...nextDownload, status: 'downloading' }]);
    
    await executeDownload(nextDownload);
  };

  const executeDownload = async (item: DownloadItem) => {
    const { id: downloadId, url, filename, downloadedBytes: resumeFromBytes } = item;
    
    speedHistoryRef.current.set(downloadId, []);
    lastUpdateTimeRef.current.set(downloadId, Date.now());
    
    await updateDownloadNotification(downloadId, filename, 0, 'Iniciando...', '');
    
    let lastBytes = resumeFromBytes || 0;
    let lastTime = Date.now();
    let lastNotificationUpdate = 0;
    let lastUIUpdate = Date.now();
    let lastKnownSpeed = 'Calculando...';
    let lastSmoothedSpeed = 0;
    let lastTimeRemaining = '';

    try {
      const downloadPath = `${FileSystem.documentDirectory}${filename}`;
      
      let headers: any = {
        'Accept': '*/*',
        'Accept-Encoding': 'identity',
        'Connection': 'keep-alive',
      };
      
      if (resumeFromBytes && resumeFromBytes > 0) {
        headers['Range'] = `bytes=${resumeFromBytes}-`;
        console.log('[StreamPay] Reanudando descarga desde byte:', resumeFromBytes);
      }
      
      const downloadResumable = FileSystem.createDownloadResumable(
        url,
        downloadPath,
        { headers },
        async (downloadProgress) => {
          const { totalBytesWritten, totalBytesExpectedToWrite } = downloadProgress;
          const actualBytesWritten = totalBytesWritten + (resumeFromBytes || 0);
          const actualTotalBytes = totalBytesExpectedToWrite + (resumeFromBytes || 0);
          
          let progress = 0;
          if (actualTotalBytes > 0) {
            progress = (actualBytesWritten / actualTotalBytes) * 100;
          }
          
          const now = Date.now();
          const timeDiff = (now - lastTime) / 1000;
          
          let speed = lastKnownSpeed;
          let smoothedSpeed = lastSmoothedSpeed;
          let timeRemaining = lastTimeRemaining;
          
          if (timeDiff >= 0.5 && actualBytesWritten > lastBytes) {
            const bytesDiff = actualBytesWritten - lastBytes;
            const rawSpeed = bytesDiff / timeDiff;
            
            smoothedSpeed = calculateSmoothedSpeed(downloadId, rawSpeed);
            speed = formatSpeed(smoothedSpeed);
            
            lastKnownSpeed = speed;
            lastSmoothedSpeed = smoothedSpeed;
            
            if (actualTotalBytes > 0 && smoothedSpeed > 0) {
              const bytesRemaining = actualTotalBytes - actualBytesWritten;
              timeRemaining = formatTimeRemaining(bytesRemaining, smoothedSpeed);
              lastTimeRemaining = timeRemaining;
            }
            
            lastBytes = actualBytesWritten;
            lastTime = now;
          }

          if (now - lastUIUpdate >= 300) {
            lastUIUpdate = now;
            
            setActiveDownloads(prev => prev.map(d => 
              d.id === downloadId 
                ? { 
                    ...d, 
                    progress: Math.min(progress, 99.9),
                    speed,
                    downloadedBytes: actualBytesWritten,
                    totalSize: actualTotalBytes,
                    size: actualTotalBytes > 0 
                      ? `${formatBytes(actualBytesWritten)} / ${formatBytes(actualTotalBytes)}`
                      : formatBytes(actualBytesWritten),
                    duration: timeRemaining,
                  } 
                : d
            ));
            
            setDownloadQueue(prev => prev.map(d =>
              d.id === downloadId
                ? { ...d, downloadedBytes: actualBytesWritten, totalSize: actualTotalBytes }
                : d
            ));
          }

          if (now - lastNotificationUpdate > 3000) {
            lastNotificationUpdate = now;
            await updateDownloadNotification(downloadId, filename, progress, speed, timeRemaining);
          }
        }
      );

      downloadResumablesRef.current.set(downloadId, downloadResumable);
      const result = await downloadResumable.downloadAsync();
      downloadResumablesRef.current.delete(downloadId);

      speedHistoryRef.current.delete(downloadId);
      lastUpdateTimeRef.current.delete(downloadId);

      if (result && result.uri) {
        const fileInfo = await FileSystem.getInfoAsync(result.uri);
        const fileSize = fileInfo.exists ? (fileInfo as any).size || 0 : 0;
        
        let thumbnailUri: string | null = null;
        if (isVideoFile(filename)) {
          thumbnailUri = await generateThumbnail(result.uri, filename);
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
          thumbnailUri: thumbnailUri || undefined,
        };

        setActiveDownloads(prev => prev.filter(d => d.id !== downloadId));
        setDownloadQueue(prev => {
          const newQueue = prev.filter(d => d.id !== downloadId);
          saveDownloadQueue(newQueue);
          return newQueue;
        });
        setDownloadHistory(prev => {
          const newHistory = [completedDownload, ...prev.filter(d => d.id !== downloadId)].slice(0, 100);
          saveDownloadHistory(newHistory);
          return newHistory;
        });

        await updateDownloadNotification(downloadId, filename, 100, '', '', true);
        await Notifications.dismissNotificationAsync('background-download');
        
        console.log('[StreamPay] Descarga completada:', { filename, size: formatBytes(fileSize) });
      }
    } catch (error: any) {
      console.error('[StreamPay] Error en descarga:', error);
      downloadResumablesRef.current.delete(downloadId);
      
      setDownloadQueue(prev => prev.map(d =>
        d.id === downloadId ? { ...d, status: 'paused', error: error?.message } : d
      ));
      saveDownloadQueue(downloadQueueRef.current);
      
      setActiveDownloads(prev => prev.map(d =>
        d.id === downloadId ? { ...d, status: 'failed', error: error?.message } : d
      ));

      await updateDownloadNotification(downloadId, filename, 0, '', '', false, true);
    } finally {
      isDownloadingRef.current = false;
      setTimeout(() => processDownloadQueue(), 500);
    }
  };

  const handleMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      
      if (data.type === 'fullscreenchange') {
        if (data.isFullscreen && data.videoWidth && data.videoHeight) {
          handleVideoFullscreen(data.videoWidth, data.videoHeight, true);
        } else if (!data.isFullscreen) {
          handleVideoFullscreen(0, 0, false);
        }
      }
      
      if (data.type === 'videoState') {
        isVideoPlayingRef.current = data.isPlaying;
        setCurrentMedia({
          isPlaying: data.isPlaying,
          isVideo: data.isVideo || false,
          isAudio: data.isAudio || false,
          title: data.title,
          artist: data.artist,
          thumbnail: data.thumbnail,
          duration: data.duration,
          currentTime: data.currentTime,
          videoWidth: data.videoWidth,
          videoHeight: data.videoHeight,
          isLandscape: data.videoWidth > data.videoHeight,
        });
        
        if (data.isVideo && data.url && data.currentTime && data.duration) {
          updatePlaybackPosition(
            data.url,
            data.title || 'Video',
            data.currentTime,
            data.duration,
            data.thumbnail
          );
        }
        
        if (data.isAudio && data.isPlaying && isInBackground) {
          await showAudioNotificationControls();
        }
      }
      
      if (data.type === 'videoProgress') {
        updatePlaybackPosition(
          data.url,
          data.title || 'Video',
          data.currentTime,
          data.duration,
          data.thumbnail
        );
      }
      
      if (data.type === 'download') {
        handleDownload(data.url, data.filename || '');
      }
      
      if (data.type === 'webNotification') {
        await showWebNotification({
          id: data.id || Date.now().toString(),
          title: data.title,
          body: data.body,
          icon: data.icon,
          image: data.image,
          tag: data.tag,
          timestamp: Date.now(),
        });
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
    
    console.log('[StreamPay] Agregando a cola:', { url: url.substring(0, 100), filename });

    const newDownload: DownloadItem = {
      id: downloadId,
      filename,
      url,
      progress: 0,
      speed: 'En cola...',
      status: 'queued',
      downloadedBytes: 0,
      totalSize: 0,
    };

    setDownloadQueue(prev => {
      const newQueue = [...prev, newDownload];
      saveDownloadQueue(newQueue);
      return newQueue;
    });
    
    setShowDownloads(true);
    
    if (!isDownloadingRef.current) {
      setTimeout(() => processDownloadQueue(), 100);
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
    speedHistoryRef.current.delete(downloadId);
    lastUpdateTimeRef.current.delete(downloadId);
    await Notifications.dismissNotificationAsync(`download-${downloadId}`);
    
    setActiveDownloads(prev => prev.filter(d => d.id !== downloadId));
    setDownloadQueue(prev => {
      const newQueue = prev.filter(d => d.id !== downloadId);
      saveDownloadQueue(newQueue);
      return newQueue;
    });
    
    isDownloadingRef.current = false;
    setTimeout(() => processDownloadQueue(), 100);
  };

  const resumeDownload = async (item: DownloadItem) => {
    setDownloadQueue(prev => {
      const filtered = prev.filter(d => d.id !== item.id);
      const newQueue = [{ ...item, status: 'queued' as const }, ...filtered];
      saveDownloadQueue(newQueue);
      return newQueue;
    });
    
    if (!isDownloadingRef.current) {
      setTimeout(() => processDownloadQueue(), 100);
    }
  };

  const retryDownload = (item: DownloadItem) => {
    setActiveDownloads(prev => prev.filter(d => d.id !== item.id));
    setDownloadQueue(prev => prev.filter(d => d.id !== item.id));
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

      const mimeType = getMimeType(item.filename);

      if (Platform.OS === 'android') {
        try {
          let contentUri = item.filePath;
          if (item.filePath.startsWith('file://') || item.filePath.startsWith('/')) {
            contentUri = await FileSystem.getContentUriAsync(item.filePath);
          }
          await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
            data: contentUri,
            type: mimeType,
            flags: 1,
          });
        } catch (intentError) {
          try {
            let uriToOpen = item.filePath;
            if (item.filePath.startsWith('file://') || item.filePath.startsWith('/')) {
              uriToOpen = await FileSystem.getContentUriAsync(item.filePath);
            }
            await Linking.openURL(uriToOpen);
          } catch (linkingError) {
            Alert.alert(
              'No se puede abrir',
              `No hay aplicación instalada para abrir archivos ${mimeType.split('/')[0]}.\n\n¿Desea buscar una en Play Store?`,
              [
                { text: 'Cancelar', style: 'cancel' },
                {
                  text: 'Buscar app',
                  onPress: () => {
                    const searchTerm = mimeType.includes('video') ? 'video player' :
                                      mimeType.includes('audio') ? 'music player' :
                                      mimeType.includes('pdf') ? 'pdf reader' : 'file manager';
                    Linking.openURL(`market://search?q=${searchTerm}`);
                  }
                }
              ]
            );
          }
        }
      }
    } catch (error) {
      Alert.alert('Error', 'No se pudo abrir el archivo');
    }
  };

  const shareFile = async (item: DownloadItem) => {
    if (!item.filePath) {
      Alert.alert('Error', 'Archivo no encontrado');
      return;
    }

    try {
      const fileInfo = await FileSystem.getInfoAsync(item.filePath);
      if (!fileInfo.exists) {
        Alert.alert('Error', 'El archivo ya no existe');
        return;
      }

      if (Platform.OS === 'android') {
        let contentUri = item.filePath;
        if (item.filePath.startsWith('file://') || item.filePath.startsWith('/')) {
          contentUri = await FileSystem.getContentUriAsync(item.filePath);
        }
        await IntentLauncher.startActivityAsync('android.intent.action.SEND', {
          data: contentUri,
          type: getMimeType(item.filename),
          flags: 1,
        });
      }
    } catch (error) {
      Alert.alert('Error', 'No se pudo compartir el archivo');
    }
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
                const fileInfo = await FileSystem.getInfoAsync(item.filePath);
                if (fileInfo.exists) {
                  await FileSystem.deleteAsync(item.filePath, { idempotent: true });
                }
              } catch (e) {}
            }
            
            if (item.thumbnailUri) {
              try {
                const thumbInfo = await FileSystem.getInfoAsync(item.thumbnailUri);
                if (thumbInfo.exists) {
                  await FileSystem.deleteAsync(item.thumbnailUri, { idempotent: true });
                }
              } catch (e) {}
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

  const getFileIcon = (filename: string): string => {
    if (isVideoFile(filename)) return 'videocam';
    if (isAudioFile(filename)) return 'musical-notes';
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    if (['pdf'].includes(ext)) return 'document-text';
    if (['doc', 'docx'].includes(ext)) return 'document';
    if (['zip', 'rar', '7z'].includes(ext)) return 'archive';
    if (['apk'].includes(ext)) return 'logo-android';
    return 'document-outline';
  };

  const getQueuedCount = () => downloadQueue.filter(d => d.status === 'queued').length;
  const getPausedCount = () => downloadQueue.filter(d => d.status === 'paused').length;

  const injectedJavaScript = `
    (function() {
      if (window.__streamPayInjected) return;
      window.__streamPayInjected = true;
      
      const notify = (type, payload) => {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type, ...payload }));
        } catch(e) {}
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
      
      const hideDownloadButtons = () => {
        const selectors = [
          'video::-internal-media-controls-download-button',
          '[download]',
          '.download-btn',
          '.download-button',
          '[data-download]',
          '.vjs-download-button',
          '.plyr__control[data-plyr="download"]'
        ];
        
        const style = document.createElement('style');
        style.textContent = selectors.map(s => s + '{ display: none !important; }').join('\\n');
        document.head.appendChild(style);
        
        document.querySelectorAll('video').forEach(v => {
          v.controlsList = 'nodownload';
        });
      };
      hideDownloadButtons();
      
      const checkVideos = () => {
        document.querySelectorAll('video').forEach(v => {
          if (!v.hasAttribute('data-sp-observed')) {
            v.setAttribute('data-sp-observed', '1');
            v.controlsList = 'nodownload';
            
            const getVideoUrl = () => v.src || v.currentSrc || window.location.href;
            
            const getThumbnail = () => {
              const poster = v.poster;
              if (poster) return poster;
              const parent = v.closest('article, .video-container, .player, div');
              const img = parent?.querySelector('img');
              return img?.src || '';
            };
            
            v.addEventListener('play', () => {
              notify('videoState', { 
                isPlaying: true, 
                isVideo: true,
                url: getVideoUrl(),
                videoWidth: v.videoWidth,
                videoHeight: v.videoHeight,
                title: document.title,
                duration: v.duration,
                currentTime: v.currentTime,
                thumbnail: getThumbnail()
              });
            });
            
            v.addEventListener('pause', () => {
              notify('videoProgress', {
                url: getVideoUrl(),
                title: document.title,
                currentTime: v.currentTime,
                duration: v.duration,
                thumbnail: getThumbnail()
              });
              notify('videoState', { isPlaying: false, isVideo: true });
            });
            
            v.addEventListener('ended', () => {
              notify('videoProgress', {
                url: getVideoUrl(),
                title: document.title,
                currentTime: v.duration,
                duration: v.duration,
                thumbnail: getThumbnail()
              });
              notify('videoState', { isPlaying: false, isVideo: true });
            });
            
            let lastSaveTime = 0;
            v.addEventListener('timeupdate', () => {
              if (v.paused) return;
              const now = Math.floor(v.currentTime);
              
              if (now > 0 && now % 10 === 0 && now !== lastSaveTime) {
                lastSaveTime = now;
                notify('videoProgress', {
                  url: getVideoUrl(),
                  title: document.title,
                  currentTime: v.currentTime,
                  duration: v.duration,
                  thumbnail: getThumbnail()
                });
              }
            });
            
            v.addEventListener('seeked', () => {
              notify('videoProgress', {
                url: getVideoUrl(),
                title: document.title,
                currentTime: v.currentTime,
                duration: v.duration,
                thumbnail: getThumbnail()
              });
            });
          }
        });
        
        document.querySelectorAll('audio').forEach(a => {
          if (!a.hasAttribute('data-sp-observed')) {
            a.setAttribute('data-sp-observed', '1');
            
            a.addEventListener('play', () => {
              notify('videoState', { 
                isPlaying: true, 
                isAudio: true,
                title: document.title,
                duration: a.duration,
                currentTime: a.currentTime
              });
            });
            
            a.addEventListener('pause', () => {
              notify('videoState', { isPlaying: false, isAudio: true });
            });
            
            a.addEventListener('ended', () => {
              notify('videoState', { isPlaying: false, isAudio: true });
            });
          }
        });
      };
      
      setInterval(checkVideos, 2000);
      checkVideos();
      
      document.addEventListener('fullscreenchange', () => {
        const video = document.fullscreenElement?.querySelector('video') || document.fullscreenElement;
        const isFs = !!document.fullscreenElement;
        notify('fullscreenchange', { 
          isFullscreen: isFs,
          videoWidth: video?.videoWidth || 0,
          videoHeight: video?.videoHeight || 0
        });
      });
      
      document.addEventListener('webkitfullscreenchange', () => {
        const video = document.webkitFullscreenElement?.querySelector('video') || document.webkitFullscreenElement;
        const isFs = !!document.webkitFullscreenElement;
        notify('fullscreenchange', { 
          isFullscreen: isFs,
          videoWidth: video?.videoWidth || 0,
          videoHeight: video?.videoHeight || 0
        });
      });
      
      if ('Notification' in window) {
        const OriginalNotification = window.Notification;
        window.Notification = function(title, options = {}) {
          notify('webNotification', {
            title: title,
            body: options.body || '',
            icon: options.icon || '',
            image: options.image || '',
            tag: options.tag || '',
            id: Date.now().toString()
          });
          return new OriginalNotification(title, options);
        };
        window.Notification.permission = OriginalNotification.permission;
        window.Notification.requestPermission = OriginalNotification.requestPermission.bind(OriginalNotification);
      }
      
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data && event.data.type === 'notification') {
            notify('webNotification', {
              title: event.data.title || 'Notificación',
              body: event.data.body || '',
              icon: event.data.icon || '',
              image: event.data.image || '',
              id: Date.now().toString()
            });
          }
        });
      }
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
          handleDownload(nativeEvent.downloadUrl, '');
        }}
        originWhitelist={['*']}
        mixedContentMode="always"
        allowUniversalAccessFromFileURLs={true}
        allowFileAccessFromFileURLs={true}
        cacheEnabled={true}
        thirdPartyCookiesEnabled={true}
      />

      {!isFullscreen && !showFab && (
        <TouchableOpacity 
          style={styles.swipeIndicator} 
          onPress={handleIndicatorPress}
          activeOpacity={0.7}
        >
          <View style={styles.indicatorPill}>
            <Ionicons name="apps" size={18} color="#6366f1" />
            {(activeDownloads.length > 0 || getQueuedCount() > 0) && (
              <View style={styles.indicatorBadge}>
                <Text style={styles.indicatorBadgeText}>
                  {activeDownloads.length + getQueuedCount()}
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      )}
      {/* FAB - Centro inferior, más abajo */}
      {!isFullscreen && showFab && (
        <Animated.View 
          style={[
            styles.fabContainer, 
            { 
              transform: [{ translateY: fabPosition }],
              opacity: fabOpacity 
            }
          ]}
        >
          <TouchableOpacity 
            style={styles.fab} 
            onPress={() => {
              if (showMenu) {
                setShowMenu(false);
                hideFabButton();
              } else {
                setShowMenu(true);
              }
            }}
          >
            <Ionicons name={showMenu ? "close" : "menu"} size={26} color="#ffffff" />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Menú */}
      {showMenu && !isFullscreen && (
        <>
          <TouchableOpacity 
            style={styles.menuOverlay} 
            onPress={() => { 
              setShowMenu(false); 
              hideFabButton();
            }} 
          />
          <View style={styles.menu}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => { 
                setShowMenu(false); 
                hideFabButton();
                webViewRef.current?.reload(); 
              }}
            >
              <Ionicons name="refresh-outline" size={22} color="#e2e8f0" />
              <Text style={styles.menuText}>Recargar</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => { 
                setShowMenu(false); 
                setShowPlaybackHistory(true); 
              }}
            >
              <Ionicons name="play-circle-outline" size={22} color="#e2e8f0" />
              <Text style={styles.menuText}>Continuar viendo</Text>
              {playbackHistory.filter(h => !h.completed).length > 0 && (
                <View style={[styles.badge, { backgroundColor: '#10b981' }]}>
                  <Text style={styles.badgeText}>
                    {playbackHistory.filter(h => !h.completed).length}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => { 
                setShowMenu(false); 
                setShowDownloads(true); 
              }}
            >
              <Ionicons name="download-outline" size={22} color="#e2e8f0" />
              <Text style={styles.menuText}>Descargas</Text>
              {(activeDownloads.length > 0 || getQueuedCount() > 0 || downloadHistory.length > 0) && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {activeDownloads.length + getQueuedCount() > 0 
                      ? activeDownloads.length + getQueuedCount()
                      : downloadHistory.length}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => { 
                setShowMenu(false); 
                hideFabButton();
                router.push('/config'); 
              }}
            >
              <Ionicons name="settings-outline" size={22} color="#e2e8f0" />
              <Text style={styles.menuText}>Configuración</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Panel de descargas */}
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
              <TouchableOpacity 
                onPress={() => setShowDownloads(false)} 
                style={styles.headerButton}
              >
                <Ionicons name="close" size={26} color="#e2e8f0" />
              </TouchableOpacity>
            </View>
          </View>
          
          <ScrollView style={styles.downloadsContent} showsVerticalScrollIndicator={false}>
            {activeDownloads.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Descargando</Text>
                {activeDownloads.map(item => (
                  <View key={item.id} style={styles.downloadItem}>
                    <View style={styles.downloadRow}>
                      <View style={styles.fileIconContainer}>
                        <Ionicons name={getFileIcon(item.filename) as any} size={28} color="#6366f1" />
                      </View>
                      <View style={styles.downloadInfo}>
                        <Text style={styles.downloadFilename} numberOfLines={2}>{item.filename}</Text>
                        <View style={styles.downloadMeta}>
                          <Text style={styles.downloadSize}>{item.size || '0 B'}</Text>
                          <Text style={styles.downloadSpeed}>{item.speed}</Text>
                        </View>
                        {item.duration && (
                          <Text style={styles.downloadDuration}>{item.duration}</Text>
                        )}
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
                          <TouchableOpacity style={styles.actionButton} onPress={() => retryDownload(item)}>
                            <Ionicons name="refresh" size={20} color="#6366f1" />
                            <Text style={styles.actionText}>Reintentar</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.actionButton} onPress={() => cancelDownload(item.id)}>
                            <Ionicons name="close" size={20} color="#ef4444" />
                            <Text style={[styles.actionText, { color: '#ef4444' }]}>Cancelar</Text>
                          </TouchableOpacity>
                        </>
                      ) : (
                        <TouchableOpacity style={styles.actionButton} onPress={() => cancelDownload(item.id)}>
                          <Ionicons name="stop" size={20} color="#ef4444" />
                          <Text style={[styles.actionText, { color: '#ef4444' }]}>Cancelar</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))}
              </>
            )}

            {getQueuedCount() > 0 && (
              <>
                <Text style={styles.sectionTitle}>En cola ({getQueuedCount()})</Text>
                {downloadQueue.filter(d => d.status === 'queued').map(item => (
                  <View key={item.id} style={styles.downloadItem}>
                    <View style={styles.downloadRow}>
                      <View style={[styles.fileIconContainer, { backgroundColor: 'rgba(148, 163, 184, 0.1)' }]}>
                        <Ionicons name={getFileIcon(item.filename) as any} size={28} color="#94a3b8" />
                      </View>
                      <View style={styles.downloadInfo}>
                        <Text style={styles.downloadFilename} numberOfLines={2}>{item.filename}</Text>
                        <Text style={styles.queueText}>Esperando...</Text>
                      </View>
                    </View>
                    <View style={styles.downloadActions}>
                      <TouchableOpacity style={styles.actionButton} onPress={() => cancelDownload(item.id)}>
                        <Ionicons name="close" size={20} color="#ef4444" />
                        <Text style={[styles.actionText, { color: '#ef4444' }]}>Quitar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </>
            )}

            {getPausedCount() > 0 && (
              <>
                <Text style={styles.sectionTitle}>Pausadas ({getPausedCount()})</Text>
                {downloadQueue.filter(d => d.status === 'paused').map(item => (
                  <View key={item.id} style={styles.downloadItem}>
                    <View style={styles.downloadRow}>
                      <View style={[styles.fileIconContainer, { backgroundColor: 'rgba(251, 191, 36, 0.1)' }]}>
                        <Ionicons name={getFileIcon(item.filename) as any} size={28} color="#fbbf24" />
                      </View>
                      <View style={styles.downloadInfo}>
                        <Text style={styles.downloadFilename} numberOfLines={2}>{item.filename}</Text>
                        <Text style={styles.pausedText}>
                          {item.downloadedBytes ? `${formatBytes(item.downloadedBytes)} descargados` : 'Pausado'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.downloadActions}>
                      <TouchableOpacity style={styles.actionButton} onPress={() => resumeDownload(item)}>
                        <Ionicons name="play" size={20} color="#10b981" />
                        <Text style={[styles.actionText, { color: '#10b981' }]}>Reanudar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.actionButton} onPress={() => cancelDownload(item.id)}>
                        <Ionicons name="trash" size={20} color="#ef4444" />
                        <Text style={[styles.actionText, { color: '#ef4444' }]}>Eliminar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </>
            )}

            {downloadHistory.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Historial</Text>
                {downloadHistory.map(item => (
                  <View key={item.id} style={styles.downloadItem}>
                    <View style={styles.downloadRow}>
                      {item.thumbnailUri ? (
                        <Image
                          source={{ uri: item.thumbnailUri }}
                          style={styles.thumbnail}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={styles.fileIconContainer}>
                          <Ionicons name={getFileIcon(item.filename) as any} size={28} color="#6366f1" />
                        </View>
                      )}
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
                    </View>
                    <View style={styles.downloadActions}>
                      <TouchableOpacity style={styles.actionButton} onPress={() => openFile(item)}>
                        <Ionicons name="open-outline" size={20} color="#6366f1" />
                        <Text style={styles.actionText}>Abrir</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.actionButton} onPress={() => shareFile(item)}>
                        <Ionicons name="share-outline" size={20} color="#10b981" />
                        <Text style={[styles.actionText, { color: '#10b981' }]}>Compartir</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.actionButton} onPress={() => deleteDownload(item)}>
                        <Ionicons name="trash-outline" size={20} color="#ef4444" />
                        <Text style={[styles.actionText, { color: '#ef4444' }]}>Eliminar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </>
            )}

            {activeDownloads.length === 0 && downloadQueue.length === 0 && downloadHistory.length === 0 && (
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

      {/* Panel de Historial de Reproducción */}
      {showPlaybackHistory && !isFullscreen && (
        <View style={styles.downloadsModal}>
          <View style={styles.downloadsHeader}>
            <Text style={styles.downloadsTitle}>Continuar viendo</Text>
            <View style={styles.headerActions}>
              {playbackHistory.length > 0 && (
                <TouchableOpacity onPress={clearPlaybackHistory} style={styles.headerButton}>
                  <Ionicons name="trash-outline" size={22} color="#ef4444" />
                </TouchableOpacity>
              )}
              <TouchableOpacity 
                onPress={() => setShowPlaybackHistory(false)} 
                style={styles.headerButton}
              >
                <Ionicons name="close" size={26} color="#e2e8f0" />
              </TouchableOpacity>
            </View>
          </View>
          
          <ScrollView style={styles.downloadsContent} showsVerticalScrollIndicator={false}>
            {playbackHistory.filter(h => !h.completed).length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Sin terminar</Text>
                {playbackHistory.filter(h => !h.completed).map(item => (
                  <TouchableOpacity 
                    key={item.id} 
                    style={styles.downloadItem}
                    onPress={() => resumeFromHistory(item)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.downloadRow}>
                      {item.thumbnail ? (
                        <View style={styles.thumbnailContainer}>
                          <Image
                            source={{ uri: item.thumbnail }}
                            style={styles.historyThumbnail}
                            resizeMode="cover"
                          />
                          <View style={styles.playOverlay}>
                            <Ionicons name="play" size={24} color="#fff" />
                          </View>
                          <View style={styles.durationBadge}>
                            <Text style={styles.durationText}>
                              {formatDuration(item.currentTime)} / {formatDuration(item.duration)}
                            </Text>
                          </View>
                        </View>
                      ) : (
                        <View style={[styles.fileIconContainer, { width: 100, height: 60, borderRadius: 8 }]}>
                          <Ionicons name="videocam" size={28} color="#6366f1" />
                        </View>
                      )}
                      <View style={styles.downloadInfo}>
                        <Text style={styles.downloadFilename} numberOfLines={2}>{item.title}</Text>
                        <View style={styles.downloadMeta}>
                          <Text style={styles.downloadSpeed}>{item.progress}% visto</Text>
                          <Text style={styles.downloadDate}>{formatTimeAgo(item.lastPlayed)}</Text>
                        </View>
                        <View style={styles.historyProgressBg}>
                          <View style={[styles.historyProgressBar, { width: `${item.progress}%` }]} />
                        </View>
                      </View>
                    </View>
                    <View style={styles.downloadActions}>
                      <TouchableOpacity 
                        style={styles.actionButton} 
                        onPress={(e) => {
                          e.stopPropagation();
                          resumeFromHistory(item);
                        }}
                      >
                        <Ionicons name="play" size={20} color="#10b981" />
                        <Text style={[styles.actionText, { color: '#10b981' }]}>Continuar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={styles.actionButton}
                        onPress={(e) => {
                          e.stopPropagation();
                          deletePlaybackItem(item.id);
                        }}
                      >
                        <Ionicons name="close" size={20} color="#ef4444" />
                        <Text style={[styles.actionText, { color: '#ef4444' }]}>Quitar</Text>
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                ))}
              </>
            )}

            {playbackHistory.filter(h => h.completed).length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Vistos recientemente</Text>
                {playbackHistory.filter(h => h.completed).map(item => (
                  <TouchableOpacity 
                    key={item.id} 
                    style={[styles.downloadItem, { opacity: 0.7 }]}
                    onPress={() => resumeFromHistory({ ...item, currentTime: 0 })}
                    activeOpacity={0.7}
                  >
                    <View style={styles.downloadRow}>
                      {item.thumbnail ? (
                        <View style={styles.thumbnailContainer}>
                          <Image
                            source={{ uri: item.thumbnail }}
                            style={styles.historyThumbnail}
                            resizeMode="cover"
                          />
                          <View style={styles.completedOverlay}>
                            <Ionicons name="checkmark-circle" size={24} color="#10b981" />
                          </View>
                        </View>
                      ) : (
                        <View style={[styles.fileIconContainer, { width: 100, height: 60, borderRadius: 8 }]}>
                          <Ionicons name="checkmark-circle" size={28} color="#10b981" />
                        </View>
                      )}
                      <View style={styles.downloadInfo}>
                        <Text style={styles.downloadFilename} numberOfLines={2}>{item.title}</Text>
                        <View style={styles.downloadMeta}>
                          <Text style={styles.downloadSize}>{formatDuration(item.duration)}</Text>
                          <Text style={styles.downloadDate}>{formatTimeAgo(item.lastPlayed)}</Text>
                        </View>
                      </View>
                    </View>
                    <View style={styles.downloadActions}>
                      <TouchableOpacity 
                        style={styles.actionButton}
                        onPress={(e) => {
                          e.stopPropagation();
                          resumeFromHistory({ ...item, currentTime: 0 });
                        }}
                      >
                        <Ionicons name="refresh" size={20} color="#6366f1" />
                        <Text style={styles.actionText}>Ver de nuevo</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={styles.actionButton}
                        onPress={(e) => {
                          e.stopPropagation();
                          deletePlaybackItem(item.id);
                        }}
                      >
                        <Ionicons name="close" size={20} color="#ef4444" />
                        <Text style={[styles.actionText, { color: '#ef4444' }]}>Quitar</Text>
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                ))}
              </>
            )}

            {playbackHistory.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="play-circle-outline" size={64} color="#475569" />
                <Text style={styles.emptyTitle}>Sin historial</Text>
                <Text style={styles.emptyText}>
                  Los videos que veas aparecerán aquí para que puedas continuar donde lo dejaste.
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
    bottom: 20,
    alignSelf: 'center',
    zIndex: 100,
  },
  indicatorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.95)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  indicatorBadge: {
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    paddingHorizontal: 4,
  },
  indicatorBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  fabContainer: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    zIndex: 101,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  menuOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    zIndex: 102,
  },
  menu: {
    position: 'absolute',
    bottom: 90,
    alignSelf: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 16,
    paddingVertical: 8,
    minWidth: 200,
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
    paddingHorizontal: 18,
  },
  menuText: {
    color: '#e2e8f0',
    fontSize: 16,
    marginLeft: 14,
    flex: 1,
  },
  badge: {
    backgroundColor: '#6366f1',
    borderRadius: 10,
    minWidth: 22,
    height: 22,
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
    zIndex: 200,
  },
  downloadsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 50,
    paddingBottom: 16,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  downloadsTitle: {
    color: '#e2e8f0',
    fontSize: 22,
    fontWeight: 'bold',
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
    padding: 16,
  },
  sectionTitle: {
    color: '#94a3b8',
    fontSize: 13,
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
  downloadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  fileIconContainer: {
    width: 50,
    height: 50,
    borderRadius: 10,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  thumbnail: {
    width: 50,
    height: 50,
    borderRadius: 10,
    marginRight: 12,
    backgroundColor: '#334155',
  },
  downloadInfo: {
    flex: 1,
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
  downloadDuration: {
    color: '#10b981',
    fontSize: 12,
    marginTop: 2,
  },
  downloadDate: {
    color: '#64748b',
    fontSize: 12,
  },
  queueText: {
    color: '#94a3b8',
    fontSize: 13,
    fontStyle: 'italic',
  },
  pausedText: {
    color: '#fbbf24',
    fontSize: 13,
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
    gap: 8,
    marginTop: 4,
    flexWrap: 'wrap',
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
  thumbnailContainer: {
    position: 'relative',
    width: 100,
    height: 60,
    marginRight: 12,
    borderRadius: 8,
    overflow: 'hidden',
  },
  historyThumbnail: {
    width: '100%',
    height: '100%',
    backgroundColor: '#334155',
  },
  playOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  completedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '500',
  },
  historyProgressBg: {
    height: 3,
    backgroundColor: '#334155',
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  historyProgressBar: {
    height: '100%',
    backgroundColor: '#10b981',
    borderRadius: 2,
  },
});