import assets from "./shaders/assets.wgsl";
import composite from "./shaders/composite.wgsl";
import fogMask from "./shaders/fog-mask.wgsl";
import fogComposite from "./shaders/fog-composite.wgsl";
import fogGuide from "./shaders/fog-guide.wgsl";
import present from "./shaders/present.wgsl";

export const browserSceneShaders = {
  assets,
  composite,
  fogMask,
  fogComposite,
  fogGuide,
  present,
};
