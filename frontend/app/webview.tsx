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
} from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Notifications from 'expo-notifications';
import * as FileSystem from 'expo-file-system/legacy'; // MANTENIDO POR SOLICITUD
import { Ionicons } from '@expo/vector-icons';
import * as IntentLauncher from 'expo-intent-launcher';
import * as MediaLibrary from 'expo-media-library';

const DOWNLOAD_EXTENSIONS = /\.(mp4|mkv|avi|mov|wmv|flv|webm|mp3|aac|flac|wav|ogg|pdf|zip|rar|7z|doc|docx|xls|xlsx|ppt|pptx|apk|exe|dmg|iso)/i;

const MIME_TYPES: { [key: string]: string } = {
  'mp4': 'video/mp4', 'mkv': 'video/x-matroska', 'avi': 'video/x-msvideo',
  'mov': 'video/quicktime', 'wmv': 'video/x-ms-wmv', 'flv': 'video/x-flv',
  'webm': 'video/webm', '3gp': 'video/3gpp', 'm4v': 'video/x-m4v',
  'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'aac': 'audio/aac',
  'flac': 'audio/flac', 'ogg': 'audio/ogg', 'm4a': 'audio/mp4',
  'pdf': 'application/pdf', 'doc': 'application/msword',
  'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'xls': 'application/vnd.ms-excel',
  'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'zip': 'application/zip', 'rar': 'application/x-rar-compressed',
  'apk': 'application/vnd.android.package-archive',
};

if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('downloads', {
    name: 'Descargas',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#6366f1',
    enableVibrate: true,
    showBadge: true,
  });
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
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

  // (Continúa en la siguiente parte...)
  // --- GESTIÓN DE PERMISOS ---
  const checkPermissions = async (): Promise<PermissionStatus> => {
    try {
      const notifStatus = await Notifications.getPermissionsAsync();
      const mediaStatus = await MediaLibrary.getPermissionsAsync();
      const status = {
        notifications: notifStatus.status === 'granted',
        mediaLibrary: mediaStatus.status === 'granted',
        allGranted: notifStatus.status === 'granted' && mediaStatus.status === 'granted',
      };
      setPermissions(status);
      return status;
    } catch (error) {
      return { notifications: false, mediaLibrary: false, allGranted: false };
    }
  };

  const requestAllPermissions = async () => {
    const notifResult = await Notifications.requestPermissionsAsync();
    const mediaResult = await MediaLibrary.requestPermissionsAsync();
    const newStatus = {
      notifications: notifResult.status === 'granted',
      mediaLibrary: mediaResult.status === 'granted',
      allGranted: notifResult.status === 'granted' && mediaResult.status === 'granted',
    };
    setPermissions(newStatus);
    if (!newStatus.allGranted) {
      Alert.alert('Permisos', 'Se requieren permisos para descargas y notificaciones.', [
        { text: 'Configuración', onPress: () => Linking.openSettings() },
        { text: 'OK' }
      ]);
    }
    return newStatus;
  };

  // --- LÓGICA DE NAVEGACIÓN Y PANTALLA ---
  const handleBackPress = useCallback(() => {
    if (showDownloadsRef.current) { setShowDownloads(false); return true; }
    if (showMenuRef.current) { setShowMenu(false); return true; }
    if (isFullscreen) { exitFullscreen(); return true; }
    if (canGoBack && webViewRef.current) { webViewRef.current.goBack(); return true; }
    return false;
  }, [canGoBack, isFullscreen]);

  const enterVideoFullscreen = useCallback(() => {
    webViewRef.current?.injectJavaScript(`
      (function() {
        const v = document.querySelector('video');
        if (v) {
          if (v.requestFullscreen) v.requestFullscreen();
          else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
          v.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; z-index:9999; background:black;';
        }
      })();
      true;
    `);
  }, []);

  const exitFullscreen = () => {
    setIsFullscreen(false);
    webViewRef.current?.injectJavaScript(`
      const v = document.querySelector('video');
      if (v) v.style.cssText = '';
      if (document.exitFullscreen) document.exitFullscreen();
      true;
    `);
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
  };

  // --- LÓGICA DE DESCARGA (CORREGIDA) ---
  const handleDownload = async (url: string, suggestedFilename: string = '') => {
    const downloadId = Date.now().toString();
    const filename = suggestedFilename || `file_${downloadId}.mp4`;
    // CORRECCIÓN: Uso de documentDirectory para persistencia
    const downloadPath = `${FileSystem.documentDirectory}${filename}`;

    const newDownload: DownloadItem = {
      id: downloadId,
      filename,
      url,
      progress: 0,
      speed: '0 B/s',
      status: 'downloading',
    };

    setActiveDownloads(prev => [...prev, newDownload]);
    setShowDownloads(true);

    try {
      const downloadResumable = FileSystem.createDownloadResumable(
        url,
        downloadPath,
        {},
        (progress) => {
          const p = (progress.totalBytesWritten / progress.totalBytesExpectedToWrite) * 100;
          setActiveDownloads(prev => prev.map(d => 
            d.id === downloadId ? { ...d, progress: Math.round(p) } : d
          ));
        }
      );

      downloadResumablesRef.current.set(downloadId, downloadResumable);
      const result = await downloadResumable.downloadAsync();
      downloadResumablesRef.current.delete(downloadId);

      if (result?.uri) {
        // CORRECCIÓN: Guardado en MediaLibrary (Galería)
        const asset = await MediaLibrary.createAssetAsync(result.uri);
        
        const completedItem: DownloadItem = {
          ...newDownload,
          status: 'completed',
          progress: 100,
          filePath: result.uri,
          downloadedAt: new Date(),
        };

        setActiveDownloads(prev => prev.filter(d => d.id !== downloadId));
        setDownloadHistory(prev => {
          const updated = [completedItem, ...prev].slice(0, 100);
          AsyncStorage.setItem('DOWNLOAD_HISTORY', JSON.stringify(updated));
          return updated;
        });

        Notifications.scheduleNotificationAsync({
          content: { title: "✅ Descarga completa", body: filename },
          trigger: null,
        });
      }
    } catch (error) {
      setActiveDownloads(prev => prev.map(d => d.id === downloadId ? { ...d, status: 'failed', error: 'Error de red' } : d));
    }
  };

  // --- APERTURA DE ARCHIVOS (CORREGIDA) ---
  const openFile = async (item: DownloadItem) => {
    if (!item.filePath) return;
    try {
      const mimeType = MIME_TYPES[item.filename.split('.').pop() || ''] || 'application/octet-stream';
      
      if (Platform.OS === 'android') {
        // CORRECCIÓN: Uso de contentUri y flags para permisos en Android
        const contentUri = await FileSystem.getContentUriAsync(item.filePath);
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: contentUri,
          type: mimeType,
          flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
        });
      } else {
        await Linking.openURL(item.filePath);
      }
    } catch (e) {
      Alert.alert('Error', 'No se pudo abrir el archivo. Asegúrate de tener un reproductor compatible.');
    }
  };

  // (Continúa en la siguiente parte con los Handlers de WebView y JSX...)
  // --- EFECTOS DE INICIALIZACIÓN ---
  useEffect(() => {
    const init = async () => {
      const url = await AsyncStorage.getItem('SERVER_URL');
      if (url) setServerUrl(url);
      else router.replace('/config');

      const history = await AsyncStorage.getItem('DOWNLOAD_HISTORY');
      if (history) setDownloadHistory(JSON.parse(history));

      const status = await checkPermissions();
      if (!status.allGranted) await requestAllPermissions();
    };

    init();

    const backHandler = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    const appStateListener = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') checkPermissions();
    });

    return () => {
      backHandler.remove();
      appStateListener.remove();
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, [handleBackPress]);

  // --- ANIMACIONES DE LA INTERFAZ ---
  const showFabButton = () => {
    setShowFab(true);
    Animated.parallel([
      Animated.spring(fabPosition, { toValue: 16, useNativeDriver: true, tension: 50, friction: 7 }),
      Animated.timing(swipeIndicatorOpacity, { toValue: 0, duration: 200, useNativeDriver: true })
    ]).start();

    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = setTimeout(hideFabButton, 4000);
  };

  const hideFabButton = () => {
    if (showMenuRef.current || showDownloadsRef.current) return;
    Animated.parallel([
      Animated.spring(fabPosition, { toValue: -60, useNativeDriver: true }),
      Animated.timing(swipeIndicatorOpacity, { toValue: 1, duration: 300, useNativeDriver: true })
    ]).start(() => setShowFab(false));
  };

  // --- RENDERIZADO ---
  return (
    <View style={styles.container}>
      <StatusBar style="light" hidden={isFullscreen} translucent />
      
      <WebView
        ref={webViewRef}
        source={{ uri: serverUrl || 'about:blank' }}
        style={styles.webview}
        onNavigationStateChange={(nav) => setCanGoBack(nav.canGoBack)}
        onFileDownload={({ nativeEvent }) => handleDownload(nativeEvent.downloadUrl)}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowsFullscreenVideo={true}
        onMessage={(event) => {
          if (event.nativeEvent.data === 'videoFullscreen') enterVideoFullscreen();
        }}
        renderLoading={() => (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color="#6366f1" />
          </View>
        )}
      />

      {!isFullscreen && (
        <>
          {/* Indicador de Swipe Lateral */}
          {!showFab && (
            <TouchableOpacity style={styles.swipeIndicator} onPress={showFabButton}>
              <Animated.View style={{ opacity: swipeIndicatorOpacity }}>
                <Ionicons name="chevron-forward" size={18} color="#6366f1" />
              </Animated.View>
            </TouchableOpacity>
          )}

          {/* Botón Flotante (FAB) */}
          <Animated.View style={[styles.fabContainer, { transform: [{ translateX: fabPosition }] }]}>
            <TouchableOpacity 
              style={[styles.fab, showMenu && styles.fabActive]} 
              onPress={() => setShowMenu(!showMenu)}
            >
              <Ionicons name={showMenu ? "close" : "menu"} size={26} color="#fff" />
            </TouchableOpacity>
          </Animated.View>

          {/* Menú Desplegable */}
          {showMenu && (
            <View style={styles.menu}>
              <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); setShowDownloads(true); }}>
                <Ionicons name="download-outline" size={20} color="#e2e8f0" />
                <Text style={styles.menuText}>Descargas</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); webViewRef.current?.reload(); }}>
                <Ionicons name="refresh-outline" size={20} color="#e2e8f0" />
                <Text style={styles.menuText}>Recargar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => router.replace('/config')}>
                <Ionicons name="settings-outline" size={20} color="#e2e8f0" />
                <Text style={styles.menuText}>Servidor</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {/* Modal de Gestión de Descargas */}
      {showDownloads && (
        <View style={styles.downloadsModal}>
          <View style={styles.downloadsHeader}>
            <Text style={styles.downloadsTitle}>Gestor de Archivos</Text>
            <TouchableOpacity onPress={() => setShowDownloads(false)}>
              <Ionicons name="close" size={30} color="#e2e8f0" />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.downloadsContent}>
            <Text style={styles.sectionLabel}>EN CURSO</Text>
            {activeDownloads.length === 0 && <Text style={styles.emptyText}>No hay descargas activas</Text>}
            {activeDownloads.map(item => (
              <View key={item.id} style={styles.downloadItem}>
                <Text style={styles.filename} numberOfLines={1}>{item.filename}</Text>
                <View style={styles.progressContainer}>
                  <View style={[styles.progressBar, { width: `${item.progress}%` }]} />
                </View>
                <Text style={styles.progressText}>{item.progress}%</Text>
              </View>
            ))}

            <Text style={[styles.sectionLabel, { marginTop: 20 }]}>HISTORIAL</Text>
            {downloadHistory.map(item => (
              <View key={item.id} style={styles.historyItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.filename} numberOfLines={1}>{item.filename}</Text>
                  <Text style={styles.historyDate}>{new Date(item.downloadedAt!).toLocaleDateString()}</Text>
                </View>
                <TouchableOpacity onPress={() => openFile(item)} style={styles.openBtn}>
                  <Ionicons name="play-circle" size={20} color="#6366f1" />
                  <Text style={styles.openBtnText}>ABRIR</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  webview: { flex: 1 },
  loader: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' },
  fabContainer: { position: 'absolute', top: 60, left: 0, zIndex: 101 },
  fab: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#6366f1', justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4 },
  fabActive: { backgroundColor: '#4338ca' },
  swipeIndicator: { position: 'absolute', top: 63, left: 0, width: 22, height: 44, backgroundColor: 'rgba(30, 41, 59, 0.8)', borderTopRightRadius: 12, borderBottomRightRadius: 12, justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  menu: { position: 'absolute', top: 120, left: 16, backgroundColor: '#1e293b', borderRadius: 16, padding: 8, minWidth: 200, zIndex: 103, elevation: 10, borderWidth: 1, borderColor: '#334155' },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 10 },
  menuText: { color: '#f1f5f9', marginLeft: 12, fontSize: 16, fontWeight: '500' },
  downloadsModal: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0f172a', zIndex: 200 },
  downloadsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20, backgroundColor: '#1e293b' },
  downloadsTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  downloadsContent: { padding: 20 },
  sectionLabel: { color: '#6366f1', fontSize: 12, fontWeight: '800', marginBottom: 15, letterSpacing: 1 },
  downloadItem: { backgroundColor: '#1e293b', padding: 15, borderRadius: 12, marginBottom: 12 },
  historyItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', padding: 15, borderRadius: 12, marginBottom: 10 },
  filename: { color: '#f1f5f9', fontSize: 14, fontWeight: '600' },
  historyDate: { color: '#64748b', fontSize: 11, marginTop: 4 },
  progressContainer: { height: 6, backgroundColor: '#334155', borderRadius: 3, marginTop: 10, overflow: 'hidden' },
  progressBar: { height: '100%', backgroundColor: '#6366f1' },
  progressText: { color: '#94a3b8', fontSize: 12, marginTop: 6, textAlign: 'right' },
  emptyText: { color: '#475569', textAlign: 'center', marginTop: 10, fontSize: 14 },
  openBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(99, 102, 241, 0.15)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  openBtnText: { color: '#818cf8', fontWeight: 'bold', fontSize: 13, marginLeft: 6 }
});