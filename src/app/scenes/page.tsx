'use client';
import { useRouter } from "next/navigation";
import { createNewScene, sceneDatabase } from ".";
import { Settings, settingsDatabase } from "../settings";
import { useEffect } from "react";

const {useAllValues: useAllScenes, createItem} = sceneDatabase();
const {useOneValue: useOneSettingValue} = settingsDatabase();

const Scenes: React.FunctionComponent = () => {
  const router = useRouter();
  const [displayedScene] = useOneSettingValue<string>(Settings.DISPLAYED_SCENE);
  const allScenes = useAllScenes();

  useEffect(() => {
    if (displayedScene === undefined || allScenes === undefined) {
      return;
    }

    if (displayedScene) {
      router.push(`/scenes/${displayedScene}`);
    } else if (allScenes.size > 0) {
      const firstScene = Array.from(allScenes.values()).pop()!;
      router.push(`/scenes/${firstScene.id}`);
    } else {
      const newScene = createNewScene();
      newScene.name = 'Scene 1';
      createItem(newScene.id, newScene);
      router.push(`/scenes/${newScene.id}`);
    }
  }, [displayedScene, allScenes, router]);

  return null;
}
export default Scenes;