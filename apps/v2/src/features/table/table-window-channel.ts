export const TABLE_WINDOW_CHANNEL = "fantassist-table-window";
export const TABLE_WINDOW_NAME = "fantassist-table";

export interface TableWindowBounds {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface TableWindowFocusCommand {
  readonly route: "/table?fullscreen=auto" | "/table?mode=window";
  readonly bounds?: TableWindowBounds;
}

type TableWindowMessage =
  | { readonly type: "presence" }
  | { readonly type: "request-presence" }
  | ({ readonly type: "focus" } & TableWindowFocusCommand);

export interface TableWindowChannel {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: unknown): void;
  close(): void;
}

export type TableWindowChannelFactory = (name: string) => TableWindowChannel;

export function hostTableWindow(
  handleFocus: (command: TableWindowFocusCommand) => void,
  createChannel: TableWindowChannelFactory = (name) => new BroadcastChannel(name)
) {
  const channel = createChannel(TABLE_WINDOW_CHANNEL);
  let closed = false;
  const announce = () => {
    if (!closed) channel.postMessage({ type: "presence" } satisfies TableWindowMessage);
  };
  channel.onmessage = (event) => {
    const message = event.data as Partial<TableWindowMessage>;
    if (message.type === "request-presence") announce();
    else if (message.type === "focus" && isTableRoute(message.route)) {
      handleFocus({
        route: message.route,
        ...(isBounds(message.bounds) ? { bounds: message.bounds } : {}),
      });
      announce();
    }
  };
  queueMicrotask(announce);
  return {
    announce,
    close() {
      closed = true;
      channel.close();
    },
  };
}

export function observeTableWindow(
  onPresence: () => void,
  createChannel: TableWindowChannelFactory = (name) => new BroadcastChannel(name)
) {
  const channel = createChannel(TABLE_WINDOW_CHANNEL);
  let closed = false;
  channel.onmessage = (event) => {
    const message = event.data as Partial<TableWindowMessage>;
    if (message.type === "presence") onPresence();
  };
  queueMicrotask(() => {
    if (!closed) channel.postMessage({ type: "request-presence" } satisfies TableWindowMessage);
  });
  return {
    focus(command: TableWindowFocusCommand) {
      if (!closed) channel.postMessage({ type: "focus", ...command } satisfies TableWindowMessage);
    },
    close() {
      closed = true;
      channel.close();
    },
  };
}

function isTableRoute(value: unknown): value is TableWindowFocusCommand["route"] {
  return value === "/table?fullscreen=auto" || value === "/table?mode=window";
}

function isBounds(value: unknown): value is TableWindowBounds {
  if (!value || typeof value !== "object") return false;
  const bounds = value as Partial<TableWindowBounds>;
  return [bounds.left, bounds.top, bounds.width, bounds.height].every(Number.isFinite) &&
    (bounds.width ?? 0) > 0 && (bounds.height ?? 0) > 0;
}
