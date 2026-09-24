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
    await navigator.clipboard.writeText(code);
  },
  pauseAudio() {
    document.querySelectorAll('audio').forEach((audio) => audio.pause());
  },
};
