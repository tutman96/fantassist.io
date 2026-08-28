export type EngineListener = () => void;

export interface EngineSnapshot<TScene> {
  readonly scene: TScene | null;
  readonly revision: number;
}

export interface SceneEngine<TScene, TCommand> {
  getSnapshot(): EngineSnapshot<TScene>;
  subscribe(listener: EngineListener): () => void;
  dispatch(command: TCommand): void;
  dispose(): void;
}
