import { mkdir, writeFile } from "node:fs/promises";

await mkdir("dist", { recursive: true });
await writeFile(
  "dist/index.html",
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Secret Keeper API</title>
  </head>
  <body>
    <main>
      <h1>Secret Keeper API</h1>
      <p>This service exposes API endpoints for the Secret Keeper chatbot.</p>
    </main>
  </body>
</html>
`,
);
