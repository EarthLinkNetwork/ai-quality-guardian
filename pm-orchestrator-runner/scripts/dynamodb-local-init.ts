#!/usr/bin/env ts-node
/**
 * DynamoDB Local Initialization Script
 * Per spec/20_QUEUE_STORE.md
 *
 * Creates the pm-runner-queue table with required GSIs.
 *
 * Prerequisites:
 *   docker run -p 8000:8000 amazon/dynamodb-local
 *
 * Usage:
 *   npx ts-node scripts/dynamodb-local-init.ts
 *   npm run dynamodb:local:init
 */

import { QueueStore } from '../src/queue';

async function main() {
  const endpoint = process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000';
  const tableName = process.env.DYNAMODB_TABLE || 'pm-runner-queue';

  console.log('='.repeat(60));
  console.log('DynamoDB Local Initialization');
  console.log('='.repeat(60));
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Table: ${tableName}`);
  console.log('');

  const store = new QueueStore({
    endpoint,
    tableName,
  });

  try {
    // Check if table exists
    const exists = await store.tableExists();

    if (exists) {
      console.log(`[OK] Table '${tableName}' already exists`);
    } else {
      console.log(`[...] Creating table '${tableName}'...`);
      await store.createTable();
      console.log(`[OK] Table '${tableName}' created successfully`);
    }

    // Verify table structure
    console.log('');
    console.log('Table Structure:');
    console.log('  - Primary Key: task_id (HASH)');
    console.log('  - GSI: session-index (session_id HASH, created_at RANGE)');
    console.log('  - GSI: status-index (status HASH, created_at RANGE)');

    console.log('');
    console.log('='.repeat(60));
    console.log('[DONE] DynamoDB Local initialization complete');
    console.log('='.repeat(60));

    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('[ERROR] Failed to initialize DynamoDB Local');
    console.error('');

    if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
      console.error('DynamoDB Local is not running. Start it with:');
      console.error('');
      console.error('  docker run -p 8000:8000 amazon/dynamodb-local');
      console.error('');
    } else {
      console.error(error);
    }

    process.exit(1);
  } finally {
    store.destroy();
  }
}

main();
