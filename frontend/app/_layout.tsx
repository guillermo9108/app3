import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import * as Notifications from 'expo-notifications';
import { 
  registerBackgroundFetch, 
  setupNotificationChannel,
  triggerImmediateCheck 
} from '../src/services/NotificationService';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Configurar handler de notificaciones
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    priority: Notifications.AndroidNotificationPriority.HIGH,
  }),
});

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  // Inicializar sistema de notificaciones
  useEffect(() => {
    const initializeNotifications = async () => {
      try {
        // Configurar canal de notificaciones (Android)
        await setupNotificationChannel();
        
        // Registrar background fetch
        await registerBackgroundFetch();
        
        // Verificar notificaciones al iniciar
        await triggerImmediateCheck();
        
        console.log('[StreamPay] Sistema de notificaciones inicializado');
      } catch (error) {
        console.error('[StreamPay] Error inicializando notificaciones:', error);
      }
    };

    initializeNotifications();
  }, []);

  // Listener para cuando se toca una notificación
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      
      if (data?.type === 'server-notification' && data?.link) {
        console.log('[StreamPay] Notificación tocada, link:', data.link);
        // El link se manejará en webview.tsx
        // Puedes usar un estado global o AsyncStorage para pasar el link
      }
    });

    return () => subscription.remove();
  }, []);

  if (!loaded) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="config" options={{ headerShown: false }} />
        <Stack.Screen name="webview" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}