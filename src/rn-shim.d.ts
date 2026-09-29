// Minimal typings so the library typechecks without installing react-native.
declare module "react-native" {
  export const Dimensions: { get(k: "window" | "screen"): { width: number; height: number } };
  export const Platform: { OS: string; Version: string | number };
}
