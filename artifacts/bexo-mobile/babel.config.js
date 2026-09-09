module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    // Reanimated 4 ships its Babel plugin in react-native-worklets, not in
    // react-native-reanimated. Must stay last in the plugin list.
    plugins: ["react-native-worklets/plugin"],
  };
};
