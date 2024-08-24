import {useEffect, useState} from 'react';
import {Request, Response} from '../protos/external';
import AbstractChannel from './abstractChannel';
import PresentationApiChannel from './presentationApiChannel';

const init = new PresentationApiChannel();
export function useConnection(): AbstractChannel {
  return init;
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
