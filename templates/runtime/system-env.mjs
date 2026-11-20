export function systemEnv() {
  const allowed = /^(?:Path|SystemRoot|windir|ComSpec|PATHEXT|USERPROFILE|HOME|TEMP|TMP|TMPDIR|LOCALAPPDATA|APPDATA|LANG|LC_ALL|DISPLAY|XAUTHORITY|XDG_RUNTIME_DIR|WAYLAND_DISPLAY|LD_LIBRARY_PATH|PLAYWRIGHT_BROWSERS_PATH|HTTPS?_PROXY|NO_PROXY|NODE_EXTRA_CA_CERTS)$/i;
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => allowed.test(key)));
}
