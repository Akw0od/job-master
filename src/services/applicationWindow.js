export function reserveApplicationWindow(openWindow) {
  const reserved = openWindow("about:blank", "_blank");
  if (!reserved) return null;
  try {
    // The blank tab is reserved within the click gesture. Clearing opener
    // before an asynchronous verification preserves cross-origin isolation.
    reserved.opener = null;
    return reserved;
  } catch {
    try {
      reserved.close?.();
    } catch {
      // A blocked or already-closed popup needs no further cleanup.
    }
    return null;
  }
}

export function navigateReservedApplicationWindow(reserved, applicationUrl) {
  try {
    if (!reserved || reserved.closed) return false;
    reserved.location.replace(applicationUrl);
    return true;
  } catch {
    return false;
  }
}

export function closeReservedApplicationWindow(reserved) {
  try {
    if (reserved && !reserved.closed) reserved.close();
  } catch {
    // The user may have already closed the reserved tab.
  }
}
