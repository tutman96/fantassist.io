"use client";
import { DisplayChannelContextProvider } from "@/external/hooks";
import { PropsWithChildren, useEffect } from "react";

const Layout: React.FC<PropsWithChildren> = ({ children }) => {
  useEffect(() => {
    document.body.style.background = "black";
  })
  return (
    <DisplayChannelContextProvider autoSelect>
      {children}
    </DisplayChannelContextProvider>
  );
};
export default Layout;
