import assets from "./shaders/assets.wgsl";
import composite from "./shaders/composite.wgsl";
import fogMask from "./shaders/fog-mask.wgsl";
import fogComposite from "./shaders/fog-composite.wgsl";
import fogFeather from "./shaders/fog-feather.wgsl";
import fogGuide from "./shaders/fog-guide.wgsl";
import fogHandle from "./shaders/fog-handle.wgsl";
import lightAccumulation from "./shaders/light-accumulation.wgsl";
import lightGuide from "./shaders/light-guide.wgsl";
import present from "./shaders/present.wgsl";
import radianceCascade from "./shaders/radiance-cascade.wgsl";
import radianceResolve from "./shaders/radiance-resolve.wgsl";
import sceneCopy from "./shaders/scene-copy.wgsl";

export const browserSceneShaders = {
  assets,
  composite,
  fogMask,
  fogComposite,
  fogFeather,
  fogGuide,
  fogHandle,
  lightAccumulation,
  lightGuide,
  present,
  radianceCascade,
  radianceResolve,
  sceneCopy,
};
