import { useConnection } from "@/external/hooks";
import { Scene } from "@/protos/scene";
import { useEffect, useRef, useState } from "react";
import { Settings, settingsDatabase } from "..";

export function useCalibrationSceneOverride(scene: Scene | undefined) {
  const connection = useConnection();
  const overwroteFreezeSetting = useRef<boolean | null>(null);
  const [displayingCalibration, setDisplayingCalibration] = useState(false);

  // Freeze the table display while the calibration scene is active, then restore the previous setting once done
  useEffect(() => {
    if (!scene) return;

    settingsDatabase()
      .storage.getItem<boolean>(Settings.TABLE_FREEZE)
      .then((freeze) => {
        overwroteFreezeSetting.current = freeze;
        return settingsDatabase().storage.setItem(Settings.TABLE_FREEZE, true);
      })
      .then(() => {
        setDisplayingCalibration(true);
      });
    return () => {
      settingsDatabase().storage.setItem(
        Settings.TABLE_FREEZE,
        overwroteFreezeSetting.current ?? false
      );
      setDisplayingCalibration(false);
    };
  }, [scene?.id]);

  useEffect(() => {
    if (!scene || !displayingCalibration) return;

    connection.request({
      displaySceneRequest: {
        scene,
      },
    });
  }, [scene?.version, displayingCalibration]);

  return displayingCalibration;
}