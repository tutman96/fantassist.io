import assets from "./shaders/assets.wgsl";
import composite from "./shaders/composite.wgsl";
import fogMask from "./shaders/fog-mask.wgsl";
import fogComposite from "./shaders/fog-composite.wgsl";
import fogFeather from "./shaders/fog-feather.wgsl";
import fogGuide from "./shaders/fog-guide.wgsl";
import fogHandle from "./shaders/fog-handle.wgsl";
import present from "./shaders/present.wgsl";
import sceneCopy from "./shaders/scene-copy.wgsl";

export const browserSceneShaders = {
  assets,
  composite,
  fogMask,
  fogComposite,
  fogFeather,
  fogGuide,
  fogHandle,
  present,
  sceneCopy,
};
