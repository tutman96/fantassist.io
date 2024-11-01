import globalStorage from "../../storage";

export enum Settings {
  DISPLAYED_SCENE = "displayed_scene",
  TABLE_FREEZE = "table_freeze",
  TABLE_RESOLUTION = "table_resolution",
  TABLE_SIZE = "table_size",
  PLAY_AUDIO_ON_TABLE = "play_audio_on_table",
  LAST_CAMPAIGN = "last_campaign",
  DISPLAY_PREFERENCE = "display_preference",
}

const storage = globalStorage<unknown>("settings");
export function settingsDatabase() {
  return storage;
}

export const { useOneValue: useOneSettingValue } = settingsDatabase();

type TableResolution = { width: number; height: number };
export function useTableResolution(): [
  TableResolution | undefined,
  (newValue: TableResolution) => Promise<void>
] {
  const [tableResolution, setTableResolution] =
    useOneSettingValue<TableResolution>(Settings.TABLE_RESOLUTION);

  if (tableResolution === null) {
    return [{ width: 3840, height: 2160 }, setTableResolution];
  }

  return [tableResolution, setTableResolution];
}

export function useTableSize(): [
  number | undefined,
  (newValue: number) => Promise<void>
] {
  const [tableSize, setTableSize] = useOneSettingValue<number>(
    Settings.TABLE_SIZE
  );

  if (tableSize === null) {
    return [45, setTableSize];
  }

  return [tableSize, setTableSize];
}

export function useTableDimensions() {
  const [size] = useTableSize();
  const [resolution] = useTableResolution();

  if (!resolution || !size) {
    return undefined;
  }

  const theta = Math.atan(resolution.height / resolution.width);
  const widthInch = size * Math.cos(theta);
  const heightInch = size * Math.sin(theta);

  return {
    width: widthInch,
    height: heightInch,
  };
}

export async function tablePPI() {
  let [resolution, size] = await Promise.all([
    storage.storage.getItem<{ width: number; height: number }>(
      Settings.TABLE_RESOLUTION
    ),
    storage.storage.getItem<number>(Settings.TABLE_SIZE),
  ]);

  if (!resolution || !size) {
    resolution = { width: 3840, height: 2160 };
  }
  if (!size) {
    size = 45;
  }

  const theta = Math.atan(resolution.height / resolution.width);
  const widthInch = size * Math.cos(theta);
  // const heightInch = tableSize * Math.sin(theta);

  const ppi = resolution.width / widthInch;
  return ppi;
}

export function useTablePPI(): number | null {
  const [resolution] = useTableResolution();
  const tableDimensions = useTableDimensions();

  if (!resolution || !tableDimensions) {
    return null;
  }

  const ppi = resolution.width / tableDimensions.width;
  return ppi;
}

export type DisplayTypes = "window" | "presentationApi";
export function useDisplayPreference() {
  return useOneSettingValue<DisplayTypes>(Settings.DISPLAY_PREFERENCE);
}
