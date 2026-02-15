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
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Notifications from 'expo-notifications';
import * as FileSystem from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';

// Configurar notificaciones
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
  status: 'downloading' | 'completed' | 'failed';
  filePath?: string;
  size?: string;
  downloadedAt?: Date;
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

  // Refs para evitar closures stale
  const isVideoPlayingRef = useRef(false);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const showMenuRef = useRef(false);
  const showDownloadsRef = useRef(false);

  // Animación para el FAB
  const fabPosition = useRef(new Animated.Value(-60)).current;
  const swipeIndicatorOpacity = useRef(new Animated.Value(1)).current;

  // Mantener refs sincronizados
  useEffect(() => {
    showMenuRef.current = showMenu;
  }, [showMenu]);

  useEffect(() => {
    showDownloadsRef.current = showDownloads;
  }, [showDownloads]);

  const clearHideTimeout = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  const startHideTimeout = useCallback(() => {
    clearHideTimeout();
    hideTimeoutRef.current = setTimeout(() => {
      if (!showMenuRef.current && !showDownloadsRef.current) {
        hideFabButton();
      }
    }, 3000);
  }, [clearHideTimeout]);

  const showFabButton = useCallback(() => {
    setShowFab(true);
    Animated.spring(fabPosition, {
      toValue: 16,
      useNativeDriver: true,
      tension: 50,
      friction: 7,
    }).start();
    Animated.timing(swipeIndicatorOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
    startHideTimeout();
  }, [fabPosition, swipeIndicatorOpacity, startHideTimeout]);

  const hideFabButton = useCallback(() => {
    clearHideTimeout();
    Animated.spring(fabPosition, {
      toValue: -60,
      useNativeDriver: true,
      tension: 50,
      friction: 7,
    }).start(() => {
      setShowFab(false);
      setShowMenu(false);
    });
    Animated.timing(swipeIndicatorOpacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [fabPosition, swipeIndicatorOpacity, clearHideTimeout]);

  const handleIndicatorPress = useCallback(() => {
    showFabButton();
  }, [showFabButton]);

  const enterVideoFullscreen = useCallback(() => {
    webViewRef.current?.injectJavaScript(`
      (function() {
        try {
          const videos = document.querySelectorAll('video');
          let playingVideo = null;
          videos.forEach(video => {
            if (!video.paused && !video.ended) playingVideo = video;
          });
          if (!playingVideo && videos.length > 0) playingVideo = videos[0];
          if (playingVideo && !document.fullscreenElement && !document.webkitFullscreenElement) {
            if (playingVideo.requestFullscreen) playingVideo.requestFullscreen();
            else if (playingVideo.webkitRequestFullscreen) playingVideo.webkitRequestFullscreen();
            else if (playingVideo.webkitEnterFullscreen) playingVideo.webkitEnterFullscreen();
          }
        } catch(e) {}
      })();
      true;
    `);
  }, []);

  useEffect(() => {
    loadServerUrl();
    loadDownloadHistory();
    setupNotifications();

    const subscription = ScreenOrientation.addOrientationChangeListener((event) => {
      const orientation = event.orientationInfo.orientation;
      if (isVideoPlayingRef.current && 
          (orientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT || 
           orientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT)) {
        enterVideoFullscreen();
      }
    });

    const backHandler = BackHandler.addEventListener('hardwareBackPress', handleBackPress);

    return () => {
      backHandler.remove();
      subscription.remove();
      clearHideTimeout();
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT).catch(() => {});
    };
  }, []);

  const handleBackPress = useCallback(() => {
    if (showDownloadsRef.current) {
      setShowDownloads(false);
      return true;
    }
    if (showMenuRef.current) {
      setShowMenu(false);
      startHideTimeout();
      return true;
    }
    if (showFab) {
      hideFabButton();
      return true;
    }
    if (isFullscreen) {
      exitFullscreen();
      return true;
    }
    if (canGoBack && webViewRef.current) {
      webViewRef.current.goBack();
      return true;
    }
    return false;
  }, [showFab, isFullscreen, canGoBack, hideFabButton, startHideTimeout]);

  const setupNotifications = async () => {
    try {
      await Notifications.requestPermissionsAsync();
    } catch (error) {
      console.log('Notifications permission error:', error);
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
      console.log('Error loading download history:', error);
    }
  };

  const saveDownloadHistory = async (history: DownloadItem[]) => {
    try {
      await AsyncStorage.setItem('DOWNLOAD_HISTORY', JSON.stringify(history));
    } catch (error) {
      console.log('Error saving download history:', error);
    }
  };

  const exitFullscreen = () => {
    webViewRef.current?.injectJavaScript(`
      try {
        if (document.fullscreenElement) document.exitFullscreen();
        else if (document.webkitFullscreenElement) document.webkitExitFullscreen();
      } catch(e) {}
      true;
    `);
  };

  const handleNavigationStateChange = (navState: any) => {
    setCanGoBack(navState.canGoBack);
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
        handleDownload(data.url, data.filename);
      }
    } catch (error) {}
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSecond: number) => {
    return formatBytes(bytesPerSecond) + '/s';
  };

  // Lógica de descarga corregida quirúrgicamente
  const handleDownload = async (url: string, filename: string) => {
    const downloadId = Date.now().toString();
    let lastBytes = 0;
    let lastTime = Date.now();

    // Limpieza de caracteres prohibidos en Android FS
    const cleanFilename = filename
      .split('?')[0]
      .split('#')[0]
      .replace(/[/\\?%*:|"<>\s]/g, '_') || `file_${downloadId}.mp4`;

    const newDownload: DownloadItem = {
      id: downloadId,
      filename: cleanFilename,
      url,
      progress: 0,
      speed: '0 B/s',
      status: 'downloading',
    };

    setActiveDownloads(prev => [...prev, newDownload]);
    setShowDownloads(true);

    try {
      await Notifications.scheduleNotificationAsync({
        content: { title: '📥 Descargando', body: cleanFilename },
        trigger: null,
      });

      // Asegurar separador de ruta
      const baseDir = FileSystem.documentDirectory?.endsWith('/') 
        ? FileSystem.documentDirectory 
        : `${FileSystem.documentDirectory}/`;
      
      const downloadPath = `${baseDir}${cleanFilename}`;

      const downloadResumable = FileSystem.createDownloadResumable(
        url,
        downloadPath,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
          },
        },
        (downloadProgress) => {
          const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
          const currentTime = Date.now();
          const timeDiff = (currentTime - lastTime) / 1000;
          const bytesDiff = downloadProgress.totalBytesWritten - lastBytes;
          const speed = timeDiff > 0 ? bytesDiff / timeDiff : 0;

          lastBytes = downloadProgress.totalBytesWritten;
          lastTime = currentTime;

          setActiveDownloads(prev => 
            prev.map(d => 
              d.id === downloadId 
                ? { 
                    ...d, 
                    progress: progress * 100, 
                    speed: formatSpeed(speed),
                    size: formatBytes(downloadProgress.totalBytesExpectedToWrite)
                  } 
                : d
            )
          );
        }
      );

      const result = await downloadResumable.downloadAsync();

      if (result) {
        const completedDownload: DownloadItem = {
          id: downloadId,
          filename: cleanFilename,
          url,
          progress: 100,
          speed: '0 B/s',
          status: 'completed',
          filePath: result.uri,
          downloadedAt: new Date(),
        };

        setActiveDownloads(prev => prev.filter(d => d.id !== downloadId));
        setDownloadHistory(prev => {
          const newHistory = [completedDownload, ...prev];
          saveDownloadHistory(newHistory);
          return newHistory;
        });

        await Notifications.scheduleNotificationAsync({
          content: { title: '✅ Descarga completa', body: cleanFilename },
          trigger: null,
        });
      }
    } catch (error) {
      console.error('Download error:', error);
      setActiveDownloads(prev => prev.map(d => d.id === downloadId ? { ...d, status: 'failed' } : d));
      Alert.alert("Error", "No se pudo bajar el archivo. Revise permisos.");
      
      setTimeout(() => {
        setActiveDownloads(prev => prev.filter(d => d.id !== downloadId));
        setDownloadHistory(prev => {
          const failed = { id: downloadId, filename: cleanFilename, url, progress: 0, speed: '0 B/s', status: 'failed', downloadedAt: new Date() } as DownloadItem;
          const newHistory = [failed, ...prev];
          saveDownloadHistory(newHistory);
          return newHistory;
        });
      }, 2000);
    }
  };

  const openFile = async (item: DownloadItem) => {
    if (item.filePath) {
      try {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) await Sharing.shareAsync(item.filePath);
        else Alert.alert('Error', 'No se puede abrir el archivo');
      } catch (error) {
        Alert.alert('Error', 'No se pudo abrir el archivo');
      }
    }
  };

  const deleteDownload = async (item: DownloadItem) => {
    Alert.alert('Eliminar', `¿Deseas eliminar "${item.filename}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            if (item.filePath) await FileSystem.deleteAsync(item.filePath, { idempotent: true });
            setDownloadHistory(prev => {
              const newHistory = prev.filter(d => d.id !== item.id);
              saveDownloadHistory(newHistory);
              return newHistory;
            });
          } catch (error) {}
        },
      },
    ]);
  };

  const clearAllDownloads = () => {
    Alert.alert('Limpiar', '¿Eliminar todo el historial?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar todo',
        style: 'destructive',
        onPress: async () => {
          for (const item of downloadHistory) {
            if (item.filePath) try { await FileSystem.deleteAsync(item.filePath, { idempotent: true }); } catch (e) {}
          }
          setDownloadHistory([]);
          saveDownloadHistory([]);
        },
      },
    ]);
  };

  const clearCache = async () => {
    Alert.alert('Caché', '¿Limpiar caché?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Limpiar',
        style: 'destructive',
        onPress: async () => {
          webViewRef.current?.clearCache?.(true);
          await Notifications.dismissAllNotificationsAsync();
          webViewRef.current?.reload();
          setShowMenu(false);
          startHideTimeout();
        },
      },
    ]);
  };

  const injectedJavaScript = `
    (function() {
      if (window.__streamPayInjected) return;
      window.__streamPayInjected = true;
      try {
        const handleFullscreenChange = () => {
          const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'fullscreenchange', isFullscreen: isFS }));
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

        const setupVideoListeners = () => {
          document.querySelectorAll('video').forEach(video => {
            if (!video.hasAttribute('data-sp-listener')) {
              video.setAttribute('data-sp-listener', 'true');
              const notify = (isPlaying) => window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'videoState', isPlaying }));
              video.addEventListener('play', () => notify(true));
              video.addEventListener('pause', () => notify(false));
              if (!video.paused && !video.ended) notify(true);
            }
          });
        };
        setupVideoListeners();
        new MutationObserver(setupVideoListeners).observe(document.body, { childList: true, subtree: true });

        document.addEventListener('click', function(e) {
          const target = e.target;
          const link = target.closest('a[download], a[href*=".mp4"], a[href*=".mp3"], a[href*=".mkv"], a[href*=".avi"]');
          if (link && link.href) {
            e.preventDefault();
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'download', url: link.href, filename: link.download || '' }));
            return false;
          }
        }, true);
      } catch(e) {}
    })();
    true;
  `;

  if (!serverUrl) return <View style={styles.container} />;

  return (
    <View style={styles.container}>
      <StatusBar style="light" hidden={isFullscreen} />

      <WebView
        ref={webViewRef}
        source={{ uri: serverUrl }}
        style={styles.webview}
        onNavigationStateChange={handleNavigationStateChange}
        onMessage={handleMessage}
        injectedJavaScript={injectedJavaScript}
        injectedJavaScriptBeforeContentLoaded={injectedJavaScript}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowsFullscreenVideo={true}
        allowsInlineMediaPlayback={true}
        userAgent="Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
        startInLoadingState={true}
        renderLoading={() => (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Cargando StreamPay...</Text>
          </View>
        )}
      />

      {!isFullscreen && !showFab && (
        <TouchableOpacity style={styles.swipeIndicator} onPress={handleIndicatorPress} activeOpacity={0.7}>
          <Animated.View style={{ opacity: swipeIndicatorOpacity }}>
            <Ionicons name="chevron-forward" size={20} color="#6366f1" />
          </Animated.View>
        </TouchableOpacity>
      )}

      {!isFullscreen && (
        <Animated.View style={[styles.fabContainer, { transform: [{ translateX: fabPosition }] }]}>
          <TouchableOpacity
            style={styles.fab}
            onPress={() => {
              const newShowMenu = !showMenu;
              setShowMenu(newShowMenu);
              if (newShowMenu) clearHideTimeout(); else startHideTimeout();
            }}
          >
            <Ionicons name={showMenu ? "close" : "menu"} size={24} color="#ffffff" />
          </TouchableOpacity>
        </Animated.View>
      )}

      {showMenu && !isFullscreen && (
        <>
          <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => { setShowMenu(false); startHideTimeout(); }} />
          <Animated.View style={[styles.menu, { transform: [{ translateX: fabPosition }] }]}>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); webViewRef.current?.reload(); }}>
              <Ionicons name="refresh-outline" size={20} color="#e2e8f0" />
              <Text style={styles.menuText}>Recargar</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); setShowDownloads(true); }}>
              <View style={styles.menuItemWithBadge}>
                <Ionicons name="download-outline" size={20} color="#e2e8f0" />
                <Text style={styles.menuText}>Descargas</Text>
                {activeDownloads.length > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{activeDownloads.length}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={clearCache}>
              <Ionicons name="trash-outline" size={20} color="#e2e8f0" />
              <Text style={styles.menuText}>Limpiar Caché</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); router.push('/config'); }}>
              <Ionicons name="settings-outline" size={20} color="#e2e8f0" />
              <Text style={styles.menuText}>Configuración</Text>
            </TouchableOpacity>
          </Animated.View>
        </>
      )}

      {showDownloads && (
        <View style={styles.downloadsModal}>
          <View style={styles.downloadsHeader}>
            <Text style={styles.downloadsTitle}>Descargas</Text>
            <TouchableOpacity onPress={() => { setShowDownloads(false); startHideTimeout(); }}>
              <Ionicons name="close" size={24} color="#e2e8f0" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.downloadsContent}>
            {activeDownloads.length > 0 && (
              <View style={styles.downloadSection}>
                <Text style={styles.sectionTitle}>Descargas Activas</Text>
                {activeDownloads.map((item) => (
                  <View key={item.id} style={styles.downloadItem}>
                    <View style={styles.downloadInfo}>
                      <Text style={styles.downloadFilename} numberOfLines={1}>{item.filename}</Text>
                      <View style={styles.downloadStats}>
                        <Text style={styles.downloadProgress}>{item.progress.toFixed(1)}%</Text>
                        <Text style={styles.downloadSpeed}>{item.speed}</Text>
                      </View>
                      <View style={styles.progressBarContainer}>
                        <View style={[styles.progressBar, { width: `${Math.min(item.progress, 100)}%` }]} />
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
            <View style={styles.downloadSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Historial</Text>
                {downloadHistory.length > 0 && (
                  <TouchableOpacity onPress={clearAllDownloads}>
                    <Text style={styles.clearAllText}>Limpiar todo</Text>
                  </TouchableOpacity>
                )}
              </View>
              {downloadHistory.length === 0 && activeDownloads.length === 0 ? (
                <Text style={styles.emptyText}>No hay descargas</Text>
              ) : (
                downloadHistory.map((item) => (
                  <View key={item.id} style={styles.downloadItem}>
                    <View style={styles.downloadInfo}>
                      <Text style={styles.downloadFilename} numberOfLines={1}>{item.filename}</Text>
                      <Text style={styles.downloadDate}>{item.status === 'completed' ? '✅ Completado' : '❌ Fallido'}</Text>
                    </View>
                    <View style={styles.downloadActions}>
                      {item.status === 'completed' && (
                        <TouchableOpacity style={styles.actionButton} onPress={() => openFile(item)}>
                          <Ionicons name="open-outline" size={20} color="#6366f1" />
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity style={styles.actionButton} onPress={() => deleteDownload(item)}>
                        <Ionicons name="trash-outline" size={20} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  webview: { flex: 1, backgroundColor: '#0f172a' },
  loadingContainer: { flex: 1, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: '#6366f1', fontSize: 16 },
  swipeIndicator: { position: 'absolute', top: 60, left: 0, width: 28, height: 44, backgroundColor: 'rgba(30, 41, 59, 0.9)', borderTopRightRadius: 10, borderBottomRightRadius: 10, justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  fabContainer: { position: 'absolute', top: 50, left: 0, zIndex: 101 },
  fab: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#6366f1', justifyContent: 'center', alignItems: 'center', elevation: 8 },
  menuOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 102 },
  menu: { position: 'absolute', top: 105, left: 0, backgroundColor: '#1e293b', borderRadius: 12, paddingVertical: 8, minWidth: 200, zIndex: 103, borderWidth: 1, borderColor: '#334155' },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16 },
  menuItemWithBadge: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  menuText: { color: '#e2e8f0', fontSize: 16, marginLeft: 12 },
  menuDivider: { height: 1, backgroundColor: '#334155', marginVertical: 4 },
  badge: { backgroundColor: '#ef4444', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', marginLeft: 'auto' },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  downloadsModal: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0f172a', zIndex: 200 },
  downloadsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 50, backgroundColor: '#1e293b' },
  downloadsTitle: { color: '#e2e8f0', fontSize: 20, fontWeight: 'bold' },
  downloadsContent: { flex: 1, padding: 16 },
  downloadSection: { marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { color: '#e2e8f0', fontSize: 16, fontWeight: '600', marginBottom: 12 },
  clearAllText: { color: '#ef4444', fontSize: 14 },
  downloadItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', borderRadius: 12, padding: 12, marginBottom: 8 },
  downloadInfo: { flex: 1 },
  downloadFilename: { color: '#e2e8f0', fontSize: 14, fontWeight: '500', marginBottom: 4 },
  downloadStats: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  downloadProgress: { color: '#6366f1', fontSize: 12, fontWeight: '600' },
  downloadSpeed: { color: '#94a3b8', fontSize: 12 },
  downloadDate: { color: '#94a3b8', fontSize: 12 },
  progressBarContainer: { height: 4, backgroundColor: '#334155', borderRadius: 2, overflow: 'hidden' },
  progressBar: { height: '100%', backgroundColor: '#6366f1' },
  downloadActions: { flexDirection: 'row', gap: 8 },
  actionButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#334155', justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#64748b', fontSize: 14, textAlign: 'center', paddingVertical: 20 },
});