const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// pnpm monorepo: Metro must be able to see hoisted deps at the workspace root
// and follow symlinks pnpm creates for workspace packages (@workspace/*).
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.unstable_enableSymlinks = true;
config.resolver.disableHierarchicalLookup = false;

// Web-only workaround: Metro's package-exports resolution picks tslib's ESM
// build on the web platform, but framer-motion 6.5.1 (a transitive dep of
// moti, used cross-platform for its AnimatePresence bookkeeping) `require()`s
// it and destructures `.default`, which the ESM build doesn't have — throws
// "Cannot destructure property '__extends' of 'tslib.default'". Forcing
// tslib's own CJS entry point resolves it. Native (iOS/Android) never hits
// this path — Metro's native resolver already picks the right entry there.
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "tslib" && platform === "web") {
    return {
      type: "sourceFile",
      filePath: require.resolve("tslib/tslib.js"),
    };
  }
  return originalResolveRequest
    ? originalResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./global.css" });
