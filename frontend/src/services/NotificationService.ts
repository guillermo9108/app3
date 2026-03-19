
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Constantes
export const BACKGROUND_NOTIFICATION_TASK = 'background-notification-check';
export const STORAGE_KEYS = {
  SERVER_URL: 'SERVER_URL',
  SESSION_TOKEN: 'sp_session_token',
  LAST_NOTIFICATION_COUNT: 'last_notification_count',
  LAST_NOTIFICATION_IDS: 'last_notification_ids',
};

// Interfaces
interface UnreadCountResponse {
  success: boolean;
  data?: {
    count: number;
  };
}

interface NotificationItem {
  id: string;
  text: string;
  link: string;
  type?: string;
  created_at?: string;
  is_read?: boolean;
}

interface UnreadNotificationsResponse {
  success: boolean;
  data?: NotificationItem[];
}

// Definir la tarea de background
TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async () => {
  try {
    console.log('[StreamPay] Background fetch ejecutándose...');
    
    const result = await checkForNewNotifications();
    
    if (result.hasNewNotifications) {
      console.log('[StreamPay] Nuevas notificaciones encontradas:', result.count);
      return BackgroundFetch.BackgroundFetchResult.NewData;
    }
    
    return BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (error) {
    console.error('[StreamPay] Error en background fetch:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// Función principal para verificar notificaciones
export async function checkForNewNotifications(): Promise<{ hasNewNotifications: boolean; count: number }> {
  try {
    const serverUrl = await AsyncStorage.getItem(STORAGE_KEYS.SERVER_URL);
    const sessionToken = await AsyncStorage.getItem(STORAGE_KEYS.SESSION_TOKEN);

    if (!serverUrl || !sessionToken) {
      console.log('[StreamPay] URL o token no disponibles');
      return { hasNewNotifications: false, count: 0 };
    }

    // Paso 1: Obtener conteo de notificaciones no leídas
    const countResponse = await fetchUnreadCount(serverUrl, sessionToken);
    
    if (!countResponse?.success) {
      console.log('[StreamPay] Error obteniendo conteo');
      return { hasNewNotifications: false, count: 0 };
    }

    const currentCount = countResponse.data?.count || 0;
    const lastCountStr = await AsyncStorage.getItem(STORAGE_KEYS.LAST_NOTIFICATION_COUNT);
    const lastCount = lastCountStr ? parseInt(lastCountStr, 10) : 0;

    console.log(`[StreamPay] Conteo anterior: ${lastCount}, actual: ${currentCount}`);

    // Paso 2: Si hay nuevas notificaciones, obtener detalles
    if (currentCount > lastCount) {
      const notificationsResponse = await fetchUnreadNotifications(serverUrl, sessionToken);
      
      if (notificationsResponse?.success && notificationsResponse.data) {
        const lastIdsStr = await AsyncStorage.getItem(STORAGE_KEYS.LAST_NOTIFICATION_IDS);
        const lastIds: string[] = lastIdsStr ? JSON.parse(lastIdsStr) : [];
        
        const newNotifications = notificationsResponse.data.filter(
          (n) => !lastIds.includes(n.id)
        );

        // Mostrar notificaciones nuevas
        for (const notification of newNotifications) {
          await showLocalNotification(notification);
        }

        // Guardar IDs procesados
        const allIds = notificationsResponse.data.map((n) => n.id);
        await AsyncStorage.setItem(
          STORAGE_KEYS.LAST_NOTIFICATION_IDS,
          JSON.stringify(allIds.slice(-100))
        );
      }
    }

    // Actualizar contador
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_NOTIFICATION_COUNT, currentCount.toString());

    return { hasNewNotifications: currentCount > lastCount, count: currentCount };
  } catch (error) {
    console.error('[StreamPay] Error verificando notificaciones:', error);
    return { hasNewNotifications: false, count: 0 };
  }
}

// Fetch del conteo de notificaciones
async function fetchUnreadCount(serverUrl: string, token: string): Promise<UnreadCountResponse | null> {
  try {
    const url = `${serverUrl}/api/index.php?action=get_unread_count`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });

    if (response.ok) {
      return await response.json();
    }
    
    console.error('[StreamPay] Error HTTP en get_unread_count:', response.status);
    return null;
  } catch (error) {
    console.error('[StreamPay] Excepción en fetchUnreadCount:', error);
    return null;
  }
}

// Fetch de notificaciones detalladas
async function fetchUnreadNotifications(serverUrl: string, token: string): Promise<UnreadNotificationsResponse | null> {
  try {
    const url = `${serverUrl}/api/index.php?action=get_unread_notifications`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });

    if (response.ok) {
      return await response.json();
    }
    
    console.error('[StreamPay] Error HTTP en get_unread_notifications:', response.status);
    return null;
  } catch (error) {
    console.error('[StreamPay] Excepción en fetchUnreadNotifications:', error);
    return null;
  }
}

// Mostrar notificación local
async function showLocalNotification(notification: NotificationItem): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Nueva notificación en StreamPay',
        body: notification.text,
        data: {
          type: 'server-notification',
          id: notification.id,
          link: notification.link,
        },
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: null,
      identifier: `server-notif-${notification.id}`,
    });
    
    console.log('[StreamPay] Notificación mostrada:', notification.text);
  } catch (error) {
    console.error('[StreamPay] Error mostrando notificación:', error);
  }
}

// Registrar el background fetch
export async function registerBackgroundFetch(): Promise<boolean> {
  try {
    const status = await BackgroundFetch.getStatusAsync();
    
    if (status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
        status === BackgroundFetch.BackgroundFetchStatus.Denied) {
      console.log('[StreamPay] Background fetch no disponible:', status);
      return false;
    }

    // Verificar si ya está registrado
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_NOTIFICATION_TASK);
    
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK, {
        minimumInterval: 15 * 60, // 15 minutos (mínimo permitido)
        stopOnTerminate: false,
        startOnBoot: true,
      });
      console.log('[StreamPay] Background fetch registrado');
    } else {
      console.log('[StreamPay] Background fetch ya estaba registrado');
    }
    
    return true;
  } catch (error) {
    console.error('[StreamPay] Error registrando background fetch:', error);
    return false;
  }
}

// Desregistrar el background fetch
export async function unregisterBackgroundFetch(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_NOTIFICATION_TASK);
    
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_NOTIFICATION_TASK);
      console.log('[StreamPay] Background fetch desregistrado');
    }
  } catch (error) {
    console.error('[StreamPay] Error desregistrando background fetch:', error);
  }
}

// Disparar verificación inmediata
export async function triggerImmediateCheck(): Promise<void> {
  try {
    await checkForNewNotifications();
  } catch (error) {
    console.error('[StreamPay] Error en verificación inmediata:', error);
  }
}

// Guardar token de sesión
export async function saveSessionToken(token: string): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.SESSION_TOKEN, token);
    console.log('[StreamPay] Token de sesión guardado');
    
    // Disparar verificación después de guardar el token
    setTimeout(() => triggerImmediateCheck(), 1000);
  } catch (error) {
    console.error('[StreamPay] Error guardando token:', error);
  }
}

// Limpiar contador de notificaciones
export async function clearNotificationCount(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_NOTIFICATION_COUNT, '0');
  } catch (error) {
    console.error('[StreamPay] Error limpiando contador:', error);
  }
}

// Configurar canal de notificaciones (Android)
export async function setupNotificationChannel(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('server-notifications', {
      name: 'Notificaciones del Servidor',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#6366f1',
      enableVibrate: true,
      showBadge: true,
      sound: 'default',
    });
  }
}