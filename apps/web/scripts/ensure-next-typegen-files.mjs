import { mkdirSync, writeFileSync } from "node:fs";

const targetDirectory = ".next/types";
const files = [
  {
    path: `${targetDirectory}/routes.d.ts`,
    contents: "export {};\n",
  },
  {
    path: `${targetDirectory}/validator.ts`,
    contents: "export {};\n",
  },
];

mkdirSync(targetDirectory, {
  recursive: true,
});

for (const file of files) {
  try {
    writeFileSync(file.path, file.contents, {
      encoding: "utf8",
      flag: "wx",
    });
  } catch {
    // If Next already generated the file, keep it untouched.
  }
}
