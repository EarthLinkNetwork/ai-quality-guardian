#!/usr/bin/env node
/**
 * Tiny CLI - A minimal CLI for self-heal integration testing
 *
 * Commands:
 *   sum <a> <b>  - Returns the sum of two numbers
 *   fib <n>      - Returns the nth Fibonacci number
 *
 * Exit codes:
 *   0 - Success
 *   2 - Invalid arguments
 *
 * INTENTIONAL BUGS (for testing self-heal):
 * - sum: Uses string concatenation instead of numeric addition
 * - fib: Off-by-one error in loop
 */
declare function sum(a: number, b: number): number;
declare function fib(n: number): number;
declare function main(): void;
//# sourceMappingURL=tiny-cli.d.ts.map