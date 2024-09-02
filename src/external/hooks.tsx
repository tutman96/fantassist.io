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

const init = new MultiChannel();
const DisplayChannelContext = createContext<MultiChannel | null>(init);

export const DisplayChannelContextProvider: React.FC<
  PropsWithChildren & { autoSelect?: boolean }
> = ({ children, autoSelect }) => {
  const [displayPreference] = useDisplayPreference();

  useEffect(() => {
    if (!autoSelect && !init.hasCurrentChannel) {
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

export function useConnectionState() {
  const connection = useConnection() as MultiChannel | null;
  const [state, setState] = useState(connection?.state);

  useEffect(() => {
    return connection?.addConnectionStateChangeHandler(() => {
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
