export interface SerializedExecutorAdapter<Snapshot, View> {
  resourcesCurrent(snapshot: Snapshot): boolean;
  synchronizeResources(snapshot: Snapshot, isCurrent: () => boolean): Promise<boolean>;
  resize(size: readonly [number, number]): void;
  setView(view: View): void;
  setGridVisible(visible: boolean): void;
  setTableEditing(editing: boolean): void;
  setSnapshot(snapshot: Snapshot): void;
  render(time: number): Promise<void>;
}

export class SerializedExecutorScheduler<Snapshot, View> {
  private desiredSnapshot: Snapshot;
  private desiredView: View;
  private desiredGridVisible: boolean;
  private desiredTableEditing: boolean;
  private snapshotRevision = 0;
  private viewRevision = 0;
  private gridRevision = 0;
  private tableEditingRevision = 0;
  private resizeRevision = 0;
  private appliedSnapshotRevision = 0;
  private appliedViewRevision = 0;
  private appliedGridRevision = 0;
  private appliedTableEditingRevision = 0;
  private appliedResizeRevision = 0;
  private desiredResize: readonly [number, number] | undefined;
  private pendingRenderTime: number | undefined;
  private lastRenderTime = Number.NEGATIVE_INFINITY;
  private scheduled = false;
  private running = false;
  private disposed = false;
  private waiters: (() => void)[] = [];

  constructor(
    private readonly adapter: SerializedExecutorAdapter<Snapshot, View>,
    initial: { readonly snapshot: Snapshot; readonly view: View; readonly gridVisible: boolean; readonly tableEditing: boolean },
    private readonly onError: (error: unknown) => void,
  ) {
    this.desiredSnapshot = initial.snapshot;
    this.desiredView = initial.view;
    this.desiredGridVisible = initial.gridVisible;
    this.desiredTableEditing = initial.tableEditing;
  }

  setSnapshot(snapshot: Snapshot): void {
    if (this.disposed) return;
    this.desiredSnapshot = snapshot;
    this.snapshotRevision++;
    this.schedule();
  }

  setView(view: View): void {
    if (this.disposed) return;
    this.desiredView = view;
    this.viewRevision++;
    this.schedule();
  }

  setGridVisible(visible: boolean): void {
    if (this.disposed) return;
    this.desiredGridVisible = visible;
    this.gridRevision++;
    this.schedule();
  }

  setTableEditing(editing: boolean): void {
    if (this.disposed) return;
    this.desiredTableEditing = editing;
    this.tableEditingRevision++;
    this.schedule();
  }

  resize(size: readonly [number, number]): void {
    if (this.disposed) return;
    this.desiredResize = size;
    this.resizeRevision++;
    this.schedule();
  }

  requestRender(time: number): void {
    if (this.disposed) return;
    if (!Number.isFinite(time)) throw new RangeError("render time must be finite");
    this.pendingRenderTime = Math.max(time, this.pendingRenderTime ?? time, this.lastRenderTime);
    this.schedule();
  }

  settled(): Promise<void> {
    if (!this.scheduled && !this.running) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scheduled = false;
    this.pendingRenderTime = undefined;
    if (!this.running) this.resolveWaiters();
  }

  private hasWork(): boolean {
    return this.pendingRenderTime !== undefined
      || this.appliedResizeRevision !== this.resizeRevision
      || this.appliedViewRevision !== this.viewRevision
      || this.appliedGridRevision !== this.gridRevision
      || this.appliedTableEditingRevision !== this.tableEditingRevision
      || this.appliedSnapshotRevision !== this.snapshotRevision;
  }

  private schedule(): void {
    if (this.disposed || this.scheduled || this.running) return;
    this.scheduled = true;
    queueMicrotask(() => void this.drain());
  }

  private async drain(): Promise<void> {
    if (this.disposed) {
      this.scheduled = false;
      this.resolveWaiters();
      return;
    }
    if (this.running) return;
    this.scheduled = false;
    this.running = true;
    let failed = false;
    try {
      while (!this.disposed && this.hasWork()) {
        if (this.appliedResizeRevision !== this.resizeRevision && this.desiredResize) {
          const revision = this.resizeRevision;
          this.adapter.resize(this.desiredResize);
          this.appliedResizeRevision = revision;
        }
        if (this.appliedViewRevision !== this.viewRevision) {
          const revision = this.viewRevision;
          this.adapter.setView(this.desiredView);
          this.appliedViewRevision = revision;
        }
        if (this.appliedGridRevision !== this.gridRevision) {
          const revision = this.gridRevision;
          this.adapter.setGridVisible(this.desiredGridVisible);
          this.appliedGridRevision = revision;
        }
        if (this.appliedTableEditingRevision !== this.tableEditingRevision) {
          const revision = this.tableEditingRevision;
          this.adapter.setTableEditing(this.desiredTableEditing);
          this.appliedTableEditingRevision = revision;
        }
        if (this.appliedSnapshotRevision !== this.snapshotRevision) {
          const revision = this.snapshotRevision;
          const snapshot = this.desiredSnapshot;
          const isCurrent = () => !this.disposed && revision === this.snapshotRevision;
          if (!this.adapter.resourcesCurrent(snapshot)) {
            const synchronized = await this.adapter.synchronizeResources(snapshot, isCurrent);
            if (!synchronized || !isCurrent()) continue;
          }
          this.adapter.setSnapshot(snapshot);
          this.appliedSnapshotRevision = revision;
        }
        if (this.disposed) return;
        if (this.appliedResizeRevision !== this.resizeRevision
          || this.appliedViewRevision !== this.viewRevision
          || this.appliedGridRevision !== this.gridRevision
          || this.appliedTableEditingRevision !== this.tableEditingRevision
          || this.appliedSnapshotRevision !== this.snapshotRevision) continue;
        if (this.pendingRenderTime !== undefined) {
          const time = this.pendingRenderTime;
          this.pendingRenderTime = undefined;
          await this.adapter.render(time);
          this.lastRenderTime = time;
        }
      }
    } catch (error) {
      failed = true;
      this.onError(error);
    } finally {
      this.running = false;
      if (!this.disposed && !failed && this.hasWork()) {
        this.schedule();
      } else {
        this.resolveWaiters();
      }
    }
  }

  private resolveWaiters(): void {
    const waiters = this.waiters;
    this.waiters = [];
    waiters.forEach((resolve) => resolve());
  }
}
