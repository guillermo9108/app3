import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  BackHandler,
  Alert,
  TouchableOpacity,
  Text,
  ActivityIndicator,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

export default function WebViewScreen() {
  const webViewRef = useRef<WebView>(null);
  const router = useRouter();
  const [serverUrl, setServerUrl] = useState('');
  const [canGoBack, setCanGoBack] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    loadServerUrl();
    
    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      handleBackPress
    );

    return () => backHandler.remove();
  }, [canGoBack]);

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

  const handleBackPress = () => {
    if (canGoBack && webViewRef.current) {
      webViewRef.current.goBack();
      return true;
    }
    return false;
  };

  const handleNavigationStateChange = (navState: any) => {
    setCanGoBack(navState.canGoBack);
  };

  const handleError = () => {
    setLoadError(true);
    Alert.alert(
      'Error de Conexión',
      'No se pudo conectar al servidor. Verifica que:\n\n• El servidor esté activo\n• Estés en la misma red\n• La URL sea correcta',
      [
        {
          text: 'Reintentar',
          onPress: () => {
            setLoadError(false);
            webViewRef.current?.reload();
          },
        },
        {
          text: 'Cambiar Configuración',
          onPress: () => router.push('/config'),
        },
      ]
    );
  };

  const handleSettings = () => {
    Alert.alert(
      'Configuración',
      '¿Qué deseas hacer?',
      [
        {
          text: 'Recargar Página',
          onPress: () => webViewRef.current?.reload(),
        },
        {
          text: 'Cambiar Servidor',
          onPress: () => router.push('/config'),
        },
        {
          text: 'Cancelar',
          style: 'cancel',
        },
      ]
    );
  };

  if (!serverUrl) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
      {/* Top Bar */}
      <View style={styles.topBar}>
        <View style={styles.topBarContent}>
          <View style={styles.logoMini}>
            <Text style={styles.logoMiniText}>SP</Text>
          </View>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={handleSettings}
          >
            <Ionicons name="settings-outline" size={24} color="#e2e8f0" />
          </TouchableOpacity>
        </View>
      </View>

      {/* WebView */}
      <WebView
        ref={webViewRef}
        source={{ uri: serverUrl }}
        style={styles.webview}
        onNavigationStateChange={handleNavigationStateChange}
        onError={handleError}
        onLoadStart={() => setIsLoading(true)}
        onLoadEnd={() => setIsLoading(false)}
        // Configuración crítica para StreamPay
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowFileAccess={true}
        mediaPlaybackRequiresUserAction={false}
        mixedContentMode="always"
        // User Agent personalizado
        userAgent="Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 StreamPayAPK/1.0"
        // Mejoras de rendimiento
        cacheEnabled={true}
        incognito={false}
        // Android specific
        androidLayerType="hardware"
        androidHardwareAccelerationDisabled={false}
      />

      {/* Loading Indicator */}
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#6366f1" />
        </View>
      )}

      {/* Error View */}
      {loadError && (
        <View style={styles.errorContainer}>
          <Ionicons name="cloud-offline-outline" size={64} color="#64748b" />
          <Text style={styles.errorTitle}>Sin Conexión</Text>
          <Text style={styles.errorText}>
            No se pudo conectar al servidor
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              setLoadError(false);
              webViewRef.current?.reload();
            }}
          >
            <Text style={styles.retryButtonText}>Reintentar</Text>
          </TouchableOpacity>
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
  topBar: {
    backgroundColor: '#0f172a',
    paddingTop: 44,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  topBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoMini: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoMiniText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  settingsButton: {
    padding: 8,
  },
  webview: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#e2e8f0',
    marginTop: 16,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 16,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});