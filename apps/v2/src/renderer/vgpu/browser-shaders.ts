import assets from "./shaders/assets.wgsl";
import particleRetimeLifetime from "../particles/wgsl/retime-lifetime.wgsl";
import particleSpawn from "../particles/wgsl/spawn.wgsl";
import particleStateUpdate from "../particles/wgsl/state-update.wgsl";
import particleSteadyStateFill from "../particles/wgsl/steady-state-fill.wgsl";
import particleSteadyStateUpdate from "../particles/wgsl/steady-state-update.wgsl";
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
import rain from "./shaders/rain.wgsl";
import rainContext from "./shaders/rain-context.wgsl";
import embers from "./shaders/embers.wgsl";
import cloud from "./shaders/cloud.wgsl";
import wallOfFire from "./shaders/wall-of-fire.wgsl";
import wallOfFireContext from "./shaders/wall-of-fire-context.wgsl";
import wallOfFireFlames from "./shaders/wall-of-fire-flames.wgsl";
import wallOfFireSparks from "./shaders/wall-of-fire-sparks.wgsl";
import sceneCopy from "./shaders/scene-copy.wgsl";

export const browserSceneShaders = {
  particleEmitter: {
    stateUpdate: particleStateUpdate,
    spawn: particleSpawn,
    steadyStateUpdate: particleSteadyStateUpdate,
    steadyStateFill: particleSteadyStateFill,
    retimeLifetime: particleRetimeLifetime,
  },
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
  rain,
  rainContext,
  embers,
  cloud,
  wallOfFire,
  wallOfFireContext,
  wallOfFireFlames,
  wallOfFireSparks,
  sceneCopy,
};
