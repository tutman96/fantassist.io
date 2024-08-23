import { Scene } from "@/protos/scene";
import { createContext, useContext } from "react";

const SceneContext = createContext<Scene | null>(null);

export function useScene() {
  return useContext(SceneContext);
}

export const SceneProvider: React.FunctionComponent<
  React.PropsWithChildren & { scene: Scene }
> = ({ children, scene }) => {
  return (
    <SceneContext.Provider value={scene}>{children}</SceneContext.Provider>
  );
};
