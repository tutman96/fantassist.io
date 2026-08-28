import assets from "./shaders/assets.wgsl";
import composite from "./shaders/composite.wgsl";
import fogMask from "./shaders/fog-mask.wgsl";
import lightAccumulation from "./shaders/light-accumulation.wgsl";
import obstructionShadows from "./shaders/obstruction-shadows.wgsl";
import present from "./shaders/present.wgsl";

export const browserSceneShaders = {
  assets,
  composite,
  fogMask,
  lightAccumulation,
  obstructionShadows,
  present,
};
