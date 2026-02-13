import { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';

export default function SplashScreen() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    checkConfiguration();
  }, []);

  const checkConfiguration = async () => {
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const serverUrl = await AsyncStorage.getItem('SERVER_URL');
      
      if (serverUrl) {
        router.replace('/webview');
      } else {
        router.replace('/config');
      }
    } catch (error) {
      console.error('Error checking configuration:', error);
      router.replace('/config');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
      <View style={styles.logoContainer}>
        <View style={styles.logo}>
          <Text style={styles.logoText}>SP</Text>
        </View>
      </View>
      
      <Text style={styles.title}>StreamPay</Text>
      <Text style={styles.subtitle}>Tu plataforma de streaming</Text>
      
      {isChecking && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6366f1" />
          <Text style={styles.loadingText}>Verificando configuración...</Text>
        </View>
      )}
      
      <Text style={styles.version}>v3.0</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  logoContainer: {
    marginBottom: 24,
  },
  logo: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
  },
  logoText: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#94a3b8',
    marginBottom: 48,
  },
  loadingContainer: {
    alignItems: 'center',
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 14,
    marginTop: 16,
  },
  version: {
    position: 'absolute',
    bottom: 32,
    color: '#64748b',
    fontSize: 14,
  },
});