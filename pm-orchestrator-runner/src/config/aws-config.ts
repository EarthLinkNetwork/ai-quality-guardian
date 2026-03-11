/**
 * AWS Configuration - Centralized AWS credentials and region management
 *
 * Hardcodes the "Berry" AWS profile for local development.
 * In Lambda environments, uses IAM Role (no profile needed).
 */

import { fromIni } from '@aws-sdk/credential-providers';
import type { AwsCredentialIdentityProvider } from '@aws-sdk/types';

const AWS_PROFILE = 'berry';
const AWS_REGION = 'us-east-1';

/**
 * Check if running in AWS Lambda environment
 */
export function isLambdaEnvironment(): boolean {
  return !!process.env.AWS_LAMBDA_FUNCTION_NAME;
}

/**
 * Get AWS credentials provider
 * - Lambda: returns undefined (uses IAM Role automatically)
 * - Local: uses Berry profile via fromIni
 */
export function getAwsCredentials(): AwsCredentialIdentityProvider | undefined {
  if (isLambdaEnvironment()) {
    return undefined;
  }
  return fromIni({ profile: AWS_PROFILE });
}

/**
 * Get AWS region
 * - Lambda: uses AWS_REGION env var (set by Lambda runtime)
 * - Local: returns hardcoded us-east-1
 */
export function getAwsRegion(): string {
  if (isLambdaEnvironment() && process.env.AWS_REGION) {
    return process.env.AWS_REGION;
  }
  return AWS_REGION;
}

/**
 * Get the AWS profile name (for display/logging)
 */
export function getAwsProfile(): string {
  return AWS_PROFILE;
}
