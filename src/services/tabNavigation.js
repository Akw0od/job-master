const tabNavigationKeys = new Set(["ArrowLeft", "ArrowRight", "Home", "End"]);

export function getNextTabKey(tabKeys, activeKey, keyboardKey) {
  const keys = Array.isArray(tabKeys) ? tabKeys : [];
  const currentIndex = keys.indexOf(activeKey);

  if (currentIndex < 0 || !tabNavigationKeys.has(keyboardKey)) return null;
  if (keyboardKey === "Home") return keys[0] ?? null;
  if (keyboardKey === "End") return keys[keys.length - 1] ?? null;

  const direction = keyboardKey === "ArrowRight" ? 1 : -1;
  return keys[(currentIndex + direction + keys.length) % keys.length] ?? null;
}
