export interface Cache<K, V> {
  fetch(key: K): Promise<V>;
  save(key: K, value: V): Promise<void>;
}
