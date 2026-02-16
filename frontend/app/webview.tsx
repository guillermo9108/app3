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
import * as MediaLibrary from 'expo-media-library';

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

  const isVideoPlayingRef = useRef(false);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const showMenuRef = useRef(false);
  const showDownloadsRef = useRef(false);

  const fabPosition = useRef(new Animated.Value(-60)).current;
  const swipeIndicatorOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => { showMenuRef.current = showMenu; }, [showMenu]);
  useEffect(() => { showDownloadsRef.current = showDownloads; }, [showDownloads]);

  const clearHideTimeout = useCallback(() => {
    if (hideTimeoutRef.current) { clearTimeout(hideTimeoutRef.current); hideTimeoutRef.current = null; }
  }, []);

  const startHideTimeout = useCallback(() => {
    clearHideTimeout();
    hideTimeoutRef.current = setTimeout(() => {
      if (!showMenuRef.current && !showDownloadsRef.current) hideFabButton();
    }, 3000);
  }, [clearHideTimeout]);

  const showFabButton = useCallback(() => {
    setShowFab(true);
    Animated.spring(fabPosition, { toValue: 16, useNativeDriver: true, tension: 50, friction: 7 }).start();
    Animated.timing(swipeIndicatorOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    startHideTimeout();
  }, [fabPosition, swipeIndicatorOpacity, startHideTimeout]);

  const hideFabButton = useCallback(() => {
    clearHideTimeout();
    Animated.spring(fabPosition, { toValue: -60, useNativeDriver: true, tension: 50, friction: 7 }).start(() => {
      setShowFab(false);
      setShowMenu(false);
    });
    Animated.timing(swipeIndicatorOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [fabPosition, swipeIndicatorOpacity, clearHideTimeout]);

  const handleIndicatorPress = useCallback(() => { showFabButton(); }, [showFabButton]);

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
    if (canGoBack && webViewRef.current) { webViewRef.current.goBack(); return true; }
    if (showDownloadsRef.current) { setShowDownloads(false); return true; }
    if (showMenuRef.current) { setShowMenu(false); startHideTimeout(); return true; }
    if (isFullscreen) { exitFullscreen(); return true; }
    if (showFab) { hideFabButton(); return true; }
    return false;
  }, [canGoBack, showFab, isFullscreen, hideFabButton, startHideTimeout]);

  useEffect(() => {
    loadServerUrl();
    loadDownloadHistory();
    const subscription = ScreenOrientation.addOrientationChangeListener((event) => {
      const orientation = event.orientationInfo.orientation;
      const isLandscape = orientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT || 
                          orientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT;
      if (isVideoPlayingRef.current && isLandscape) {
        setIsFullscreen(true);
        enterVideoFullscreen();
      } else if (!isLandscape) {
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
      if (url) setServerUrl(url); else router.replace('/config');
    } catch (error) { router.replace('/config'); }
  };

  const loadDownloadHistory = async () => {
    try {
      const history = await AsyncStorage.getItem('DOWNLOAD_HISTORY');
      if (history) setDownloadHistory(JSON.parse(history));
    } catch (error) {}
  };

  const saveDownloadHistory = async (history: DownloadItem[]) => {
    try { await AsyncStorage.setItem('DOWNLOAD_HISTORY', JSON.stringify(history)); } catch (error) {}
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

  const handleDownload = async (url: string, filename: string) => {
    const downloadId = Date.now().toString();
    const cleanFilename = filename.split('?')[0].replace(/[/\\?%*:|"<>\s]/g, '_') || `file_${downloadId}.mp4`;
    
    setActiveDownloads(prev => [...prev, { id: downloadId, filename: cleanFilename, url, progress: 0, speed: '0 B/s', status: 'downloading' }]);
    setShowDownloads(true);

    try {
      const downloadPath = `${FileSystem.documentDirectory}${cleanFilename}`;
      const downloadResumable = FileSystem.createDownloadResumable(url, downloadPath, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      }, (dp) => {
        const progress = (dp.totalBytesWritten / dp.totalBytesExpectedToWrite) * 100;
        setActiveDownloads(prev => prev.map(d => d.id === downloadId ? { ...d, progress } : d));
      });

      const result = await downloadResumable.downloadAsync();
      if (result) {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status === 'granted') {
          const asset = await MediaLibrary.createAssetAsync(result.uri);
          await MediaLibrary.createAlbumAsync('StreamPay', asset, false);
        }
        const completed: DownloadItem = { id: downloadId, filename: cleanFilename, url, progress: 100, speed: '0 B/s', status: 'completed', filePath: result.uri, downloadedAt: new Date() };
        setActiveDownloads(prev => prev.filter(d => d.id !== downloadId));
        setDownloadHistory(prev => { const h = [completed, ...prev]; saveDownloadHistory(h); return h; });
        Notifications.scheduleNotificationAsync({ content: { title: '✅ Descarga completa', body: cleanFilename }, trigger: null });
      }
    } catch (error) {
      setActiveDownloads(prev => prev.filter(d => d.id !== downloadId));
      Alert.alert("Error", "No se pudo descargar el archivo.");
    }
  };

  const openFile = async (item: DownloadItem) => { if (item.filePath) await Sharing.shareAsync(item.filePath); };
  
  const deleteDownload = async (item: DownloadItem) => {
    if (item.filePath) {
        try { await FileSystem.deleteAsync(item.filePath); } catch(e) {}
    }
    const newHistory = downloadHistory.filter(d => d.id !== item.id);
    setDownloadHistory(newHistory); 
    saveDownloadHistory(newHistory);
  };

  const injectedJavaScript = `
    (function() {
      if (window.__streamPayInjected) return;
      window.__streamPayInjected = true;
      const notify = (type, payload) => window.ReactNativeWebView.postMessage(JSON.stringify({ type, ...payload }));
      
      document.addEventListener('fullscreenchange', () => notify('fullscreenchange', { isFullscreen: !!document.fullscreenElement }));
      document.addEventListener('webkitfullscreenchange', () => notify('fullscreenchange', { isFullscreen: !!document.webkitFullscreenElement }));

      const checkVideos = () => {
        document.querySelectorAll('video').forEach(v => {
          if (!v.hasAttribute('data-sp')) {
            v.setAttribute('data-sp', '1');
            v.addEventListener('play', () => notify('videoState', { isPlaying: true }));
            v.addEventListener('pause', () => notify('videoState', { isPlaying: false }));
            if (!v.paused) notify('videoState', { isPlaying: true });
          }
        });
      };
      setInterval(checkVideos, 2000);

      document.addEventListener('click', e => {
        const a = e.target.closest('a');
        if (a && a.href) {
            const url = a.href.toLowerCase();
            const isVideo = url.match(/\\.(mp4|mkv|avi|mp3|mov|flv|webm)(\\?.*)?$/);
            if (isVideo || a.hasAttribute('download')) {
                e.preventDefault();
                notify('download', { 
                    url: a.href, 
                    filename: a.download || a.href.split('/').pop().split('#')[0].split('?')[0] 
                });
            }
        }
      }, true);
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
        onNavigationStateChange={(navState) => setCanGoBack(navState.canGoBack)}
        onMessage={handleMessage}
        injectedJavaScript={injectedJavaScript}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowsFullscreenVideo={true}
        allowsInlineMediaPlayback={true}
        userAgent="Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
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
                <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); webViewRef.current?.reload(); }}>
                  <Ionicons name="refresh-outline" size={20} color="#e2e8f0" />
                  <Text style={styles.menuText}>Recargar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); setShowDownloads(true); }}>
                  <Ionicons name="download-outline" size={20} color="#e2e8f0" />
                  <Text style={styles.menuText}>Descargas</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={() => { webViewRef.current?.clearCache?.(true); setShowMenu(false); }}>
                  <Ionicons name="trash-outline" size={20} color="#e2e8f0" />
                  <Text style={styles.menuText}>Limpiar Caché</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/config')}>
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
            <TouchableOpacity onPress={() => setShowDownloads(false)}><Ionicons name="close" size={24} color="#e2e8f0" /></TouchableOpacity>
          </View>
          <ScrollView style={styles.downloadsContent}>
            {activeDownloads.map(item => (
              <View key={item.id} style={styles.downloadItem}>
                <Text style={styles.downloadFilename} numberOfLines={1}>{item.filename}</Text>
                <View style={[styles.progressBar, { width: `${item.progress}%`, height: 4, marginTop: 10, borderRadius: 2 }]} />
                <Text style={{color: '#6366f1', fontSize: 10, marginTop: 5}}>{Math.round(item.progress)}%</Text>
              </View>
            ))}
            <Text style={styles.sectionTitle}>Historial</Text>
            {downloadHistory.length === 0 && <Text style={{color: '#64748b', textAlign: 'center', marginTop: 20}}>No hay descargas</Text>}
            {downloadHistory.map(item => (
              <View key={item.id} style={styles.downloadItem}>
                <View style={{flex: 1}}>
                    <Text style={styles.downloadFilename} numberOfLines={1}>{item.filename}</Text>
                    <Text style={{color: '#64748b', fontSize: 10}}>{item.downloadedAt ? new Date(item.downloadedAt).toLocaleDateString() : ''}</Text>
                </View>
                <View style={styles.downloadActions}>
                  <TouchableOpacity onPress={() => openFile(item)}><Ionicons name="open-outline" size={22} color="#6366f1" /></TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteDownload(item)}><Ionicons name="trash-outline" size={22} color="#ef4444" /></TouchableOpacity>
                </View>
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
  swipeIndicator: { position: 'absolute', top: 60, left: 0, width: 28, height: 44, backgroundColor: 'rgba(30, 41, 59, 0.9)', borderTopRightRadius: 10, borderBottomRightRadius: 10, justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  fabContainer: { position: 'absolute', top: 50, left: 0, zIndex: 101 },
  fab: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#6366f1', justifyContent: 'center', alignItems: 'center', elevation: 8 },
  menuOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 102 },
  menu: { position: 'absolute', top: 105, left: 0, backgroundColor: '#1e293b', borderRadius: 12, paddingVertical: 8, minWidth: 200, zIndex: 103, borderWidth: 1, borderColor: '#334155' },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  menuText: { color: '#e2e8f0', fontSize: 16, marginLeft: 12 },
  downloadsModal: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0f172a', zIndex: 200 },
  downloadsHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, paddingTop: 50, backgroundColor: '#1e293b' },
  downloadsTitle: { color: '#e2e8f0', fontSize: 20, fontWeight: 'bold' },
  downloadsContent: { padding: 16 },
  downloadItem: { backgroundColor: '#1e293b', borderRadius: 8, padding: 12, marginBottom: 8, flexDirection: 'column' },
  downloadFilename: { color: '#e2e8f0', fontWeight: '500' },
  progressBar: { backgroundColor: '#6366f1' },
  downloadActions: { flexDirection: 'row', gap: 20, alignItems: 'center', marginLeft: 10 },
  sectionTitle: { color: '#e2e8f0', fontSize: 16, fontWeight: 'bold', marginVertical: 15, borderBottomWidth: 1, borderBottomColor: '#334155', pb: 5 },
});