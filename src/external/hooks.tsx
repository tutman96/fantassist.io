import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Request, Response } from "../protos/external";
import MultiChannel from "./multiChannel";
import { useDisplayPreference } from "@/app/settings";
import AbstractChannel from "./abstractChannel";

const init = new MultiChannel();
const DisplayChannelContext = createContext<MultiChannel | null>(init);

export const DisplayChannelContextProvider: React.FC<
  PropsWithChildren & { autoSelect?: boolean }
> = ({ children, autoSelect }) => {
  const [displayPreference] = useDisplayPreference();

  useEffect(() => {
    if (!autoSelect) {
      const channelPreference = displayPreference ?? init.supportedChannels[0];
      if (channelPreference) {
        init.useChannel(channelPreference);
      } else {
        console.warn("No supported display channels available");
      }
    }
  }, [autoSelect, displayPreference]);

  return (
    <DisplayChannelContext.Provider value={init}>
      {children}
    </DisplayChannelContext.Provider>
  );
};

export function useConnection(): MultiChannel {
  return useContext(DisplayChannelContext)!;
}

export function useConnectionState(connection?: AbstractChannel) {
  const contextConnection = useConnection() as AbstractChannel | null;
  const ctx = connection ?? contextConnection;
  const [state, setState] = useState(ctx?.state);

  useEffect(() => {
    return ctx?.addConnectionStateChangeHandler(() => {
      setState(ctx.state);
    });
  }, [ctx]);

  return state;
}

export function useRequestHandler(
  handler: (request: Request) => Promise<Partial<Response> | null>,
  connection?: AbstractChannel
) {
  const contextConnection = useConnection();
  const ctx = connection ?? contextConnection;

  useEffect(() => {
    return ctx.addRequestHandler(handler);
  }, [ctx, handler]);
}
