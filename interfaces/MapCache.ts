export interface MapCache<K, V, O> {
  fetch(key: K, opts?: O): Promise<V>;
  put(key: K, value: V): Promise<void>;
}
