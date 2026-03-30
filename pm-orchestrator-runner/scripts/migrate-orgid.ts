#!/usr/bin/env npx ts-node
/**
 * Migration Script: Reassign orgId for tenant isolation
 *
 * 1. Scan DynamoDB for all projects with orgId='default'
 * 2. Projects with /Users/mutsumin/ path → reassign to orgId='mutsumin'
 * 3. Import local JSON projects → assign orgId='uehara'
 *
 * Usage:
 *   npx ts-node scripts/migrate-orgid.ts [--dry-run]
 */

import {
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import * as fs from 'fs';
import * as path from 'path';
import { getAwsCredentials, getAwsRegion } from '../src/config/aws-config';

const TABLE_NAME = 'pm-project-indexes';
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(`=== OrgId Migration Script ===`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log('');

  // Initialize DynamoDB client
  const region = getAwsRegion();
  const credentials = getAwsCredentials();
  const clientConfig: any = { region };
  if (credentials) clientConfig.credentials = credentials;

  const rawClient = new DynamoDBClient(clientConfig);
  const docClient = DynamoDBDocumentClient.from(rawClient);

  // Step 1: Scan all existing records
  console.log('Step 1: Scanning DynamoDB table...');
  const scanResult = await docClient.send(new ScanCommand({
    TableName: TABLE_NAME,
  }));

  const items = scanResult.Items || [];
  console.log(`  Found ${items.length} records`);

  // Step 2: Categorize and reassign
  console.log('\nStep 2: Categorizing records...');

  const mutsumin: any[] = [];
  const others: any[] = [];

  for (const item of items) {
    const projectPath = item.projectPath || '';
    if (projectPath.includes('/Users/mutsumin/') || projectPath.includes('/mutsumin/')) {
      mutsumin.push(item);
    } else {
      others.push(item);
    }
  }

  console.log(`  mutsumin projects: ${mutsumin.length}`);
  console.log(`  other projects: ${others.length}`);

  // Reassign mutsumin projects
  if (mutsumin.length > 0) {
    console.log('\nStep 2a: Reassigning mutsumin projects...');
    for (const item of mutsumin) {
      const oldPK = item.PK;
      const newPK = `ORG#mutsumin`;
      const sk = item.SK;

      console.log(`  ${item.projectPath}`);
      console.log(`    PK: ${oldPK} → ${newPK}`);

      if (!DRY_RUN) {
        // Delete old record
        await docClient.send(new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { PK: oldPK, SK: sk },
        }));

        // Insert with new PK and orgId
        const newItem = { ...item, PK: newPK, orgId: 'mutsumin' };
        await docClient.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: newItem,
        }));
        console.log(`    ✓ Migrated`);
      } else {
        console.log(`    [DRY RUN] Would migrate`);
      }
    }
  }

  // Step 3: Import local JSON projects for uehara
  console.log('\nStep 3: Importing local projects for uehara...');

  // Find the state directory with local projects
  const possibleStateDirs = [
    path.join(process.cwd(), '.claude', 'state', 'default', 'projects'),
    path.join(process.cwd(), '.claude', 'projects'),
    path.join(process.cwd(), 'state', 'projects'),
  ];

  // Also check if stateDir is passed as env
  if (process.env.STATE_DIR) {
    possibleStateDirs.unshift(path.join(process.env.STATE_DIR, 'projects'));
  }

  let localProjectsDir: string | null = null;
  for (const dir of possibleStateDirs) {
    if (fs.existsSync(dir)) {
      localProjectsDir = dir;
      break;
    }
  }

  if (!localProjectsDir) {
    console.log('  No local projects directory found. Checked:');
    possibleStateDirs.forEach(d => console.log(`    - ${d}`));
    console.log('  Set STATE_DIR env var to specify the state directory.');
  } else {
    console.log(`  Found local projects at: ${localProjectsDir}`);

    const jsonFiles = fs.readdirSync(localProjectsDir).filter(f => f.endsWith('.json'));
    console.log(`  Found ${jsonFiles.length} local project files`);

    for (const file of jsonFiles) {
      const filePath = path.join(localProjectsDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const project = JSON.parse(content);

      // Check if already in DynamoDB
      const existingInDB = items.find(i =>
        i.projectId === project.projectId || i.projectPath === project.projectPath
      );

      if (existingInDB) {
        console.log(`  SKIP: ${project.alias || project.projectPath} (already in DynamoDB)`);
        continue;
      }

      // Assign to uehara
      const newPK = `ORG#uehara`;
      const sk = `PIDX#${project.projectId}`;

      console.log(`  IMPORT: ${project.alias || project.projectPath}`);
      console.log(`    PK: ${newPK}, SK: ${sk}`);

      if (!DRY_RUN) {
        const newItem = {
          ...project,
          PK: newPK,
          SK: sk,
          orgId: 'uehara',
        };
        // Remove any undefined values that DynamoDB can't handle
        Object.keys(newItem).forEach(key => {
          if (newItem[key] === undefined) delete newItem[key];
        });

        await docClient.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: newItem,
        }));
        console.log(`    ✓ Imported`);
      } else {
        console.log(`    [DRY RUN] Would import`);
      }
    }
  }

  console.log('\n=== Migration Complete ===');
  if (DRY_RUN) {
    console.log('This was a DRY RUN. Run without --dry-run to apply changes.');
  }
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
