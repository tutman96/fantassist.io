import React, {
  useRef,
  useContext,
  createContext,
  useEffect,
  useMemo,
} from "react";

import { ThemeProvider } from "@mui/system";
import theme from "@/theme";
import { createRoot, Root } from "react-dom/client";

import Box from "@mui/material/Box";

const LayerListTopperContext = createContext<Root["render"] | null>(null);

const LayerListTopperPortal: React.FunctionComponent<
  React.PropsWithChildren
> = ({ children }) => {
  const render = useContext(LayerListTopperContext);

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
export default LayerListTopperPortal;

export const LayerListTopperProvider: React.FunctionComponent<
  React.PropsWithChildren & { layerList: React.ReactNode }
> = ({ children, layerList }) => {
  const node = useRef<HTMLDivElement>();
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
  }, []);

  return (
    <>
      <LayerListTopperContext.Provider value={render}>
        {children}
      </LayerListTopperContext.Provider>
      <Box
        sx={{
          position: "absolute",
          width: theme.spacing(38),
          right: theme.spacing(2),
          bottom: theme.spacing(2),
          top: theme.spacing(35),
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          pointerEvents: "none",
        }}
      >
        <Box
          sx={{ marginBottom: theme.spacing(1), flexShrink: 2, minHeight: 120 }}
          ref={node as any}
        />
        <Box sx={{ flexShrink: 3, flexGrow: 1, maxHeight: 120 }} />
        {layerList}
      </Box>
    </>
  );
};
