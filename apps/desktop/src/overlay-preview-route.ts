export function isOverlayPreviewRoute(pathname: string, isDevelopment: boolean): boolean {
  return isDevelopment && pathname === "/overlay-preview";
}
