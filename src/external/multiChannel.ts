import { Packet, Request } from "@/protos/external";
import AbstractChannel, {
  ChannelState,
  RequestHandler,
} from "./abstractChannel";
import WindowChannel from "./windowChannel";
import PresentationApiChannel from "./presentationApiChannel";
import { TrackerChannel } from "./trackerChannel";

const CHANNEL_PREFERENCES = ["presentationApi", "window"] as const;

declare global {
  var _channel: MultiChannel;
}

export default class MultiChannel extends AbstractChannel {
  private _channels = {
    window: new WindowChannel(),
    presentationApi: new PresentationApiChannel(),
  };
  private currentChannel: AbstractChannel | null = null;

  get hasCurrentChannel() {
    return this.currentChannel !== null;
  }

  get state(): ChannelState {
    if (this.currentChannel) {
      return this.currentChannel.state;
    }
    return ChannelState.DISCONNECTED;
  }

  get isSupported() {
    return true;
  }

  get supportedChannels() {
    const supportedChannels = new Array<keyof typeof this._channels>();
    for (const [key, channel] of Object.entries(this._channels)) {
      if (channel.isSupported) {
        supportedChannels.push(key as keyof typeof this._channels);
      }
    }
    return supportedChannels.sort((a, b) => {
      return CHANNEL_PREFERENCES.indexOf(a) - CHANNEL_PREFERENCES.indexOf(b);
    });
  }

  public readonly trackerChannel = new TrackerChannel();

  constructor() {
    super();
    if (globalThis._channel) {
      console.warn("Existing MultiChannel instance found, overwriting");
      globalThis._channel.disconnect();
      if (globalThis._channel.trackerChannel.state !== ChannelState.DISCONNECTED) {
        globalThis._channel.trackerChannel.disconnect();
      }
    }
    globalThis._channel = this;

    if (this._channels.window.isSupported && window.opener) {
      this.useChannel("window");
    } else if (this._channels.presentationApi.isSupported && navigator.presentation.receiver) {
      this.useChannel("presentationApi");
    }
  }

  async useChannel(type: keyof typeof this._channels) {
    if (this.currentChannel && this.currentChannel !== this._channels[type]) {
      await this.currentChannel.disconnect();
    }

    this.currentChannel = this._channels[type]!;
  }

  async connect() {
    if (this.currentChannel) {
      return await this.currentChannel.connect();
    }
    throw new Error("No channel selected");
  }

  async disconnect() {
    if (this.currentChannel) {
      return await this.currentChannel.disconnect();
    }
    // No-op
  }

  async sendOutgoingPacket(packet: Packet) {
    if (this.currentChannel) {
      return await this.currentChannel.sendOutgoingPacket(packet);
    }
    throw new Error("No channel selected");
  }

  override async request(request: Partial<Request>) {
    if (this.currentChannel) {
      return await this.currentChannel.request(request);
    }
    throw new Error("No channel selected");
  }

  override addConnectionStateChangeHandler(
    handler: (state: ChannelState) => void
  ) {
    let handlers = new Array<() => void>();
    for (const channel of Object.values(this._channels)) {
      handlers.push(channel.addConnectionStateChangeHandler(handler));
    }
    return () => {
      for (const removeHandler of handlers) {
        removeHandler();
      }
    };
  }

  override addRequestHandler(handler: RequestHandler) {
    let handlers = new Array<() => void>();
    for (const channel of Object.values(this._channels)) {
      handlers.push(channel.addRequestHandler(handler));
    }
    return () => {
      for (const removeHandler of handlers) {
        removeHandler();
      }
    };
  }
}
