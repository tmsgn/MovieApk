const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");
const fs = require("fs");
const os = require("os");

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// If pnpm was used with `pnpx dlx` the temporary package may live under
// %LOCALAPPDATA%/pnpm-cache/dlx on Windows. Metro can't compute the SHA-1 for
// files outside its watched folders by default. Add the pnpm dlx cache folder
// to watchFolders when it exists so Metro can read those files.
const watch = config.watchFolders || [];
const pnpmDlx = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, "pnpm-cache", "dlx")
  : path.join(os.homedir(), ".pnpm-store", "dlx");

if (fs.existsSync(pnpmDlx)) {
  watch.push(pnpmDlx);
}

config.watchFolders = watch;

module.exports = withNativeWind(config, { input: "./global.css" });
