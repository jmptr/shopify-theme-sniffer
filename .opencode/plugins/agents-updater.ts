import type { Plugin } from "@opencode-ai/plugin";

export const AgentsUpdaterPlugin: Plugin = async ({ client }) => {
  let hasEdits = false;

  return {
    "file.edited": async ({ filePath }) => {
      if (
        filePath.includes("AGENTS.md") ||
        filePath.includes(".opencode/")
      ) {
        return;
      }

      hasEdits = true;
    },
    "session.idle": async () => {
      if (hasEdits) {
        await client.app.log({
          body: {
            service: "agents-updater",
            level: "info",
            message: "Code changes detected. Consider updating AGENTS.md to document the changes.",
          },
        });
        hasEdits = false;
      }
    },
  };
};
