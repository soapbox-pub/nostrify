import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

/**
 * Copy Markdown source files to dist directory.
 * @see https://llmstxt.org/
 */
function copyMarkdownFiles(srcDir: string, destDir: string): void {
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    // Skip .vitepress directory and other excluded directories
    if (entry.isDirectory() && skipDirs.includes(entry.name)) {
      continue;
    }

    if (entry.isDirectory()) {
      // Create directory in destination if it doesn't exist
      if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, { recursive: true });
      }
      copyMarkdownFiles(srcPath, destPath);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      // Copy markdown file
      fs.copyFileSync(srcPath, destPath);
      console.log(`Copied: ${srcPath} -> ${destPath}`);
    }
  }
}

// Copy markdown files to dist directory
console.log('\nCopying markdown files to dist directory...');
const srcDir = rootDir;
const destDir = path.join(rootDir, '.vitepress/dist');

// Skip copying files from these directories
const skipDirs = ['.git', '.vitepress', 'node_modules', 'scripts'];

// Start copying from the root directory
copyMarkdownFiles(srcDir, destDir);

console.log('\nFinished!');
