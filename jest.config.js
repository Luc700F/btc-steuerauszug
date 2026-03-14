const nextJest = require("next/jest");
const createJestConfig = nextJest({ dir: "./" });

module.exports = createJestConfig({
  testEnvironment: "jest-environment-node",
  testMatch: ["**/__tests__/**/*.test.js"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  transform: {
    "^.+\\.(js|jsx)$": ["babel-jest", { presets: ["next/babel"] }],
  },
});
