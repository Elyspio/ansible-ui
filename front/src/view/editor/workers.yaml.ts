// Worker entry points re-exported from project files: Vite then bundles them as project modules
// instead of pre-bundling node_modules `?worker` imports (see monaco-yaml README, "Why doesn't it
// work with Vite?").
import "monaco-yaml/yaml.worker.js";
