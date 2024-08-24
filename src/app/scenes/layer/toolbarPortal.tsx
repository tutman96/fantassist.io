import React, {
  useRef,
  useContext,
  createContext,
  useEffect,
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
    const currentRoot = rootRef.current;

    return () => {
      if (currentRoot) {
        currentRoot.unmount();
        rootRef.current = null;
      }
    };
  }, [node]);

  return (
    <>
      <Toolbar>
        <span ref={node as any} />
      </Toolbar>
      <ToolbarContext.Provider
        value={rootRef.current?.render.bind(rootRef.current) ?? null}
      >
        {children}
      </ToolbarContext.Provider>
    </>
  );
};
