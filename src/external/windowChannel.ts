import { Packet } from "@/protos/external";
import AbstractChannel, { ChannelState } from "./abstractChannel";

export default class WindowChannel extends AbstractChannel {
  private _window: Window | null = null;
  private _connected = false;

  private _onDisconnectHandlers = new Array<() => void>();

  get isSupported() {
    return true;
  }

  private get isTable() {
    return window.opener !== null;
  }

  get state(): ChannelState {
    if (!this._window || this._window.closed) {
      return ChannelState.DISCONNECTED;
    }
    return this._connected ? ChannelState.CONNECTED : ChannelState.CONNECTING;
  }
  async connect() {
    if (this._window && !this.isTable) {
      this._window.focus();
      this.notifyConnectionStateChange();
      return;
    }

    this._window = this.isTable
      ? window.opener
      : window.open("/table", "fantassist-external-window", "popup");
    if (!this._window) {
      throw new Error("Failed to open window");
    }

    const messageHandler = async (event: MessageEvent) => {
      if (event.origin !== location.origin) return;
      if (event.source !== this._window) return;
      if (!(event.data instanceof ArrayBuffer)) return;

      if (!this._connected) {
        this._connected = true;
        this.notifyConnectionStateChange();
      }

      const packet = Packet.decode(new Uint8Array(event.data));
      await this.processIncomingPacket(packet);
    };

    window.addEventListener("message", messageHandler);
    this._onDisconnectHandlers.push(() => {
      window.removeEventListener("message", messageHandler);
    });

    const connectionStateReconciler = async () => {
      if (!this._window) return;
      if (this._window.closed) {
        await this.disconnect();
      }
    };
    const connectionStateInterval = setInterval(connectionStateReconciler, 100);
    this._onDisconnectHandlers.push(() =>
      clearInterval(connectionStateInterval)
    );

    if (this.isTable) {
      this.request({ helloRequest: {} });

      window.addEventListener("beforeunload", async () => {
        console.log("beforeunload");
      });
    }

    this.notifyConnectionStateChange();
  }
  async disconnect() {
    if (!this._window) {
      this.notifyConnectionStateChange();
      return;
    }
    console.trace("Disconnecting");
    if (!this.isTable) {
      this._window.close();
    }

    for (const handler of this._onDisconnectHandlers) {
      handler();
    }

    this._window = null;
    this._connected = false;

    this.notifyConnectionStateChange();
  }

  async sendOutgoingPacket(packet: Packet) {
    if (!this._window) {
      console.error("Window is not connected");
      return;
    }
    console.debug("Sending packet", packet);
    const encodedPacket = Packet.encode(packet).finish();
    const buffer = encodedPacket.buffer.slice(
      encodedPacket.byteOffset,
      encodedPacket.byteOffset + encodedPacket.byteLength
    );
    this._window.postMessage(buffer, location.origin, [buffer]);
  }
}
