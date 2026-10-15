/**
 * Compatibility command. Read the existing managed API settings with Azure CLI
 * credentials; never print or copy service keys into the shell.
 */
import { managedSettings } from "./azure-admin";

async function main(): Promise<void> {
  const settings = await managedSettings();
  for (const name of ["AZURE_STORAGE_CONNECTION_STRING", "AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_API_KEY", "AZURE_OPENAI_EMBEDDING_DEPLOYMENT"]) {
    if (settings[name]) process.env[name] = settings[name];
  }
  process.env.AZURE_OPENAI_AUTH_TYPE = "key";
  await import("./seed-search");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Knowledge seed configuration failed.");
  process.exitCode = 1;
});
