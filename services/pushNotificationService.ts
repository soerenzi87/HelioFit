import { apiFetch } from './apiFetch';

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    console.log('[SW] Registered:', reg.scope);
    return reg;
  } catch (err) {
    console.error('[SW] Registration failed:', err);
    return null;
  }
}

export async function requestPushPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  return await Notification.requestPermission();
}

export async function subscribeToPush(userEmail: string): Promise<PushSubscription | null> {
  try {
    const permission = await requestPushPermission();
    if (permission !== 'granted') return null;

    const reg = await navigator.serviceWorker.ready;

    // Get VAPID public key from server
    const configRes = await apiFetch('/api/push/vapid-key');
    if (!configRes.ok) return null;
    const { publicKey } = await configRes.json();

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    // Send subscription to server
    await apiFetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription, email: userEmail }),
    });

    return subscription;
  } catch (err) {
    console.error('[Push] Subscribe failed:', err);
    return null;
  }
}

export async function unsubscribeFromPush(userEmail: string): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
      await apiFetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail }),
      });
    }
  } catch (err) {
    console.error('[Push] Unsubscribe failed:', err);
  }
}

export async function getSubscriptionStatus(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
