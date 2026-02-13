import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  BackHandler,
  Alert,
  TouchableOpacity,
  Text,
  PanResponder,
  Animated,
  ScrollView,
  Dimensions,
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  
  // Animación para el FAB
  const fabPosition = useRef(new Animated.Value(-60)).current;
  const swipeIndicatorOpacity = useRef(new Animated.Value(1)).current;
  
  // PanResponder para detectar swipe desde el borde izquierdo
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt) => {
        // Solo activar si el touch empieza cerca del borde izquierdo
        return evt.nativeEvent.pageX < 30;
      },
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        return evt.nativeEvent.pageX < 50 && gestureState.dx > 10;
      },
      onPanResponderMove: (evt, gestureState) => {
        if (gestureState.dx > 0 && gestureState.dx < 80) {
          fabPosition.setValue(-60 + gestureState.dx);
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dx > 40) {
          // Mostrar FAB
          showFabButton();
        } else {
          // Ocultar FAB
          hideFabButton();
        }
      },
    })
  ).current;

  const showFabButton = () => {
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
  };

  const hideFabButton = () => {
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
  };

  useEffect(() => {
    loadServerUrl();
    loadDownloadHistory();
    setupNotifications();
    setupOrientationListener();
    
    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      handleBackPress
    );

    return () => {
      backHandler.remove();
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT).catch(() => {});
    };
  }, [canGoBack, isVideoPlaying]);

  const setupOrientationListener = async () => {
    // Escuchar cambios de orientación
    ScreenOrientation.addOrientationChangeListener((event) => {
      const orientation = event.orientationInfo.orientation;
      
      // Si hay un video reproduciéndose y se gira a horizontal
      if (isVideoPlaying && 
          (orientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT || 
           orientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT)) {
        // Poner video en pantalla completa
        enterVideoFullscreen();
      }
    });
  };

  const enterVideoFullscreen = () => {
    webViewRef.current?.injectJavaScript(`
      try {
        const video = document.querySelector('video');
        if (video && !document.fullscreenElement) {
          if (video.requestFullscreen) {
            video.requestFullscreen();
          } else if (video.webkitRequestFullscreen) {
            video.webkitRequestFullscreen();
          } else if (video.webkitEnterFullscreen) {
            video.webkitEnterFullscreen();
          }
        }
      } catch(e) {
        console.log('Fullscreen error:', e);
      }
      true;
    `);
  };

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
      if (url) {
        setServerUrl(url);
      } else {
        router.replace('/config');
      }
    } catch (error) {
      console.error('Error loading server URL:', error);
      router.replace('/config');
    }
  };

  const loadDownloadHistory = async () => {
    try {
      const history = await AsyncStorage.getItem('DOWNLOAD_HISTORY');
      if (history) {
        setDownloadHistory(JSON.parse(history));
      }
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

  const handleBackPress = () => {
    if (showDownloads) {
      setShowDownloads(false);
      return true;
    }
    if (showMenu) {
      setShowMenu(false);
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
  };

  const exitFullscreen = () => {
    webViewRef.current?.injectJavaScript(`
      try {
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else if (document.webkitFullscreenElement) {
          document.webkitExitFullscreen();
        }
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
        if (data.isFullscreen) {
          await ScreenOrientation.unlockAsync();
        } else {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
        }
      }
      
      if (data.type === 'videoState') {
        setIsVideoPlaying(data.isPlaying);
        // Si el video empieza a reproducirse, desbloquear orientación
        if (data.isPlaying) {
          await ScreenOrientation.unlockAsync();
        }
      }
      
      if (data.type === 'download') {
        handleDownload(data.url, data.filename);
      }
      
      if (data.type === 'audio') {
        if (data.action === 'playing') {
          showAudioNotification(data.title, data.artist);
        } else if (data.action === 'paused') {
          await Notifications.dismissAllNotificationsAsync();
        }
      }
    } catch (error) {
      // Ignorar errores de parsing
    }
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

  const handleDownload = async (url: string, filename: string) => {
    const downloadId = Date.now().toString();
    let lastBytes = 0;
    let lastTime = Date.now();
    
    const newDownload: DownloadItem = {
      id: downloadId,
      filename,
      url,
      progress: 0,
      speed: '0 B/s',
      status: 'downloading',
    };

    setActiveDownloads(prev => [...prev, newDownload]);

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '📥 Descargando',
          body: filename,
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
          
          // Calcular velocidad
          const currentTime = Date.now();
          const timeDiff = (currentTime - lastTime) / 1000; // en segundos
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

          if (progress > 0 && progress < 1) {
            Notifications.scheduleNotificationAsync({
              content: {
                title: '📥 Descargando',
                body: `${filename} - ${Math.round(progress * 100)}%`,
              },
              trigger: null,
            });
          }
        }
      );

      const result = await downloadResumable.downloadAsync();
      
      if (result) {
        const completedDownload: DownloadItem = {
          id: downloadId,
          filename,
          url,
          progress: 100,
          speed: '0 B/s',
          status: 'completed',
          filePath: result.uri,
          downloadedAt: new Date(),
        };

        // Remover de activas y agregar al historial
        setActiveDownloads(prev => prev.filter(d => d.id !== downloadId));
        setDownloadHistory(prev => {
          const newHistory = [completedDownload, ...prev];
          saveDownloadHistory(newHistory);
          return newHistory;
        });

        await Notifications.scheduleNotificationAsync({
          content: {
            title: '✅ Descarga completa',
            body: filename,
          },
          trigger: null,
        });
      }
    } catch (error) {
      setActiveDownloads(prev => 
        prev.map(d => 
          d.id === downloadId ? { ...d, status: 'failed' } : d
        )
      );

      await Notifications.scheduleNotificationAsync({
        content: {
          title: '❌ Error en descarga',
          body: filename,
        },
        trigger: null,
      });
    }
  };

  const openFile = async (item: DownloadItem) => {
    if (item.filePath) {
      try {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(item.filePath);
        } else {
          Alert.alert('Error', 'No se puede abrir el archivo');
        }
      } catch (error) {
        Alert.alert('Error', 'No se pudo abrir el archivo');
      }
    }
  };

  const deleteDownload = async (item: DownloadItem) => {
    Alert.alert(
      'Eliminar archivo',
      `¿Deseas eliminar "${item.filename}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              if (item.filePath) {
                await FileSystem.deleteAsync(item.filePath, { idempotent: true });
              }
              setDownloadHistory(prev => {
                const newHistory = prev.filter(d => d.id !== item.id);
                saveDownloadHistory(newHistory);
                return newHistory;
              });
            } catch (error) {
              Alert.alert('Error', 'No se pudo eliminar el archivo');
            }
          },
        },
      ]
    );
  };

  const clearAllDownloads = () => {
    Alert.alert(
      'Limpiar historial',
      '¿Deseas eliminar todo el historial de descargas?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar todo',
          style: 'destructive',
          onPress: async () => {
            for (const item of downloadHistory) {
              if (item.filePath) {
                try {
                  await FileSystem.deleteAsync(item.filePath, { idempotent: true });
                } catch (e) {}
              }
            }
            setDownloadHistory([]);
            saveDownloadHistory([]);
          },
        },
      ]
    );
  };

  const showAudioNotification = async (title: string, artist: string) => {
    try {
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
    } catch (error) {
      console.log('Audio notification error:', error);
    }
  };

  const clearCache = async () => {
    Alert.alert(
      'Limpiar Caché',
      '¿Deseas limpiar el caché de la aplicación?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Limpiar',
          style: 'destructive',
          onPress: async () => {
            try {
              webViewRef.current?.clearCache?.(true);
              await Notifications.dismissAllNotificationsAsync();
              Alert.alert('Éxito', 'Caché limpiado correctamente');
              webViewRef.current?.reload();
            } catch (error) {
              Alert.alert('Error', 'No se pudo limpiar el caché completamente');
            }
            setShowMenu(false);
          },
        },
      ]
    );
  };

  // JavaScript para detectar estado del video y orientación automática
  const injectedJavaScript = `
    (function() {
      try {
        // Detectar fullscreen
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

        // Monitorear todos los videos
        const setupVideoListeners = () => {
          const videos = document.querySelectorAll('video');
          videos.forEach(video => {
            if (!video.hasAttribute('data-listener-added')) {
              video.setAttribute('data-listener-added', 'true');
              
              video.addEventListener('play', function() {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'videoState',
                  isPlaying: true
                }));
              });
              
              video.addEventListener('pause', function() {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'videoState',
                  isPlaying: false
                }));
              });
              
              video.addEventListener('ended', function() {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'videoState',
                  isPlaying: false
                }));
              });
            }
          });
        };

        // Ejecutar al cargar y observar cambios en el DOM
        setupVideoListeners();
        
        const observer = new MutationObserver(() => {
          setupVideoListeners();
        });
        
        observer.observe(document.body, { 
          childList: true, 
          subtree: true 
        });

        // Interceptar descargas
        document.addEventListener('click', function(e) {
          const link = e.target.closest('a[download], a[href*=".mp4"], a[href*=".mp3"], a[href*=".pdf"], a[href*=".zip"]');
          if (link) {
            e.preventDefault();
            const url = link.href;
            const filename = link.download || url.split('/').pop() || 'download';
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'download',
              url: url,
              filename: filename
            }));
          }
        }, true);

      } catch(e) {
        console.log('Injection error:', e);
      }
    })();
    true;
  `;

  if (!serverUrl) {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <StatusBar style="light" hidden={isFullscreen} />
      
      <WebView
        ref={webViewRef}
        source={{ uri: serverUrl }}
        style={styles.webview}
        onNavigationStateChange={handleNavigationStateChange}
        onMessage={handleMessage}
        injectedJavaScript={injectedJavaScript}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.warn('WebView error: ', nativeEvent);
        }}
        onHttpError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.warn('HTTP error: ', nativeEvent);
        }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowFileAccess={true}
        mediaPlaybackRequiresUserAction={false}
        allowsFullscreenVideo={true}
        allowsInlineMediaPlayback={true}
        mixedContentMode="always"
        userAgent="Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 StreamPayAPK/3.0"
        cacheEnabled={true}
        cacheMode="LOAD_CACHE_ELSE_NETWORK"
        incognito={false}
        androidLayerType="hardware"
        androidHardwareAccelerationDisabled={false}
        setSupportMultipleWindows={false}
        startInLoadingState={true}
        renderLoading={() => (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Cargando StreamPay...</Text>
          </View>
        )}
      />

      {/* Indicador de swipe en el borde izquierdo */}
      {!isFullscreen && !showFab && (
        <Animated.View 
          style={[
            styles.swipeIndicator,
            { opacity: swipeIndicatorOpacity }
          ]}
        >
          <Ionicons name="chevron-forward" size={20} color="#6366f1" />
        </Animated.View>
      )}

      {/* FAB flotante en la esquina superior izquierda */}
      {!isFullscreen && (
        <Animated.View
          style={[
            styles.fabContainer,
            { transform: [{ translateX: fabPosition }] }
          ]}
        >
          <TouchableOpacity
            style={styles.fab}
            onPress={() => setShowMenu(!showMenu)}
            onLongPress={hideFabButton}
          >
            <Ionicons 
              name={showMenu ? "close" : "menu"} 
              size={24} 
              color="#ffffff" 
            />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Menú desplegable */}
      {showMenu && !isFullscreen && (
        <>
          <TouchableOpacity
            style={styles.menuOverlay}
            activeOpacity={1}
            onPress={() => setShowMenu(false)}
          />
          
          <Animated.View 
            style={[
              styles.menu,
              { transform: [{ translateX: fabPosition }] }
            ]}
          >
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                webViewRef.current?.reload();
              }}
            >
              <Ionicons name="refresh-outline" size={20} color="#e2e8f0" />
              <Text style={styles.menuText}>Recargar</Text>
            </TouchableOpacity>
            
            <View style={styles.menuDivider} />
            
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                setShowDownloads(true);
              }}
            >
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
            
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                clearCache();
              }}
            >
              <Ionicons name="trash-outline" size={20} color="#e2e8f0" />
              <Text style={styles.menuText}>Limpiar Caché</Text>
            </TouchableOpacity>
            
            <View style={styles.menuDivider} />
            
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                router.push('/config');
              }}
            >
              <Ionicons name="settings-outline" size={20} color="#e2e8f0" />
              <Text style={styles.menuText}>Configuración</Text>
            </TouchableOpacity>

            <View style={styles.menuDivider} />
            
            <TouchableOpacity
              style={styles.menuItem}
              onPress={hideFabButton}
            >
              <Ionicons name="eye-off-outline" size={20} color="#94a3b8" />
              <Text style={[styles.menuText, { color: '#94a3b8' }]}>Ocultar menú</Text>
            </TouchableOpacity>
          </Animated.View>
        </>
      )}

      {/* Modal de Descargas */}
      {showDownloads && (
        <View style={styles.downloadsModal}>
          <View style={styles.downloadsHeader}>
            <Text style={styles.downloadsTitle}>Descargas</Text>
            <TouchableOpacity onPress={() => setShowDownloads(false)}>
              <Ionicons name="close" size={24} color="#e2e8f0" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.downloadsContent}>
            {/* Descargas Activas */}
            {activeDownloads.length > 0 && (
              <View style={styles.downloadSection}>
                <Text style={styles.sectionTitle}>
                  <Ionicons name="cloud-download-outline" size={16} color="#6366f1" /> Descargas Activas
                </Text>
                {activeDownloads.map((item) => (
                  <View key={item.id} style={styles.downloadItem}>
                    <View style={styles.downloadInfo}>
                      <Text style={styles.downloadFilename} numberOfLines={1}>
                        {item.filename}
                      </Text>
                      <View style={styles.downloadStats}>
                        <Text style={styles.downloadProgress}>
                          {item.progress.toFixed(1)}%
                        </Text>
                        <Text style={styles.downloadSpeed}>{item.speed}</Text>
                      </View>
                      <View style={styles.progressBarContainer}>
                        <View 
                          style={[
                            styles.progressBar, 
                            { width: `${item.progress}%` }
                          ]} 
                        />
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Historial de Descargas */}
            <View style={styles.downloadSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  <Ionicons name="time-outline" size={16} color="#6366f1" /> Historial
                </Text>
                {downloadHistory.length > 0 && (
                  <TouchableOpacity onPress={clearAllDownloads}>
                    <Text style={styles.clearAllText}>Limpiar todo</Text>
                  </TouchableOpacity>
                )}
              </View>
              
              {downloadHistory.length === 0 ? (
                <Text style={styles.emptyText}>No hay descargas en el historial</Text>
              ) : (
                downloadHistory.map((item) => (
                  <View key={item.id} style={styles.downloadItem}>
                    <View style={styles.downloadInfo}>
                      <Text style={styles.downloadFilename} numberOfLines={1}>
                        {item.filename}
                      </Text>
                      <Text style={styles.downloadDate}>
                        {item.status === 'completed' ? '✅ Completado' : '❌ Fallido'}
                        {item.size && ` • ${item.size}`}
                      </Text>
                    </View>
                    <View style={styles.downloadActions}>
                      {item.status === 'completed' && (
                        <TouchableOpacity 
                          style={styles.actionButton}
                          onPress={() => openFile(item)}
                        >
                          <Ionicons name="open-outline" size={20} color="#6366f1" />
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity 
                        style={styles.actionButton}
                        onPress={() => deleteDownload(item)}
                      >
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
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  webview: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#6366f1',
    fontSize: 16,
  },
  swipeIndicator: {
    position: 'absolute',
    top: 60,
    left: 0,
    width: 24,
    height: 40,
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fabContainer: {
    position: 'absolute',
    top: 50,
    left: 0,
  },
  fab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  menuOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  menu: {
    position: 'absolute',
    top: 105,
    left: 0,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    paddingVertical: 8,
    minWidth: 200,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  menuItemWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  menuText: {
    color: '#e2e8f0',
    fontSize: 16,
    marginLeft: 12,
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#334155',
    marginVertical: 4,
  },
  badge: {
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 'auto',
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  // Estilos del modal de descargas
  downloadsModal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0f172a',
  },
  downloadsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 50,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  downloadsTitle: {
    color: '#e2e8f0',
    fontSize: 20,
    fontWeight: 'bold',
  },
  downloadsContent: {
    flex: 1,
    padding: 16,
  },
  downloadSection: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#e2e8f0',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  clearAllText: {
    color: '#ef4444',
    fontSize: 14,
  },
  downloadItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  downloadInfo: {
    flex: 1,
  },
  downloadFilename: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  downloadStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  downloadProgress: {
    color: '#6366f1',
    fontSize: 12,
    fontWeight: '600',
  },
  downloadSpeed: {
    color: '#94a3b8',
    fontSize: 12,
  },
  downloadDate: {
    color: '#94a3b8',
    fontSize: 12,
  },
  progressBarContainer: {
    height: 4,
    backgroundColor: '#334155',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#6366f1',
    borderRadius: 2,
  },
  downloadActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#64748b',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },
});