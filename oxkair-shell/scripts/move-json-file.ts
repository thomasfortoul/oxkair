import * as fs from 'fs';
import * as path from 'path';

async function moveJsonFile(sourceFilePath: string, targetDirectoryPath: string) {
  if (!sourceFilePath || !targetDirectoryPath) {
    console.error('Usage: ts-node move-json-file.ts <sourceFilePath> <targetDirectoryPath>');
    process.exit(1);
  }

  const sourceFileName = path.basename(sourceFilePath);
  const targetFilePath = path.join(targetDirectoryPath, sourceFileName);

  try {
    // Check if source file exists
    await fs.promises.access(sourceFilePath, fs.constants.F_OK);

    // Ensure target directory exists, create if not
    await fs.promises.mkdir(targetDirectoryPath, { recursive: true });

    // Move the file
    await fs.promises.rename(sourceFilePath, targetFilePath);
    console.log(`Successfully moved '${sourceFilePath}' to '${targetFilePath}'`);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.error(`Error: Source file not found at '${sourceFilePath}'`);
    } else {
      console.error(`Error moving file: ${error.message}`);
    }
    process.exit(1);
  }
}

// Get arguments from command line
const args = process.argv.slice(2);
const source = args[0];
const target = args[1];

moveJsonFile(source, target);