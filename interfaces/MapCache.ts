export interface MapCache<K, V> {
  fetch(key: K): Promise<V>;
  put(key: K, value: V): Promise<void>;
}
