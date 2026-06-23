import { useEffect, useRef } from 'react';

// 把任意值同步到一个稳定 ref，用来跨闭包读取最新值（Phaser scene 等保持
// 单例时尤其有用）——避免重复书写「effect 同步 + ref」样板。
export const useLatestRef = (value) => {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
};
