#!/usr/bin/env node

import { Command } from 'commander';
import prompts from 'prompts';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const program = new Command();

program
  .name('create-whitechain-app')
  .description('Bootstrap a Next.js/React environment pre-configured with Whitechain SDK')
  .argument('[project-name]', 'Name of the project directory')
  .action(async (projectNameArg) => {
    console.log(chalk.blue.bold('\nWelcome to the Whitechain App Generator!\n'));

    let projectName = projectNameArg;

    if (!projectName) {
      const response = await prompts({
        type: 'text',
        name: 'projectName',
        message: 'What is your project named?',
        initial: 'my-whitechain-app',
      });
      projectName = response.projectName;
    }

    if (!projectName) {
      console.log(chalk.red('Project name is required. Exiting.'));
      process.exit(1);
    }

    const targetDir = path.resolve(process.cwd(), projectName);

    if (fs.existsSync(targetDir)) {
      console.log(chalk.red(`\nDirectory ${projectName} already exists. Please choose a different name.\n`));
      process.exit(1);
    }

    console.log(chalk.green(`\nCreating a new Whitechain app in ${chalk.bold(targetDir)}...\n`));
    fs.mkdirSync(targetDir, { recursive: true });

    // 1. Generate package.json
    const packageJson = {
      name: projectName,
      version: "0.1.0",
      private: true,
      scripts: {
        "dev": "next dev",
        "build": "next build",
        "start": "next start",
        "lint": "next lint"
      },
      dependencies: {
        "next": "^14.1.0",
        "react": "^18.2.0",
        "react-dom": "^18.2.0",
        "viem": "^2.8.0",
        "wagmi": "^2.5.7",
        "@tanstack/react-query": "^5.24.1",
        "whitechain-sdk": "latest"
      },
      devDependencies: {
        "@types/node": "^20.11.19",
        "@types/react": "^18.2.57",
        "@types/react-dom": "^18.2.19",
        "typescript": "^5.3.3"
      }
    };

    fs.writeFileSync(
      path.join(targetDir, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );

    // 2. Copy templates
    const templateDir = path.join(__dirname, '../../../cli/templates/react');
    
    if (fs.existsSync(templateDir)) {
      console.log(chalk.blue('Copying template files...'));
      copyRecursiveSync(templateDir, targetDir);
    } else {
      console.warn(chalk.yellow(`Template directory not found at ${templateDir}. Proceeding without templates...`));
    }

    // 3. Install dependencies
    console.log(chalk.blue('\nInstalling dependencies (this might take a minute)...\n'));
    try {
      execSync('npm install', { cwd: targetDir, stdio: 'inherit' });
    } catch (err) {
      console.log(chalk.red('\nFailed to install dependencies. You can run `npm install` manually.'));
    }

    console.log(chalk.green.bold('\nSuccess! Your Whitechain app is ready.'));
    console.log(chalk.white(`\nNavigate to your project:`));
    console.log(chalk.cyan(`  cd ${projectName}`));
    console.log(chalk.cyan(`  npm run dev`));
    console.log(chalk.blue('\nHappy hacking on Whitechain!\n'));
  });

program.parse(process.argv);

// Helper function to copy directories recursively
function copyRecursiveSync(src: string, dest: string) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats && stats.isDirectory();

  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest);
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(
        path.join(src, childItemName),
        path.join(dest, childItemName)
      );
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}
