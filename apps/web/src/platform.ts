/** A browser fallback, deliberately separate from any future official QQ SDK. */
export const platform = {
  label: '浏览器演示',
  capabilities: {
    qqLogin: false,
    musicLibrary: false,
    hostPlayback: false,
    hostShare: false,
  },
  async copyRoom(code: string) {
    try {
      if (!navigator.clipboard?.writeText) return false;
      await navigator.clipboard.writeText(code);
      return true;
    } catch {
      // HTTP LAN pages and denied clipboard permission still support manual sharing.
      return false;
    }
  },
  pauseAudio() {
    document.querySelectorAll('audio').forEach((audio) => audio.pause());
  },
};

/** getRandomValues remains available on a local HTTP demo; randomUUID requires a secure context. */
export function newActionId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
