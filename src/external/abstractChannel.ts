import { v4 } from "uuid";
import { Packet, Request, Response } from "../protos/external";

export enum ChannelState {
  CONNECTING = "CONNECTING",
  CONNECTED = "CONNECTED",
  DISCONNECTING = "DISCONNECTING",
  DISCONNECTED = "DISCONNECTED",
}

export type RequestHandler = (
  request: Request
) => Promise<Partial<Response> | null>;

export default abstract class AbstractChannel {
  private _responseListeners = new Map<string, (message: Packet) => void>();

  abstract get state(): ChannelState;

  abstract isSupported: boolean;
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract sendOutgoingPacket(packet: Packet): Promise<void>;

  protected connectionStateHandlers = new Array<
    (state: ChannelState) => void
  >();
  public addConnectionStateChangeHandler(
    handler: (state: ChannelState) => void
  ) {
    this.connectionStateHandlers.push(handler);
    return () => {
      this.connectionStateHandlers.splice(
        this.connectionStateHandlers.indexOf(handler),
        1
      );
    };
  }

  protected logPacket(direction: "Received" | "Sending", p: Packet) {
    if (process.env.NEXT_PUBLIC_VERCEL_ENV !== "local") return;

    const [messageType, body] = Object.entries(
      p.request ?? p.response ?? {}
    ).find(([, value]) => value !== undefined) as [string, string];
    console.debug(
      `%c ${this.constructor.name} - ${direction} ${
        p.request ? "Request" : "Response"
      } (${p.requestId})`,
      p.request ? "color: lightblue" : "color: lightgreen",
      messageType,
      body
    );
  }

  protected notifyConnectionStateChange() {
    console.debug(
      "Channel connection state changed to " + ChannelState[this.state]
    );
    for (const handler of this.connectionStateHandlers) {
      handler(this.state);
    }
  }

  protected requestHandlers = new Array<RequestHandler>(async (req) => {
    if (req.helloRequest) {
      return {
        ackResponse: {},
      };
    }
    return null;
  });
  public addRequestHandler(handler: RequestHandler) {
    this.requestHandlers.push(handler);
    return () => {
      this.requestHandlers.splice(this.requestHandlers.indexOf(handler), 1);
    };
  }

  private async handleRequest(request: Request): Promise<Response> {
    for (const handler of this.requestHandlers) {
      const response = await handler(request);
      if (response === null) continue;
      return Response.fromPartial(response);
    }
    console.warn("Got request that wasn't implemented", request);
    throw new Error("Unimplemented");
  }

  public async request(request: Partial<Request>): Promise<Response> {
    const requestId = v4();

    const responsePromise = new Promise<Packet>((res) => {
      this._responseListeners.set(requestId, res);
    });

    const packet = {
      requestId,
      request: Request.fromPartial(request),
      response: undefined,
    };
    this.logPacket("Sending", packet);
    await this.sendOutgoingPacket(packet);

    const responsePacket = await responsePromise;
    return responsePacket.response!;
  }

  protected async processIncomingPacket(packet: Packet) {
    this.logPacket("Received", packet);
    if (packet.response && this._responseListeners.has(packet.requestId)) {
      this._responseListeners.get(packet.requestId)!(packet);
      this._responseListeners.delete(packet.requestId);
    } else if (packet.request) {
      const response = await this.handleRequest(packet.request);

      const responsePacket = {
        requestId: packet.requestId,
        request: undefined,
        response,
      };
      this.logPacket("Sending", responsePacket);
      await this.sendOutgoingPacket(responsePacket);
    }
  }
}
