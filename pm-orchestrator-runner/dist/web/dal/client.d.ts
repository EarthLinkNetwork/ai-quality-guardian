/**
 * DynamoDB Client Stub
 * Placeholder for DynamoDB client implementation
 */
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
export interface DynamoDBClientConfig {
    region?: string;
    endpoint?: string;
}
export declare function createDynamoDBClient(_config?: DynamoDBClientConfig): any;
export declare const dynamoDBClient: any;
export declare function getDocClient(): DynamoDBDocumentClient;
export declare const TABLES: {
    PROJECT_INDEXES: string;
    TASK_EVENTS: string;
    SESSIONS: string;
    TASKS: string;
};
//# sourceMappingURL=client.d.ts.map