/**
 * Sessions DAL Stub
 * Placeholder for Sessions data access layer
 */
import { Session } from './types';
export interface ListSessionsOptions {
    limit?: number;
    cursor?: string;
}
export interface ListSessionsResult {
    items: Session[];
    cursor?: string;
}
export declare function listSessionsByProject(_orgId: string, _projectPath: string, _options?: ListSessionsOptions): Promise<ListSessionsResult>;
export declare function getSession(_orgId: string, _sessionId: string): Promise<Session | null>;
//# sourceMappingURL=sessions.d.ts.map