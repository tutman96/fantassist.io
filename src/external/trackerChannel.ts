import AbstractChannel, { ChannelState } from "./abstractChannel";
import { Packet, TrackerGetMarkerLocationResponse } from "@/protos/external";

const CONFIG = {
  filters: [
    {
      services: [0x12342233],
    },
    {
      namePrefix: "raspberrypi-zero", // TODO: change this to the actual name
    },
  ] as BluetoothLEScanFilter[],
  serviceUUID: 0x12342233,
  writeCharUUID: 0x12343344, // TODO: change this to the actual UUID
  readCharUUID: 0x12343345, // TODO: change this to the actual UUID
};

export class TrackerChannel extends AbstractChannel {
  private _connecting = false;
  private _device: BluetoothDevice | null = null;
  private _writeChar: BluetoothRemoteGATTCharacteristic | null = null;
  private _readChar: BluetoothRemoteGATTCharacteristic | null = null;

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
      });

      const server = await this._device.gatt?.connect();
      if (!server) {
        throw new Error("Failed to connect to GATT server");
      }
      const service = await server.getPrimaryService(CONFIG.serviceUUID);

      this._writeChar = await service.getCharacteristic(CONFIG.writeCharUUID);
      this._readChar = await service.getCharacteristic(CONFIG.readCharUUID);
      this._readChar.addEventListener("characteristicvaluechanged", async (e) => {
        const d = this._readChar?.value;
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
      await this._readChar.startNotifications();
      this.notifyConnectionStateChange();
    } catch (e) {
      this._connecting = false;
      console.warn("Failed to connect to Tracker", e);
      await this.disconnect();
    }
  }

  async disconnect() {
    if (this._device) {
      if (this._device.gatt?.connected) {
        this._device.gatt.disconnect();
      }

      this._device = null;
      this._writeChar = null;
      this._readChar = null;
    }
    this.notifyConnectionStateChange();
  }

  async sendOutgoingPacket(packet: Packet) {
    if (!this._writeChar) {
      console.warn("Failed to send packet. Tracker device is not connected");
      return;
    }

    try {
      await this._writeChar.writeValueWithoutResponse(Packet.encode(packet).finish());
    }
    catch (e) {
      console.error("Failed to send packet", e);
      await this.disconnect();
    }
  }
}
