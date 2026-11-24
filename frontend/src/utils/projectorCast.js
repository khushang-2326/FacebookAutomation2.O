/**
 * Opens or casts a live stream or CCTV camera to an HDMI / external display.
 * Works seamlessly in both Electron desktop app (native second window on HDMI)
 * and in web browser (opens dedicated full-bleed projector window).
 */
export async function castToExternalDisplay({
  mode = 'ACTIVE_BROADCAST', // 'ACTIVE_BROADCAST' | 'CCTV' | 'WEBCAM' | 'AUTOMATION'
  streamPath = null,
  cameraName = null,
  cameraId = null,
  automationId = null
} = {}) {
  const params = new URLSearchParams();
  params.set('mode', mode);
  if (streamPath) params.set('streamPath', streamPath);
  if (cameraName) params.set('cameraName', cameraName);
  if (cameraId) params.set('cameraId', cameraId);
  if (automationId) params.set('automationId', automationId);

  const route = `/projector?${params.toString()}`;

  // 1. If running in Electron, use native multi-monitor display targeting
  if (window.electronAPI?.castToDisplay) {
    try {
      const res = await window.electronAPI.castToDisplay({ route });
      if (res && res.success) {
        return res;
      }
    } catch (err) {
      console.warn('[castHelper] Electron cast error, falling back to window.open:', err);
    }
  }

  // 2. In web browser or fallback: open dedicated borderless window
  const width = Math.min(1920, window.screen.availWidth || 1280);
  const height = Math.min(1080, window.screen.availHeight || 720);
  // Position to secondary screen if coordinates available
  const left = window.screen.availLeft !== undefined ? window.screen.availLeft : (window.screen.width || 0);
  const top = window.screen.availTop !== undefined ? window.screen.availTop : 0;

  const windowFeatures = `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=no`;

  try {
    const popup = window.open(route, 'HDMI_Projector_Window', windowFeatures);
    if (popup) {
      popup.focus();
      return { success: true, isExternal: false, popup };
    }
  } catch (_) {}

  // Fallback for popup blocker
  window.open(route, '_blank');
  return { success: true, isExternal: false };
}

export async function closeProjectorWindow() {
  if (window.electronAPI?.closeProjector) {
    try {
      return await window.electronAPI.closeProjector();
    } catch (_) {}
  }
  return false;
}

export default castToExternalDisplay;
