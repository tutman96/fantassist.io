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

const DisplayChannelContext = createContext<MultiChannel | null>(null);

export const DisplayChannelContextProvider: React.FC<
  PropsWithChildren & { autoSelect?: boolean }
> = ({ children, autoSelect }) => {
  const [displayPreference] = useDisplayPreference();
  const init = useRef<MultiChannel | null>();

  useEffect(() => {
    if (!init.current) {
      init.current = new MultiChannel();
    }

    if (!autoSelect) {
      const channelPreference = displayPreference ?? init.current.supportedChannels[0];
      if (channelPreference) {
        init.current.useChannel(channelPreference);
      } else {
        console.warn("No supported display channels available");
      }
    }
  }, [autoSelect, displayPreference]);

  if (!init.current) {
    return null;
  }

  return (
    <DisplayChannelContext.Provider value={init.current}>
      {children}
    </DisplayChannelContext.Provider>
  );
};

export function useConnection(): MultiChannel {
  return useContext(DisplayChannelContext)!;
}

export function useConnectionState() {
  const connection = useConnection();
  const [state, setState] = useState(connection.state);

  useEffect(() => {
    return connection.addConnectionStateChangeHandler(() => {
      setState(connection.state);
    });
  }, [connection]);

  return state;
}

export function useRequestHandler(
  handler: (request: Request) => Promise<Partial<Response> | null>
) {
  const connection = useConnection();

  useEffect(() => {
    return connection.addRequestHandler(handler);
  }, [connection, handler]);
}
