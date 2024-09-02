import AbstractChannel, { ChannelState } from "./abstractChannel";
import { Packet } from "@/protos/external";

const CONFIG = {
  filters: [
    {
      services: [0x12342233],
    },
    {
      namePrefix: "table-camera", // TODO: change this to the actual name
    },
  ] as BluetoothLEScanFilter[],
  serviceUUID: 0x12342233,
  charUUID: 0x12343344, // TODO: change this to the actual UUID
};

export class TrackerChannel extends AbstractChannel {
  private _connecting = false;
  private _device: BluetoothDevice | null = null;
  private _char: BluetoothRemoteGATTCharacteristic | null = null;

  get state(): ChannelState {
    if (this._connecting) {
      return ChannelState.CONNECTING;
    }
    if (!this._device) {
      return ChannelState.DISCONNECTED;
    }
    return this._device?.gatt?.connected
      ? ChannelState.CONNECTED
      : ChannelState.CONNECTING;
  }

  get isSupported() {
    return typeof navigator.bluetooth !== "undefined";
  }

  async connect() {
    try {
      this._connecting = true;
      this.notifyConnectionStateChange();

      this._device = await navigator.bluetooth.requestDevice({
        filters: CONFIG.filters,
        optionalServices: [CONFIG.serviceUUID],
      });
      this._connecting = false;
      this.notifyConnectionStateChange();

      this._device.addEventListener("gattserverdisconnected", async () => {
        await this.disconnect();
        this.notifyConnectionStateChange();
      });

      const server = await this._device.gatt?.connect();
      if (!server) {
        throw new Error("Failed to connect to GATT server");
      }
      const service = await server.getPrimaryService(CONFIG.serviceUUID);

      this._char = await service.getCharacteristic(CONFIG.charUUID);
      this._char.startNotifications();
      this._char.addEventListener("characteristicvaluechanged", async (e) => {
        const d = this._char?.value;
        if (!d) {
          return;
        }

        try {
          await this.processIncomingPacket(
            Packet.decode(new Uint8Array(d.buffer))
          );
        } catch (e) {
          console.warn("Failed to process incoming packet", e);
        }
      });
      this.notifyConnectionStateChange();
    } catch (e) {
      console.warn("Failed to connect to Tracker", e);
      this._connecting = false;
      this._device = null;
      this._char = null;
      this.notifyConnectionStateChange();
    }
  }

  async disconnect() {
    if (this._device) {
      if (this._device.gatt?.connected) {
        this._device.gatt.disconnect();
      }

      this._device = null;
      this._char = null;
    }
    this.notifyConnectionStateChange();
  }

  async sendOutgoingPacket(packet: Packet) {
    if (!this._char) {
      throw new Error("No device connected");
    }

    await this._char.writeValueWithoutResponse(Packet.encode(packet).finish());
  }
}
