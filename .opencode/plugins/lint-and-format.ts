import type { Plugin } from "@opencode-ai/plugin";

export const LintAndFormatPlugin: Plugin = async ({ $, directory }) => {
  return {
    "file.edited": async ({ filePath }) => {
      const ext = filePath.split(".").pop();
      if (ext === "ts" || ext === "tsx" || ext === "css") {
        await $`cd ${directory} && npm run format -- --write "${filePath}"`;
        await $`cd ${directory} && npm run lint -- --fix "${filePath}"`;
      }
    },
  };
};
