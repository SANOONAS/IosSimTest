#!/usr/bin/env node
import { program } from '../src/cli.js';

program.parseAsync(process.argv).catch((err) => {
  console.error(`\x1b[31mError:\x1b[0m ${err.message}`);
  process.exit(1);
});
