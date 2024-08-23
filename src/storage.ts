"use client";
import { useState, useEffect, useMemo } from "react";

import * as uuid from "uuid";
import * as localForage from "localforage";
import { Subject } from "rxjs/internal/Subject";

class RTStorage<T> {
  private _storage: LocalForage;
  private _localStorage?: Storage;
  private _observable: Subject<{
    key: string;
    value: T | null;
  }>;
  private _name: string;
  private _id: string;
  private _storageChangedEventKey: string;
  private _tabSyncHandler?: (this: Window, ev: StorageEvent) => void;
  private _ready: boolean = false;

  constructor({ name, ...option }: { name: string }) {
    this._name = name;
    this._id = uuid.v4();
    localForage.config({ name: this._name, ...option });
    this._storage = localForage.createInstance({
      name: this._name,
    });
    this._storageChangedEventKey = `${this._name}_storage_changed`;
    this._observable = new Subject();

    if (typeof window !== "undefined") {
      this._localStorage = window.localStorage;
      this._tabSyncHandler = async (event) => {
        if (
          event.key !== null &&
          typeof event.key !== "undefined" &&
          event.key === this._storageChangedEventKey
        ) {
          try {
            const { setter, key } = JSON.parse(event.newValue!);
            if (!setter || setter === this.id) {
              return;
            }
            const value = await this.getItem(key);
            this._observable.next({ key, value });
          } catch (e) {
            /* ignore error */
          }
        }
      };
      window.addEventListener("storage", this._tabSyncHandler);
    }
  }

  async setItem<V extends T>(key: string, value: V) {
    await this.waitForReady();
    await this._storage.setItem(key, value);
    this._observable.next({ key, value });
    this._updateStorageChangeKey(key);
  }

  async getItem<V extends T>(key: string) {
    await this.waitForReady();
    return await this._storage.getItem<V>(key);
  }

  async removeItem(key: string) {
    await this.waitForReady();
    await this._storage.removeItem(key);
    this._observable.next({ key, value: null });
    this._updateStorageChangeKey(key);
  }

  async keys() {
    await this.waitForReady();
    const keys = await this._storage.keys();
    return keys as Array<string>;
  }

  private _updateStorageChangeKey(key: string) {
    this._localStorage?.setItem(
      this._storageChangedEventKey,
      JSON.stringify({
        timestamp: Date.now(),
        key,
        setter: this.id,
      })
    );
  }

  get id() {
    return this._id;
  }

  async waitForReady() {
    if (this._ready) {
      return;
    }
    if (typeof this._storage.ready === "function") {
      await this._storage.ready();
    }
    this._ready = true;
  }

  get $() {
    return this._observable;
  }

  subscribe<V extends T>(
    key: string,
    func: (value: V | null) => void
  ): { unsubscribe: () => void };
  subscribe<V extends T>(
    func: (value: { key: string; value: V | null }) => void
  ): { unsubscribe: () => void };
  subscribe<V extends T>(
    keyOrFunc: ((value: { key: string; value: T | null }) => void) | string,
    func?: (value: V | undefined) => void
  ) {
    if (typeof keyOrFunc === "function") {
      return this._observable.subscribe(keyOrFunc);
    }
    return this._observable.subscribe((e) => {
      if (e.key === keyOrFunc) {
        func!(e.value as V);
      }
    });
  }

  destory() {
    if (this._tabSyncHandler) {
      window.removeEventListener("storage", this._tabSyncHandler);
    }
  }
}

export default function globalStorage<T, B = T>(
  name: string,
  encode: (v: T) => B = (v) => v as unknown as B,
  decode: (v: B) => T = (v) => v as unknown as T
) {
  const storage = new RTStorage<B>({ name });
  const useOneValue = <V extends T = T>(key: string | null) => {
    const [data, setState] = useState<V | null | undefined>(undefined);

    useEffect(() => {
      if (!key) return;
      storage.getItem(key).then((lastData) => {
        if (lastData) {
          setState(decode(lastData) as V);
        } else {
          setState(null);
        }
      });

      const subscription = storage.subscribe(key, (d) =>
        setState(d ? (decode(d) as V) : null)
      );
      return () => {
        subscription.unsubscribe();
      };
    }, [key]);

    const setData = useMemo(() => {
      if (key === null) {
        return async () => {};
      }
      return async (newData: V) => {
        setState(newData);
        await storage.setItem(key, encode(newData));
      };
    }, [key]);

    return [key === null ? null : data, setData] as [
      V | null | undefined,
      (newData: V) => Promise<void>
    ];
  };

  return {
    useAllValues: () => {
      const [data, setState] = useState<Map<string, T>>();

      useEffect(() => {
        function handleStorageChange() {
          storage.keys().then(async (keys: string[]) => {
            const items = new Map<string, T>();
            await Promise.all(
              keys.map(async (k) => {
                const item = await storage.getItem(k);
                if (!item) return;
                items.set(k, decode(item)!);
              })
            );
            setState(items);
          });
        }

        handleStorageChange();
        const subscription = storage.subscribe(handleStorageChange);
        return () => {
          subscription.unsubscribe();
        };
      }, []);

      return data;
    },
    useOneValue,
    createItem: async (key: string, object: T) => {
      await storage.setItem(key, encode(object));
    },
    deleteItem: async (key: string) => {
      await storage.removeItem(key);
    },
    storage,
  };
}
