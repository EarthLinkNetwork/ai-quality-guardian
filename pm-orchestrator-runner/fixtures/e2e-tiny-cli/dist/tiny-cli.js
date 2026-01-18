#!/usr/bin/env node
"use strict";
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
function sum(a, b) {
    // BUG: String concatenation instead of numeric addition
    // This will return "23" instead of 5 for sum(2, 3)
    return Number(String(a) + String(b));
}
function fib(n) {
    if (n <= 0)
        return 0;
    if (n === 1)
        return 1;
    let prev = 0;
    let curr = 1;
    // BUG: Off-by-one error - should iterate n-1 times, but iterates n times
    for (let i = 0; i <= n; i++) {
        const next = prev + curr;
        prev = curr;
        curr = next;
    }
    return curr;
}
function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.error('Usage: tiny-cli <command> [args]');
        console.error('Commands:');
        console.error('  sum <a> <b>  - Returns the sum of two numbers');
        console.error('  fib <n>      - Returns the nth Fibonacci number');
        process.exit(2);
    }
    const command = args[0];
    switch (command) {
        case 'sum': {
            if (args.length !== 3) {
                console.error('Usage: tiny-cli sum <a> <b>');
                process.exit(2);
            }
            const a = parseInt(args[1], 10);
            const b = parseInt(args[2], 10);
            if (isNaN(a) || isNaN(b)) {
                console.error('Error: Arguments must be numbers');
                process.exit(2);
            }
            console.log(sum(a, b));
            break;
        }
        case 'fib': {
            if (args.length !== 2) {
                console.error('Usage: tiny-cli fib <n>');
                process.exit(2);
            }
            const n = parseInt(args[1], 10);
            if (isNaN(n) || n < 0) {
                console.error('Error: Argument must be a non-negative integer');
                process.exit(2);
            }
            console.log(fib(n));
            break;
        }
        default:
            console.error(`Unknown command: ${command}`);
            console.error('Available commands: sum, fib');
            process.exit(2);
    }
}
main();
//# sourceMappingURL=tiny-cli.js.map