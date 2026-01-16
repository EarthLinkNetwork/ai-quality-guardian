# Error Handling

本章は PM Orchestrator Runner におけるすべての失敗状態を定義する。
本章に記載されたエラー分類および挙動以外のエラーハンドリングは一切認められない。

未定義のエラー状態が発生した場合、Runner は即座に停止しなければならない。

## Error Classification System

Runner はすべてのエラーを以下の分類およびコード体系に従って識別しなければならない。
エラーコードを付与できない失敗は仕様違反とする。

## E1xx Project and Configuration Errors

E101 Missing .claude directory  
E102 Invalid project path  
E103 Configuration file missing  
E104 Configuration schema validation failure  
E105 Critical configuration corruption

E1xx エラーが発生した場合、Runner は実行を開始してはならない。

## E2xx Execution Lifecycle Errors

E201 Phase execution failure  
E202 Phase skip attempt  
E203 Invalid phase transition  
E204 Lifecycle violation  
E205 Task decomposition failure

E2xx エラーが発生した場合、Runner は直ちにライフサイクルを停止しなければならない。

## E3xx Evidence Errors

E301 Evidence collection failure  
E302 Evidence validation failure  
E303 Missing evidence artifacts  
E304 Evidence integrity violation  
E305 Evidence format unknown

E3xx エラーが発生した場合、該当タスクおよびセッションは NO_EVIDENCE と判定されなければならない。

## E4xx Locking and Semaphore Errors

E401 Lock order violation  
E402 Lock acquisition failure  
E403 Deadlock detected  
E404 Semaphore limit exceeded  
E405 Resource release failure

E4xx エラーが発生した場合、Runner はすべてのロックおよびセマフォを解放し、処理を停止しなければならない。

## E5xx Claude Integration Errors

E501 Session ID missing  
E502 Session ID mismatch  
E503 Executor validation failure  
E504 Output interception failure  
E505 Communication bypass detected

E5xx エラーが発生した場合、Runner は当該セッションを INVALID と判定しなければならない。

## Error Recovery Strategies

Runner におけるエラー回復は例外的行為であり、常に明示的な制御下でのみ許可される。

## Fail Closed Approach

不明な状態、未分類エラー、曖昧な失敗条件が発生した場合、Runner は即座に実行を停止しなければならない。

自動推測、暗黙的継続、暫定完了は禁止される。
不確実な状態では COMPLETE を返してはならない。

## Evidence Based Recovery

すべての回復操作は Evidence として記録されなければならない。

回復操作は事前承認を必要とする。
回復が失敗した場合、そのセッションは COMPLETE になってはならない。

回復証跡には失敗理由および影響範囲が含まれていなければならない。

## Resource Cleanup

エラー発生時、Runner は以下を必ず実行しなければならない。

すべてのファイルロックの解放  
すべてのセマフォの解放  
未完了 Executor の停止  
証跡書き込みの安全な終了

リソース解放が完了しない状態で実行を継続することは禁止される。
