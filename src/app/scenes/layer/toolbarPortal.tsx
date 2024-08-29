import React, {
  useRef,
  useContext,
  createContext,
  useEffect,
  useMemo,
} from "react";

import Toolbar from "./toolbar";
import { ThemeProvider } from "@mui/system";
import theme from "@/theme";
import { createRoot, Root } from "react-dom/client";

const ToolbarContext = createContext<Root["render"] | null>(null);

const ToolbarPortal: React.FunctionComponent<React.PropsWithChildren> = ({
  children,
}) => {
  const render = useContext(ToolbarContext);

  useEffect(() => {
    if (render) {
      render(<ThemeProvider theme={theme}>{children}</ThemeProvider>);
      return () => {
        render(null);
      };
    }
  }, [render, children]);

  return null;
};
export default ToolbarPortal;

export const ToolbarPortalProvider: React.FunctionComponent<
  React.PropsWithChildren
> = ({ children }) => {
  const node = useRef<HTMLSpanElement>();
  const rootRef = useRef<Root | null>(null);

  useEffect(() => {
    if (node.current && !rootRef.current) {
      rootRef.current = createRoot(node.current);
    }
  }, [node]);

  const render = useMemo(() => {
    return (children: React.ReactNode) => {
      if (rootRef.current) {
        try {
          rootRef.current.render(children);
        } catch (e) {
          // no-op - this happens when the page is navigated away and the provider is unmounted
        }
      }
    };
  }, [rootRef.current]);

  return (
    <>
      <Toolbar>
        <span ref={node as any} />
      </Toolbar>
      <ToolbarContext.Provider value={render}>
        {children}
      </ToolbarContext.Provider>
    </>
  );
};
