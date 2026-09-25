declare module "*.scss";

// is-hotkey@0.2.0 ships no types (and @plait/core pins that exact peer). Only the
// vendored Slate text editor uses it, and only this function.
declare module "is-hotkey" {
  export function isKeyHotkey(hotkey: string | string[], event: KeyboardEvent | { key: string }): boolean;
}
