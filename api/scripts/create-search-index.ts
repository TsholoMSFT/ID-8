import { getBlobServiceClient } from "../src/lib/storage-clients";
import { KNOWLEDGE_CONTAINER } from "../src/lib/knowledge-index";

getBlobServiceClient().getContainerClient(KNOWLEDGE_CONTAINER).createIfNotExists()
  .then(() => console.log(`Private Blob container '${KNOWLEDGE_CONTAINER}' is ready. Run seed-search.ts or migrate-knowledge.ts.`))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Knowledge container creation failed.");
    process.exitCode = 1;
  });
