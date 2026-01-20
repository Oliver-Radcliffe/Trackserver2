const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws';

class WebSocketClient {
  constructor() {
    this.ws = null;
    this.listeners = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.subscribedDevices = new Set();
  }

  connect(token = null) {
    return new Promise((resolve, reject) => {
      const url = token ? `${WS_URL}?token=${token}` : WS_URL;

      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;

        // Re-subscribe to devices if reconnecting
        if (this.subscribedDevices.size > 0) {
          this.subscribe([...this.subscribedDevices]);
        }

        resolve();
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket closed', event.code);
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error', error);
        reject(error);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (e) {
          console.error('Failed to parse WebSocket message', e);
        }
      };
    });
  }

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * this.reconnectAttempts;
      console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

      setTimeout(() => {
        const token = localStorage.getItem('token');
        this.connect(token).catch(() => {});
      }, delay);
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.subscribedDevices.clear();
    this.listeners.clear();
  }

  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  subscribe(deviceIds) {
    deviceIds.forEach(id => this.subscribedDevices.add(id));
    this.send({ type: 'subscribe', device_ids: deviceIds });
  }

  unsubscribe(deviceIds) {
    deviceIds.forEach(id => this.subscribedDevices.delete(id));
    this.send({ type: 'unsubscribe', device_ids: deviceIds });
  }

  handleMessage(data) {
    const { type } = data;
    const callbacks = this.listeners.get(type) || [];
    callbacks.forEach(cb => cb(data));
  }

  on(type, callback) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(type);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    };
  }

  off(type, callback) {
    const callbacks = this.listeners.get(type);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }
}

export const wsClient = new WebSocketClient();
export default wsClient;
